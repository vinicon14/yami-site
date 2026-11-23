import { parseReleaseManifest } from "../release";
import type { ReleaseManifest } from "../release";
import type { NewOrderInput, Order, Store } from "./types";
import { nowIso } from "./types";
import {
  SCHEMA_SQL,
  rowToAudit,
  rowToDevice,
  rowToFeatureRequest,
  rowToLicense,
  rowToOrder,
  rowToPairing,
  rowToSession,
  rowToToken,
  rowToUser,
  rowToUserNotification,
  rowToHistory,
} from "./sql-shared";

export type Sql = {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]>;
  unsafe(query: string): Promise<unknown>;
};

let clientSingleton: { url: string; sql: Sql } | null = null;
let storeSingleton: { url: string; store: Store } | null = null;

const POSTGRES_RELAY_JSONB = `
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'remote_messages'
      AND column_name = 'payload'
      AND data_type = 'text'
  ) THEN
    ALTER TABLE remote_messages
      ALTER COLUMN payload TYPE JSONB USING payload::jsonb;
  END IF;
END $$;
`;

const POSTGRES_PAIRING_EMAIL_COLUMNS = `
ALTER TABLE pairings ADD COLUMN IF NOT EXISTS confirm_token_hash TEXT;
ALTER TABLE pairings ADD COLUMN IF NOT EXISTS email_sent_at TEXT;
ALTER TABLE pairings ADD COLUMN IF NOT EXISTS confirmed_at TEXT;
`;

export async function getPostgresClient(url: string): Promise<Sql> {
  if (clientSingleton && clientSingleton.url === url) return clientSingleton.sql;
  const postgres = (await import("postgres")).default;
  const ssl =
    process.env.DATABASE_SSL === "false"
      ? false
      : url.includes("localhost") || url.includes("127.0.0.1")
        ? false
        : "require";
  const sql = postgres(url, {
    ssl,
    max: 5,
    idle_timeout: 20,
    connect_timeout: 30,
    prepare: false,
  }) as unknown as Sql;
  await ensureSchema(sql);
  clientSingleton = { url, sql };
  return sql;
}

export async function getPostgresStore(url: string): Promise<Store> {
  if (storeSingleton && storeSingleton.url === url) return storeSingleton.store;
  const sql = await getPostgresClient(url);
  const store = wrap(sql);
  storeSingleton = { url, store };
  return store;
}

async function ensureSchema(sql: Sql): Promise<void> {
  await sql.unsafe(SCHEMA_SQL);
  await sql.unsafe(POSTGRES_PAIRING_EMAIL_COLUMNS);
  try {
    await sql.unsafe(POSTGRES_RELAY_JSONB);
  } catch (err) {
    console.warn(
      "yami_relay_jsonb_alter",
      err instanceof Error ? err.message : err,
    );
  }
}

function one(rows: unknown[]): Record<string, unknown> | null {
  const row = rows[0];
  return row ? (row as Record<string, unknown>) : null;
}

