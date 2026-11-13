import { getDatabaseUrl } from "../config";
import { getPostgresClient, type Sql } from "../db/postgres";
import { nowIso } from "../db/types";
import {
  RELAY_HISTORY_LIMIT,
  RELAY_POLL_SLICE_MS,
  isAbortError,
  isDeviceOnline,
  parseJsonField,
  sleep,
  ttlCutoff,
  type RelayDirection,
} from "./protocol";
import type {
  DesktopStatus,
  PullOptions,
  PullResult,
  RelayAdapter,
  RelayKind,
  RelayMessage,
  RelayPushInput,
} from "./types";

type Envelope = {
  kind: RelayKind;
  payload: unknown;
  needsLocalApproval?: boolean;
  from: "browser" | "desktop";
};

function rowToMessage(row: Record<string, unknown>): RelayMessage {
  const env = parseJsonField(row.payload) as Envelope;
  return {
    id: String(row.id),
    seq: Number(row.seq),
    deviceId: String(row.device_id),
    direction: String(row.direction) as RelayDirection,
    kind: (env.kind ?? "event") as RelayKind,
    payload: env.payload ?? {},
    needsLocalApproval: Boolean(env.needsLocalApproval),
    from: env.from === "browser" ? "browser" : "desktop",
    createdAt: String(row.created_at),
  };
}

let lastPurge = 0;

async function maybePurge(sql: Sql): Promise<void> {
  const now = Date.now();
  if (now - lastPurge < 60_000) return;
  lastPurge = now;
  const cutoff = ttlCutoff();
  await sql`DELETE FROM remote_messages WHERE created_at < ${cutoff}`;
}

async function nextSeq(sql: Sql, deviceId: string): Promise<number> {
  const rows = (await sql`
    INSERT INTO remote_seq (device_id, last_seq) VALUES (${deviceId}, 1)
    ON CONFLICT (device_id) DO UPDATE SET last_seq = remote_seq.last_seq + 1
    RETURNING last_seq
  `) as Array<{ last_seq: number | string }>;
  return Number(rows[0]?.last_seq ?? 1);
}

async function push(
  sql: Sql,
  deviceId: string,
  direction: RelayDirection,
  message: RelayPushInput,
): Promise<RelayMessage> {
  await maybePurge(sql);
  const seq = await nextSeq(sql, deviceId);
  const id = crypto.randomUUID();
  const createdAt = nowIso();
  const envelope: Envelope = {
    kind: message.kind,
    payload: message.payload,
    needsLocalApproval: message.needsLocalApproval,
    from: message.from,
  };
  const payloadJson = JSON.stringify(envelope);
  await sql`
    INSERT INTO remote_messages (id, device_id, direction, seq, payload, created_at)
    VALUES (${id}, ${deviceId}, ${direction}, ${seq}, ${payloadJson}::jsonb, ${createdAt})
  `;
  return {
    id,
    seq,
    deviceId,
    direction,
    kind: message.kind,
    payload: message.payload,
    needsLocalApproval: message.needsLocalApproval,
    from: message.from,
    createdAt,
  };
}

