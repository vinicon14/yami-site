import {
  RELAY_HISTORY_LIMIT,
  RELAY_POLL_SLICE_MS,
  isAbortError,
  isDeviceOnline,
  sleep,
  ttlCutoff,
} from "./protocol";
import type {
  DesktopStatus,
  PullOptions,
  PullResult,
  RelayAdapter,
  RelayMessage,
  RelayPushInput,
} from "./types";

type Row = RelayMessage & { deliveredAt: string | null };

function nextAfter(messages: RelayMessage[], afterSeq: number): number {
  let last = afterSeq;
  for (const m of messages) if (m.seq > last) last = m.seq;
  return last;
}

export function createMemoryRelay(): RelayAdapter {
  const rows: Row[] = [];
  const seqByDevice = new Map<string, number>();
  const lastSeen = new Map<string, string>();
  const waiters = new Map<string, Array<() => void>>();

  function notify(deviceId: string) {
    const list = waiters.get(deviceId) ?? [];
    waiters.delete(deviceId);
    for (const fn of list) fn();
  }

  function waitFor(deviceId: string, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new DOMException("aborted", "AbortError"));
        return;
      }
      const fn = () => resolve();
      const list = waiters.get(deviceId) ?? [];
      list.push(fn);
      waiters.set(deviceId, list);
      const onAbort = () => {
        const cur = waiters.get(deviceId) ?? [];
        waiters.set(
          deviceId,
          cur.filter((x) => x !== fn),
        );
        reject(new DOMException("aborted", "AbortError"));
      };
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }

  async function push(
    deviceId: string,
    direction: "up" | "down",
    message: RelayPushInput,
  ): Promise<RelayMessage> {
    const seq = (seqByDevice.get(deviceId) ?? 0) + 1;
    seqByDevice.set(deviceId, seq);
    const full: Row = {
      id: crypto.randomUUID(),
      seq,
      deviceId,
      direction,
      kind: message.kind,
      payload: message.payload,
      needsLocalApproval: message.needsLocalApproval,
      from: message.from,
      createdAt: new Date().toISOString(),
      deliveredAt: null,
    };
    rows.push(full);
    notify(deviceId);
    const { deliveredAt: _, ...out } = full;
    void _;
    return out;
  }

  function select(
    deviceId: string,
    opts: PullOptions,
    direction?: "up" | "down" | "both",
  ): PullResult {
    const after = opts.afterSeq ?? 0;
    const limit = opts.limit ?? RELAY_HISTORY_LIMIT;
    const history = Boolean(opts.history) && after <= 0;
    let filtered = rows.filter((r) => r.deviceId === deviceId && r.seq > after);
    if (direction && direction !== "both") {
      filtered = filtered.filter((r) => r.direction === direction);
    }
    filtered.sort((a, b) => a.seq - b.seq);
    if (history) {
      const all = rows
        .filter((r) => r.deviceId === deviceId)
        .sort((a, b) => a.seq - b.seq);
      filtered = all.slice(-limit);
    } else if (filtered.length > limit) {
      filtered = filtered.slice(0, limit);
    }
    const now = new Date().toISOString();
    for (const r of filtered) {
      if (!r.deliveredAt) r.deliveredAt = now;
    }
    const messages = filtered.map(({ deliveredAt: _, ...m }) => {
      void _;
      return m;
    });
    const lastKnown = seqByDevice.get(deviceId) ?? 0;
    return { messages, lastSeq: history ? lastKnown : nextAfter(messages, after) || lastKnown };
  }

  async function pull(
    deviceId: string,
    opts: PullOptions = {},
    direction?: "up" | "down" | "both",
  ): Promise<PullResult> {
    const waitMs = opts.waitMs ?? 0;
    const deadline = Date.now() + waitMs;
    for (;;) {
      const result = select(deviceId, opts, direction);
      if (result.messages.length > 0 || Date.now() >= deadline || waitMs <= 0) {
        return result;
      }
      const slice = Math.min(RELAY_POLL_SLICE_MS, Math.max(0, deadline - Date.now()));
      if (slice <= 0) return result;
      try {
        await Promise.race([
          sleep(slice, opts.signal),
          waitFor(deviceId, opts.signal),
        ]);
      } catch (err) {
        if (isAbortError(err)) return select(deviceId, opts, direction);
        throw err;
      }
    }
  }

  return {
    async setDesktopOnline(deviceId, online) {
      if (online) lastSeen.set(deviceId, new Date().toISOString());
    },
    async isDesktopOnline(deviceId) {
      return isDeviceOnline(lastSeen.get(deviceId) ?? null);
    },
    async getStatus(deviceId): Promise<DesktopStatus> {
      const lastSeenAt = lastSeen.get(deviceId) ?? null;
      return { deviceId, online: isDeviceOnline(lastSeenAt), lastSeenAt };
    },
    async pushToDevice(deviceId, message) {
      return push(deviceId, "down", message);
    },
    async pullForDevice(deviceId, opts) {
      lastSeen.set(deviceId, new Date().toISOString());
      return pull(deviceId, opts, "down");
    },
    async pushToPainel(deviceId, message) {
      lastSeen.set(deviceId, new Date().toISOString());
      return push(deviceId, "up", message);
    },
    async pullForPainel(deviceId, opts) {
      return pull(deviceId, opts, "both");
    },
    async purgeExpired(now) {
      const cutoff = ttlCutoff(now);
      const before = rows.length;
      for (let i = rows.length - 1; i >= 0; i--) {
        if (rows[i]!.createdAt < cutoff) rows.splice(i, 1);
      }
      return before - rows.length;
    },
  };
}