function wrap(sql: Sql): Store {
  return {
    async createOrder(input: NewOrderInput): Promise<Order> {
      const createdAt = nowIso();
      const rows = await sql`
        INSERT INTO orders (id, email, name, amount_brl, currency, status, user_id, created_at)
        VALUES (${input.id}, ${input.email.toLowerCase()}, ${input.name ?? null}, ${input.amountBrl}, 'BRL', 'pending', ${input.userId ?? null}, ${createdAt})
        RETURNING *
      `;
      return rowToOrder(one(rows) as Record<string, unknown>);
    },

    async getOrderById(id) {
      const rows = await sql`SELECT * FROM orders WHERE id = ${id}`;
      const row = one(rows);
      return row ? rowToOrder(row) : null;
    },

    async getOrderByPaymentId(paymentId) {
      const rows = await sql`SELECT * FROM orders WHERE mp_payment_id = ${paymentId}`;
      const row = one(rows);
      return row ? rowToOrder(row) : null;
    },

    async getOrdersByEmail(email) {
      const rows = await sql`SELECT * FROM orders WHERE email = ${email.toLowerCase()} ORDER BY created_at DESC`;
      return rows.map((r) => rowToOrder(r as Record<string, unknown>));
    },

    async setPreferenceId(orderId, preferenceId) {
      await sql`UPDATE orders SET mp_preference_id = ${preferenceId} WHERE id = ${orderId}`;
    },

    async markPaid(orderId, paymentId, paidAt) {
      const paid = nowIso(paidAt ?? new Date());
      await sql`UPDATE orders SET status = 'paid', mp_payment_id = ${paymentId}, paid_at = ${paid} WHERE id = ${orderId}`;
      const order = await this.getOrderById(orderId);
      if (!order) throw new Error("pedido não encontrado");
      return order;
    },

    async markFailed(orderId) {
      await sql`UPDATE orders SET status = 'failed' WHERE id = ${orderId} AND status != 'paid'`;
    },

    async createLicense(orderId, key) {
      const existing = await this.getLicenseByOrderId(orderId);
      if (existing) return existing;
      const id = crypto.randomUUID();
      const createdAt = nowIso();
      await sql`INSERT INTO licenses (id, order_id, key, created_at) VALUES (${id}, ${orderId}, ${key}, ${createdAt})`;
      return { id, orderId, key, createdAt };
    },

    async getLicenseByOrderId(orderId) {
      const rows = await sql`SELECT * FROM licenses WHERE order_id = ${orderId}`;
      const row = one(rows);
      return row ? rowToLicense(row) : null;
    },

    async getLicensesByEmail(email) {
      const rows = await sql`
        SELECT l.*, o.email AS order_email FROM licenses l
        JOIN orders o ON o.id = l.order_id
        WHERE o.email = ${email.toLowerCase()}
      `;
      return rows.map((r) => {
        const row = r as Record<string, unknown>;
        return { ...rowToLicense(row), orderEmail: String(row.order_email) };
      });
    },

    async createDownloadToken(row) {
      const createdAt = row.createdAt ?? nowIso();
      await sql`
        INSERT INTO download_tokens
          (id, order_id, license_id, token_hash, expires_at, downloads_used, max_downloads, created_at)
        VALUES (${row.id}, ${row.orderId}, ${row.licenseId}, ${row.tokenHash}, ${row.expiresAt}, ${row.downloadsUsed}, ${row.maxDownloads}, ${createdAt})
      `;
      return { ...row, createdAt };
    },

    async getDownloadTokenByHash(hash) {
      const rows = await sql`SELECT * FROM download_tokens WHERE token_hash = ${hash}`;
      const row = one(rows);
      return row ? rowToToken(row) : null;
    },

    async getLatestDownloadToken(orderId) {
      const rows = await sql`SELECT * FROM download_tokens WHERE order_id = ${orderId} ORDER BY created_at DESC LIMIT 1`;
      const row = one(rows);
      return row ? rowToToken(row) : null;
    },

    async incrementDownload(tokenId) {
      const rows = await sql`
        UPDATE download_tokens SET downloads_used = downloads_used + 1 WHERE id = ${tokenId}
        RETURNING *
      `;
      const row = one(rows);
      if (!row) throw new Error("token não encontrado");
      return rowToToken(row);
    },

    async totalDownloadsForOrder(orderId) {
      const rows = await sql`SELECT COALESCE(SUM(downloads_used), 0) AS n FROM download_tokens WHERE order_id = ${orderId}`;
      return Number((one(rows) as { n: number } | null)?.n ?? 0);
    },

    async createUser(input) {
      const createdAt = nowIso();
      const email = input.email.toLowerCase();
      await sql`INSERT INTO users (id, email, name, password_hash, created_at) VALUES (${input.id}, ${email}, ${input.name ?? null}, ${input.passwordHash}, ${createdAt})`;
      return { id: input.id, email, name: input.name ?? null, passwordHash: input.passwordHash, createdAt };
    },

    async getUserByEmail(email) {
      const rows = await sql`SELECT * FROM users WHERE email = ${email.toLowerCase()}`;
      const row = one(rows);
      return row ? rowToUser(row) : null;
    },

    async getUserById(id) {
      const rows = await sql`SELECT * FROM users WHERE id = ${id}`;
      const row = one(rows);
      return row ? rowToUser(row) : null;
    },

    async listUsers() {
      const rows = await sql`SELECT * FROM users ORDER BY created_at DESC`;
      return rows.map((r) => rowToUser(r as Record<string, unknown>));
    },

    async updateUser(id, input) {
      const current = await this.getUserById(id);
      if (!current) return null;
      await sql`
        UPDATE users SET name = ${input.name !== undefined ? input.name : current.name},
          password_hash = ${input.passwordHash !== undefined ? input.passwordHash : current.passwordHash},
          status = ${input.status !== undefined ? input.status : current.status ?? "ativo"},
          license_id = ${input.licenseId !== undefined ? input.licenseId : current.licenseId ?? null}
        WHERE id = ${id}
      `;
      return this.getUserById(id);
    },

    async updateUserLicense(id, licenseId) {
      await sql`UPDATE users SET license_id = ${licenseId} WHERE id = ${id}`;
    },

    async createSession(input) {
      const createdAt = nowIso();
      await sql`INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at, user_agent) VALUES (${input.id}, ${input.userId}, ${input.tokenHash}, ${input.expiresAt}, ${createdAt}, ${input.userAgent ?? null})`;
      return {
        id: input.id,
        userId: input.userId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        createdAt,
        userAgent: input.userAgent ?? null,
      };
    },

    async getSessionByTokenHash(hash) {
      const rows = await sql`SELECT * FROM sessions WHERE token_hash = ${hash}`;
      const row = one(rows);
      return row ? rowToSession(row) : null;
    },

    async deleteSession(id) {
      await sql`DELETE FROM sessions WHERE id = ${id}`;
    },

    async deleteSessionsForUser(userId) {
      await sql`DELETE FROM sessions WHERE user_id = ${userId}`;
    },

    async createPairing(row) {
      await sql`
        INSERT INTO pairings
          (id, code_hash, poll_token_hash, user_id, device_id, device_name, pending_device_token, confirm_token_hash, email_sent_at, confirmed_at, expires_at, consumed_at, created_at)
        VALUES (${row.id}, ${row.codeHash}, ${row.pollTokenHash}, ${row.userId}, ${row.deviceId}, ${row.deviceName}, ${row.pendingDeviceToken}, ${row.confirmTokenHash}, ${row.emailSentAt}, ${row.confirmedAt}, ${row.expiresAt}, ${row.consumedAt}, ${row.createdAt})
      `;
      return { ...row };
    },

    async getPairingByCodeHash(hash) {
      const rows = await sql`SELECT * FROM pairings WHERE code_hash = ${hash}`;
      const row = one(rows);
      return row ? rowToPairing(row) : null;
    },

    async getPairingByPollHash(hash) {
      const rows = await sql`SELECT * FROM pairings WHERE poll_token_hash = ${hash}`;
      const row = one(rows);
      return row ? rowToPairing(row) : null;
    },

    async getPairingByConfirmHash(hash) {
      const rows = await sql`SELECT * FROM pairings WHERE confirm_token_hash = ${hash}`;
      const row = one(rows);
      return row ? rowToPairing(row) : null;
    },

    async confirmPairing(input) {
      const consumedAt = nowIso();
      const rows = await sql`
        UPDATE pairings
        SET user_id = ${input.userId}, device_id = ${input.deviceId}, device_name = ${input.deviceName},
            pending_device_token = ${input.pendingDeviceToken}, consumed_at = ${consumedAt}
        WHERE id = ${input.id} AND consumed_at IS NULL
        RETURNING id
      `;
      return rows.length > 0;
    },

    async claimPairing(id) {
      const rows = await sql`SELECT * FROM pairings WHERE id = ${id}`;
      const row = one(rows);
      if (!row) throw new Error("pareamento não encontrado");
      const current = rowToPairing(row);
      await sql`UPDATE pairings SET pending_device_token = NULL WHERE id = ${id}`;
      return current;
    },

    async createDevice(input) {
      const createdAt = nowIso();
      await sql`INSERT INTO devices (id, user_id, name, token_hash, created_at) VALUES (${input.id}, ${input.userId}, ${input.name}, ${input.tokenHash}, ${createdAt})`;
      return {
        id: input.id,
        userId: input.userId,
        name: input.name,
        tokenHash: input.tokenHash,
        createdAt,
        lastSeenAt: null,
        revokedAt: null,
      };
    },

    async getDeviceById(id) {
      const rows = await sql`SELECT * FROM devices WHERE id = ${id}`;
      const row = one(rows);
      return row ? rowToDevice(row) : null;
    },

    async getDeviceByTokenHash(hash) {
      const rows = await sql`SELECT * FROM devices WHERE token_hash = ${hash}`;
      const row = one(rows);
      return row ? rowToDevice(row) : null;
    },

    async listDevices(userId) {
      const rows = await sql`SELECT * FROM devices WHERE user_id = ${userId} ORDER BY created_at DESC`;
      return rows.map((r) => rowToDevice(r as Record<string, unknown>));
    },

    async touchDevice(id) {
      const now = nowIso();
      await sql`UPDATE devices SET last_seen_at = ${now} WHERE id = ${id}`;
    },

    async revokeDevice(id, userId) {
      const now = nowIso();
      await sql`UPDATE devices SET revoked_at = ${now} WHERE id = ${id} AND user_id = ${userId} AND revoked_at IS NULL`;
      const rows = await sql`SELECT * FROM devices WHERE id = ${id}`;
      const row = one(rows);
      if (!row) return null;
      const d = rowToDevice(row);
      return d.userId === userId ? d : null;
    },

    async addAudit(entry) {
      const createdAt = entry.createdAt ?? nowIso();
      await sql`INSERT INTO audit_log (id, user_id, device_id, action, ip, meta, created_at) VALUES (${entry.id}, ${entry.userId}, ${entry.deviceId}, ${entry.action}, ${entry.ip}, ${entry.meta}, ${createdAt})`;
    },

    async listAudit(userId, limit = 50) {
      const rows = await sql`SELECT * FROM audit_log WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT ${limit}`;
      return rows.map((r) => rowToAudit(r as Record<string, unknown>));
    },

    async getReleaseManifest() {
      const rows = await sql`SELECT payload FROM release_manifest WHERE id = ${"current"}`;
      const row = one(rows);
      if (!row) return null;
      try {
        return parseReleaseManifest(JSON.parse(String(row.payload)));
      } catch {
        return null;
      }
    },
    async putReleaseManifest(manifest: ReleaseManifest) {
      const payload = JSON.stringify(manifest);
      const updatedAt = nowIso();
      await sql`
        INSERT INTO release_manifest (id, payload, updated_at)
        VALUES (${"current"}, ${payload}, ${updatedAt})
        ON CONFLICT (id) DO UPDATE SET payload = ${payload}, updated_at = ${updatedAt}
      `;
    },
    async addReleaseHistory(entry) {
      const createdAt = entry.createdAt ?? nowIso();
      const payload = JSON.stringify(entry.payload);
      await sql`INSERT INTO release_history (id, kind, payload, uploaded_by_email, uploaded_by_user_id, created_at) VALUES (${entry.id}, ${entry.kind}, ${payload}, ${entry.uploadedByEmail}, ${entry.uploadedByUserId}, ${createdAt})`;
    },
    async listReleaseHistory(kind, limit = 30) {
      const rows = kind
        ? await sql`SELECT * FROM release_history WHERE kind = ${kind} ORDER BY created_at DESC LIMIT ${limit}`
        : await sql`SELECT * FROM release_history ORDER BY created_at DESC LIMIT ${limit}`;
      return rows.map((r) => rowToHistory(r as Record<string, unknown>)).filter((h) => h !== null);
    },
    async getReleaseHistoryById(id) {
      const rows = await sql`SELECT * FROM release_history WHERE id = ${id}`;
      const row = one(rows);
      return row ? rowToHistory(row as Record<string, unknown>) : null;
    },

    async markPaidOnce({ orderId, paymentId, paidAt }) {
      const current = await this.getOrderById(orderId);
      if (!current) return null;
      if (current.mpPaymentId && current.mpPaymentId !== paymentId) return null;
      const changed = !current.mpPaymentId;
      if (changed) {
        const rows = await sql`
          UPDATE orders SET status = 'paid', mp_payment_id = ${paymentId}, paid_at = ${nowIso(paidAt ?? new Date())}
          WHERE id = ${orderId} AND mp_payment_id IS NULL
          RETURNING id
        `;
        if (rows.length === 0) return null;
      }
      const order = await this.getOrderById(orderId);
      return order ? { order, changed } : null;
    },

    async addPaymentEvent(entry) {
      await sql`
        INSERT INTO payment_events (id, order_id, payment_id, event_type, result, reason_code, created_at)
        VALUES (${entry.id}, ${entry.orderId}, ${entry.paymentId}, ${entry.eventType}, ${entry.result}, ${entry.reasonCode}, ${entry.createdAt ?? nowIso()})
      `;
    },

    async createFeatureRequest(input) {
      const now = nowIso();
      const id = crypto.randomUUID();
      await sql`
        INSERT INTO feature_requests
          (id, user_id, title, description, category, status, published_version, admin_note, created_at, updated_at)
        VALUES (${id}, ${input.userId}, ${input.title}, ${input.description}, ${input.category}, 'pendente', NULL, NULL, ${now}, ${now})
      `;
      return (await this.getFeatureRequest(id))!;
    },

    async listFeatureRequests(userId) {
      const rows = userId
        ? await sql`SELECT * FROM feature_requests WHERE user_id = ${userId} ORDER BY created_at DESC`
        : await sql`SELECT * FROM feature_requests ORDER BY created_at DESC`;
      return rows.map((r) => rowToFeatureRequest(r as Record<string, unknown>));
    },

    async getFeatureRequest(id) {
      const rows = await sql`SELECT * FROM feature_requests WHERE id = ${id}`;
      const row = one(rows);
      return row ? rowToFeatureRequest(row) : null;
    },

    async updateFeatureRequest(input) {
      const current = await this.getFeatureRequest(input.id);
      if (!current || current.userId !== input.userId || current.status !== "pendente") return null;
      await sql`
        UPDATE feature_requests SET title = ${input.title}, description = ${input.description},
          category = ${input.category}, updated_at = ${nowIso()} WHERE id = ${input.id}
      `;
      return this.getFeatureRequest(input.id);
    },

    async transitionFeatureRequest(input) {
      const current = await this.getFeatureRequest(input.id);
      if (!current) return null;
      const now = nowIso();
      const publishedVersion =
        input.publishedVersion === undefined ? current.publishedVersion : input.publishedVersion;
      const publishedAssetUrl =
        input.publishedAssetUrl === undefined ? current.publishedAssetUrl : input.publishedAssetUrl;
      const publishedAt = input.publishedAssetUrl === undefined ? current.publishedAt : (input.publishedAssetUrl ? now : null);
      await sql`
        UPDATE feature_requests SET status = ${input.toStatus},
          published_version = ${publishedVersion},
          admin_note = ${input.note ?? current.adminNote},
          published_asset_url = ${publishedAssetUrl},
          published_at = ${publishedAt},
          updated_at = ${now}
        WHERE id = ${input.id}
      `;
      await sql`
        INSERT INTO feature_request_events
          (id, request_id, from_status, to_status, actor_user_id, actor_role, note, created_at)
        VALUES (${crypto.randomUUID()}, ${input.id}, ${current.status}, ${input.toStatus},
                ${input.actorUserId}, ${input.actorRole}, ${input.note ?? null}, ${now})
      `;
      return this.getFeatureRequest(input.id);
    },

    async createUserNotification(input) {
      const id = crypto.randomUUID();
      const createdAt = input.createdAt ?? nowIso();
      await sql`
        INSERT INTO user_notifications
          (id, user_id, kind, title, body, request_id, read_at, created_at, expires_at)
        VALUES (${id}, ${input.userId}, ${input.kind}, ${input.title}, ${input.body},
                ${input.requestId}, NULL, ${createdAt}, ${input.expiresAt})
      `;
      const rows = await sql`SELECT * FROM user_notifications WHERE id = ${id}`;
      return rowToUserNotification(one(rows)!);
    },

    async listUserNotifications(userId, limit = 30) {
      const rows = await sql`SELECT * FROM user_notifications WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT ${limit}`;
      return rows.map((r) => rowToUserNotification(r as Record<string, unknown>));
    },

    async markNotificationRead(id, userId) {
      const rows = await sql`
        UPDATE user_notifications SET read_at = ${nowIso()}
        WHERE id = ${id} AND user_id = ${userId} AND read_at IS NULL
        RETURNING id
      `;
      return rows.length > 0;
    },

    async countUnreadNotifications(userId) {
      const rows = await sql`SELECT COUNT(*)::int AS n FROM user_notifications WHERE user_id = ${userId} AND read_at IS NULL`;
      return Number((one(rows) as { n: number } | null)?.n ?? 0);
    },
  };
}