async function select(
  sql: Sql,
  deviceId: string,
  opts: PullOptions,
  direction: RelayDirection | "both",
): Promise<PullResult> {
  const after = opts.afterSeq ?? 0;
  const limit = opts.limit ?? RELAY_HISTORY_LIMIT;
  const history = Boolean(opts.history) && after <= 0;
  let rows: unknown[];
  if (history) {
    if (direction === "both") {
      rows = await sql`
        SELECT * FROM (
          SELECT * FROM remote_messages
          WHERE device_id = ${deviceId}
          ORDER BY seq DESC
          LIMIT ${limit}
        ) AS recent
        ORDER BY seq ASC
      `;
    } else {
      rows = await sql`
        SELECT * FROM (
          SELECT * FROM remote_messages
          WHERE device_id = ${deviceId} AND direction = ${direction}
          ORDER BY seq DESC
          LIMIT ${limit}
        ) AS recent
        ORDER BY seq ASC
      `;
    }
  } else if (direction === "both") {
    rows = await sql`
      SELECT * FROM remote_messages
      WHERE device_id = ${deviceId} AND seq > ${after}
      ORDER BY seq ASC
      LIMIT ${limit}
    `;
  } else {
    rows = await sql`
      SELECT * FROM remote_messages
      WHERE device_id = ${deviceId} AND direction = ${direction} AND seq > ${after}
      ORDER BY seq ASC
      LIMIT ${limit}
    `;
  }
  const messages = (rows as Record<string, unknown>[]).map(rowToMessage);
  if (messages.length) {
    const ids = messages.map((m) => m.id);
    // postgres.js: any($ids::text[]) — pass as array via unnest
    await sql`
      UPDATE remote_messages
      SET delivered_at = ${nowIso()}
      WHERE delivered_at IS NULL
        AND id = ANY(${ids})
    `;
  }
  const maxRow = (await sql`
    SELECT last_seq FROM remote_seq WHERE device_id = ${deviceId}
  `) as Array<{ last_seq: number | string }>;
  const lastKnown = Number(maxRow[0]?.last_seq ?? 0);
  let lastSeq = after;
  for (const m of messages) if (m.seq > lastSeq) lastSeq = m.seq;
  if (history || lastSeq === 0) lastSeq = Math.max(lastSeq, lastKnown);
  return { messages, lastSeq };
}

async function pull(
  sql: Sql,
  deviceId: string,
  opts: PullOptions = {},
  direction: RelayDirection | "both",
): Promise<PullResult> {
  const waitMs = opts.waitMs ?? 0;
  const deadline = Date.now() + waitMs;
  for (;;) {
    const result = await select(sql, deviceId, opts, direction);
    if (result.messages.length > 0 || Date.now() >= deadline || waitMs <= 0) {
      return result;
    }
    const slice = Math.min(RELAY_POLL_SLICE_MS, Math.max(0, deadline - Date.now()));
    if (slice <= 0) return result;
    try {
      await sleep(slice, opts.signal);
    } catch (err) {
      if (isAbortError(err)) return select(sql, deviceId, opts, direction);
      throw err;
    }
  }
}

async function touch(sql: Sql, deviceId: string): Promise<void> {
  const now = nowIso();
  await sql`UPDATE devices SET last_seen_at = ${now} WHERE id = ${deviceId}`;
}

async function statusOf(sql: Sql, deviceId: string): Promise<DesktopStatus> {
  const rows = (await sql`
    SELECT last_seen_at FROM devices WHERE id = ${deviceId}
  `) as Array<{ last_seen_at: string | null }>;
  const lastSeenAt = rows[0]?.last_seen_at ?? null;
  return { deviceId, online: isDeviceOnline(lastSeenAt), lastSeenAt };
}

/** Relé backed pelo Neon/Postgres já ligado ao projeto. */
export function createPostgresRelay(client?: Sql): RelayAdapter {
  const ready = (async () => {
    if (client) return client;
    const url = getDatabaseUrl();
    if (!url) throw new Error("DATABASE_URL ausente para o relé postgres");
    return getPostgresClient(url);
  })();

  return {
    async setDesktopOnline(deviceId, online) {
      if (!online) return;
      const sql = await ready;
      await touch(sql, deviceId);
    },
    async isDesktopOnline(deviceId) {
      const sql = await ready;
      return (await statusOf(sql, deviceId)).online;
    },
    async getStatus(deviceId) {
      const sql = await ready;
      return statusOf(sql, deviceId);
    },
    async pushToDevice(deviceId, message) {
      const sql = await ready;
      return push(sql, deviceId, "down", message);
    },
    async pullForDevice(deviceId, opts) {
      const sql = await ready;
      await touch(sql, deviceId);
      return pull(sql, deviceId, opts, "down");
    },
    async pushToPainel(deviceId, message) {
      const sql = await ready;
      await touch(sql, deviceId);
      return push(sql, deviceId, "up", message);
    },
    async pullForPainel(deviceId, opts) {
      const sql = await ready;
      return pull(sql, deviceId, opts, "both");
    },
    async purgeExpired(now) {
      const sql = await ready;
      const cutoff = ttlCutoff(now);
      const rows = (await sql`
        DELETE FROM remote_messages WHERE created_at < ${cutoff}
        RETURNING id
      `) as unknown[];
      lastPurge = Date.now();
      return rows.length;
    },
  };
}
