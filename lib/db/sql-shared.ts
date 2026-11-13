import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AuditEntry,
  Device,
  DownloadTokenRow,
  License,
  Order,
  OrderStatus,
  PairingRow,
  Session,
  User,
} from "./types";

export const SCHEMA_SQL = `CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT,
  amount_brl DOUBLE PRECISION NOT NULL,
  currency TEXT NOT NULL DEFAULT 'BRL',
  status TEXT NOT NULL,
  mp_preference_id TEXT,
  mp_payment_id TEXT UNIQUE,
  created_at TEXT NOT NULL,
  paid_at TEXT
);

CREATE TABLE IF NOT EXISTS licenses (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE,
  key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS download_tokens (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  license_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  downloads_used INTEGER NOT NULL DEFAULT 0,
  max_downloads INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  user_agent TEXT
);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  last_seen_at TEXT,
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS pairings (
  id TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE,
  poll_token_hash TEXT NOT NULL UNIQUE,
  user_id TEXT,
  device_id TEXT,
  device_name TEXT,
  pending_device_token TEXT,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  device_id TEXT,
  action TEXT NOT NULL,
  ip TEXT,
  meta TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tokens_order ON download_tokens (order_id);
CREATE INDEX IF NOT EXISTS idx_orders_payment ON orders (mp_payment_id);
CREATE INDEX IF NOT EXISTS idx_orders_email ON orders (email);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_devices_user ON devices (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log (user_id);
`;

export function loadSchemaFromFile(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    return readFileSync(join(here, "schema.sql"), "utf8");
  } catch {
    return SCHEMA_SQL;
  }
}

export function rowToOrder(row: Record<string, unknown>): Order {
  return {
    id: String(row.id),
    email: String(row.email),
    name: row.name == null ? null : String(row.name),
    amountBrl: Number(row.amount_brl),
    currency: "BRL",
    status: String(row.status) as OrderStatus,
    mpPreferenceId:
      row.mp_preference_id == null ? null : String(row.mp_preference_id),
    mpPaymentId: row.mp_payment_id == null ? null : String(row.mp_payment_id),
    createdAt: String(row.created_at),
    paidAt: row.paid_at == null ? null : String(row.paid_at),
  };
}

export function rowToLicense(row: Record<string, unknown>): License {
  return {
    id: String(row.id),
    orderId: String(row.order_id),
    key: String(row.key),
    createdAt: String(row.created_at),
  };
}

export function rowToToken(row: Record<string, unknown>): DownloadTokenRow {
  return {
    id: String(row.id),
    orderId: String(row.order_id),
    licenseId: String(row.license_id),
    tokenHash: String(row.token_hash),
    expiresAt: String(row.expires_at),
    downloadsUsed: Number(row.downloads_used),
    maxDownloads: Number(row.max_downloads),
    createdAt: String(row.created_at),
  };
}

export function rowToUser(row: Record<string, unknown>): User {
  return {
    id: String(row.id),
    email: String(row.email),
    name: row.name == null ? null : String(row.name),
    passwordHash: String(row.password_hash),
    createdAt: String(row.created_at),
  };
}

export function rowToSession(row: Record<string, unknown>): Session {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    tokenHash: String(row.token_hash),
    expiresAt: String(row.expires_at),
    createdAt: String(row.created_at),
    userAgent: row.user_agent == null ? null : String(row.user_agent),
  };
}

export function rowToDevice(row: Record<string, unknown>): Device {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    name: String(row.name),
    tokenHash: String(row.token_hash),
    createdAt: String(row.created_at),
    lastSeenAt: row.last_seen_at == null ? null : String(row.last_seen_at),
    revokedAt: row.revoked_at == null ? null : String(row.revoked_at),
  };
}

export function rowToPairing(row: Record<string, unknown>): PairingRow {
  return {
    id: String(row.id),
    codeHash: String(row.code_hash),
    pollTokenHash: String(row.poll_token_hash),
    userId: row.user_id == null ? null : String(row.user_id),
    deviceId: row.device_id == null ? null : String(row.device_id),
    deviceName: row.device_name == null ? null : String(row.device_name),
    pendingDeviceToken:
      row.pending_device_token == null ? null : String(row.pending_device_token),
    expiresAt: String(row.expires_at),
    consumedAt: row.consumed_at == null ? null : String(row.consumed_at),
    createdAt: String(row.created_at),
  };
}

export function rowToAudit(row: Record<string, unknown>): AuditEntry {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    deviceId: row.device_id == null ? null : String(row.device_id),
    action: String(row.action),
    ip: row.ip == null ? null : String(row.ip),
    meta: row.meta == null ? null : String(row.meta),
    createdAt: String(row.created_at),
  };
}
