import type { ReleaseManifest } from "../release";
import { parseReleaseManifest } from "../release";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import {
  SCHEMA_SQL,
  rowToAudit,
  rowToDevice,
  rowToLicense,
  rowToOrder,
  rowToPairing,
  rowToSession,
  rowToToken,
  rowToUser,
} from "./sql-shared";
import type {
  DownloadTokenRow,
  License,
  NewOrderInput,
  Order,
  Store,
} from "./types";
import { nowIso } from "./types";

let singleton: { path: string; db: DatabaseSync; store: Store } | null = null;

function openDb(path: string): DatabaseSync {
  const abs = isAbsolute(path) ? path : resolve(process.cwd(), path);
  mkdirSync(dirname(abs), { recursive: true });
  const db = new DatabaseSync(abs);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA_SQL);
  return db;
}

export function createSqliteStore(path: string): Store {
  const db = openDb(path);
  return wrap(db);
}

export function getSqliteStore(path: string): Store {
  if (singleton && singleton.path === path) return singleton.store;
  const db = openDb(path);
  const store = wrap(db);
  singleton = { path, db, store };
  return store;
}

function wrap(db: DatabaseSync): Store {
  return {
    async createOrder(input: NewOrderInput): Promise<Order> {
      const createdAt = nowIso();
      db.prepare(
        `INSERT INTO orders (id, email, name, amount_brl, currency, status, created_at)
         VALUES (?, ?, ?, ?, 'BRL', 'pending', ?)`,
      ).run(input.id, input.email.toLowerCase(), input.name ?? null, input.amountBrl, createdAt);
      const order = await this.getOrderById(input.id);
      if (!order) throw new Error("falha ao criar pedido");
      return order;
    },

    async getOrderById(id) {
      const row = db.prepare(`SELECT * FROM orders WHERE id = ?`).get(id);
      return row ? rowToOrder(row as Record<string, unknown>) : null;
    },

    async getOrderByPaymentId(paymentId) {
      const row = db
        .prepare(`SELECT * FROM orders WHERE mp_payment_id = ?`)
        .get(paymentId);
      return row ? rowToOrder(row as Record<string, unknown>) : null;
    },

    async getOrdersByEmail(email) {
      const rows = db
        .prepare(`SELECT * FROM orders WHERE email = ? ORDER BY created_at DESC`)
        .all(email.toLowerCase()) as Record<string, unknown>[];
      return rows.map(rowToOrder);
    },

    async setPreferenceId(orderId, preferenceId) {
      db.prepare(`UPDATE orders SET mp_preference_id = ? WHERE id = ?`).run(
        preferenceId,
        orderId,
      );
    },

    async markPaid(orderId, paymentId, paidAt) {
      const paid = nowIso(paidAt ?? new Date());
      db.prepare(
        `UPDATE orders SET status = 'paid', mp_payment_id = ?, paid_at = ? WHERE id = ?`,
      ).run(paymentId, paid, orderId);
      const order = await this.getOrderById(orderId);
      if (!order) throw new Error("pedido não encontrado");
      return order;
    },

    async markFailed(orderId) {
      db.prepare(
        `UPDATE orders SET status = 'failed' WHERE id = ? AND status != 'paid'`,
      ).run(orderId);
    },

    async createLicense(orderId, key) {
      const existing = await this.getLicenseByOrderId(orderId);
      if (existing) return existing;
      const id = crypto.randomUUID();
      const createdAt = nowIso();
      db.prepare(
        `INSERT INTO licenses (id, order_id, key, created_at) VALUES (?, ?, ?, ?)`,
      ).run(id, orderId, key, createdAt);
      return { id, orderId, key, createdAt };
    },

    async getLicenseByOrderId(orderId) {
      const row = db
        .prepare(`SELECT * FROM licenses WHERE order_id = ?`)
        .get(orderId);
      return row ? rowToLicense(row as Record<string, unknown>) : null;
    },

    async getLicensesByEmail(email) {
      const rows = db
        .prepare(
          `SELECT l.*, o.email AS order_email FROM licenses l
           JOIN orders o ON o.id = l.order_id
           WHERE o.email = ?`,
        )
        .all(email.toLowerCase()) as Record<string, unknown>[];
      return rows.map((row) => ({
        ...rowToLicense(row),
        orderEmail: String(row.order_email),
      }));
    },

    async createDownloadToken(row) {
      const createdAt = row.createdAt ?? nowIso();
      db.prepare(
        `INSERT INTO download_tokens
          (id, order_id, license_id, token_hash, expires_at, downloads_used, max_downloads, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        row.id,
        row.orderId,
        row.licenseId,
        row.tokenHash,
        row.expiresAt,
        row.downloadsUsed,
        row.maxDownloads,
        createdAt,
      );
      return { ...row, createdAt };
    },

    async getDownloadTokenByHash(hash) {
      const row = db
        .prepare(`SELECT * FROM download_tokens WHERE token_hash = ?`)
        .get(hash);
      return row ? rowToToken(row as Record<string, unknown>) : null;
    },

    async getLatestDownloadToken(orderId) {
      const row = db
        .prepare(
          `SELECT * FROM download_tokens WHERE order_id = ? ORDER BY created_at DESC LIMIT 1`,
        )
        .get(orderId);
      return row ? rowToToken(row as Record<string, unknown>) : null;
    },

    async incrementDownload(tokenId) {
      db.prepare(
        `UPDATE download_tokens SET downloads_used = downloads_used + 1 WHERE id = ?`,
      ).run(tokenId);
      const row = db
        .prepare(`SELECT * FROM download_tokens WHERE id = ?`)
        .get(tokenId);
      if (!row) throw new Error("token não encontrado");
      return rowToToken(row as Record<string, unknown>);
    },

    async totalDownloadsForOrder(orderId) {
      const row = db
        .prepare(
          `SELECT COALESCE(SUM(downloads_used), 0) AS n FROM download_tokens WHERE order_id = ?`,
        )
        .get(orderId) as { n: number } | undefined;
      return Number(row?.n ?? 0);
    },

    async createUser(input) {
      const createdAt = nowIso();
      db.prepare(
        `INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)`,
      ).run(input.id, input.email.toLowerCase(), input.name ?? null, input.passwordHash, createdAt);
      return {
        id: input.id,
        email: input.email.toLowerCase(),
        name: input.name ?? null,
        passwordHash: input.passwordHash,
        createdAt,
      };
    },

    async getUserByEmail(email) {
      const row = db
        .prepare(`SELECT * FROM users WHERE email = ?`)
        .get(email.toLowerCase());
      return row ? rowToUser(row as Record<string, unknown>) : null;
    },

    async getUserById(id) {
      const row = db.prepare(`SELECT * FROM users WHERE id = ?`).get(id);
      return row ? rowToUser(row as Record<string, unknown>) : null;
    },

    async createSession(input) {
      const createdAt = nowIso();
      db.prepare(
        `INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at, user_agent)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        input.id,
        input.userId,
        input.tokenHash,
        input.expiresAt,
        createdAt,
        input.userAgent ?? null,
      );
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
      const row = db
        .prepare(`SELECT * FROM sessions WHERE token_hash = ?`)
        .get(hash);
      return row ? rowToSession(row as Record<string, unknown>) : null;
    },

    async deleteSession(id) {
      db.prepare(`DELETE FROM sessions WHERE id = ?`).run(id);
    },

    async deleteSessionsForUser(userId) {
      db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(userId);
    },

    async createPairing(row) {
      db.prepare(
        `INSERT INTO pairings
          (id, code_hash, poll_token_hash, user_id, device_id, device_name,
           pending_device_token, expires_at, consumed_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        row.id,
        row.codeHash,
        row.pollTokenHash,
        row.userId,
        row.deviceId,
        row.deviceName,
        row.pendingDeviceToken,
        row.expiresAt,
        row.consumedAt,
        row.createdAt,
      );
      return { ...row };
    },

    async getPairingByCodeHash(hash) {
      const row = db
        .prepare(`SELECT * FROM pairings WHERE code_hash = ?`)
        .get(hash);
      return row ? rowToPairing(row as Record<string, unknown>) : null;
    },

    async getPairingByPollHash(hash) {
      const row = db
        .prepare(`SELECT * FROM pairings WHERE poll_token_hash = ?`)
        .get(hash);
      return row ? rowToPairing(row as Record<string, unknown>) : null;
    },

    async confirmPairing(input) {
      const consumedAt = nowIso();
      db.prepare(
        `UPDATE pairings
         SET user_id = ?, device_id = ?, device_name = ?, pending_device_token = ?, consumed_at = ?
         WHERE id = ?`,
      ).run(
        input.userId,
        input.deviceId,
        input.deviceName,
        input.pendingDeviceToken,
        consumedAt,
        input.id,
      );
      const row = db.prepare(`SELECT * FROM pairings WHERE id = ?`).get(input.id);
      if (!row) throw new Error("pareamento não encontrado");
      return rowToPairing(row as Record<string, unknown>);
    },

    async claimPairing(id) {
      const row = db.prepare(`SELECT * FROM pairings WHERE id = ?`).get(id);
      if (!row) throw new Error("pareamento não encontrado");
      const current = rowToPairing(row as Record<string, unknown>);
      db.prepare(`UPDATE pairings SET pending_device_token = NULL WHERE id = ?`).run(id);
      return current;
    },

    async createDevice(input) {
      const createdAt = nowIso();
      db.prepare(
        `INSERT INTO devices (id, user_id, name, token_hash, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(input.id, input.userId, input.name, input.tokenHash, createdAt);
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
      const row = db.prepare(`SELECT * FROM devices WHERE id = ?`).get(id);
      return row ? rowToDevice(row as Record<string, unknown>) : null;
    },

    async getDeviceByTokenHash(hash) {
      const row = db
        .prepare(`SELECT * FROM devices WHERE token_hash = ?`)
        .get(hash);
      return row ? rowToDevice(row as Record<string, unknown>) : null;
    },

    async listDevices(userId) {
      const rows = db
        .prepare(
          `SELECT * FROM devices WHERE user_id = ? ORDER BY created_at DESC`,
        )
        .all(userId) as Record<string, unknown>[];
      return rows.map(rowToDevice);
    },

    async touchDevice(id) {
      db.prepare(`UPDATE devices SET last_seen_at = ? WHERE id = ?`).run(
        nowIso(),
        id,
      );
    },

    async revokeDevice(id, userId) {
      db.prepare(
        `UPDATE devices SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL`,
      ).run(nowIso(), id, userId);
      const row = db.prepare(`SELECT * FROM devices WHERE id = ?`).get(id);
      if (!row) return null;
      const d = rowToDevice(row as Record<string, unknown>);
      return d.userId === userId ? d : null;
    },

    async addAudit(entry) {
      const createdAt = entry.createdAt ?? nowIso();
      db.prepare(
        `INSERT INTO audit_log (id, user_id, device_id, action, ip, meta, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        entry.id,
        entry.userId,
        entry.deviceId,
        entry.action,
        entry.ip,
        entry.meta,
        createdAt,
      );
    },

    async listAudit(userId, limit = 50) {
      const rows = db
        .prepare(
          `SELECT * FROM audit_log WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
        )
        .all(userId, limit) as Record<string, unknown>[];
      return rows.map(rowToAudit);
    },

    async getReleaseManifest() {
      const row = db
        .prepare(`SELECT payload FROM release_manifest WHERE id = ?`)
        .get("current") as { payload: string } | undefined;
      if (!row) return null;
      try {
        return parseReleaseManifest(JSON.parse(row.payload));
      } catch {
        return null;
      }
    },
    async putReleaseManifest(manifest) {
      const payload = JSON.stringify(manifest);
      const updatedAt = nowIso();
      db.prepare(
        `INSERT INTO release_manifest (id, payload, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`,
      ).run("current", payload, updatedAt);
    },
  };
}
