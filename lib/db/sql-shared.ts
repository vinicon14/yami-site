import { readFileSync } from "node:fs";
import { parseReleaseFile, isReleaseKind } from "../release";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AuditEntry,
  Device,
  FeatureRequest,
  FeatureRequestEvent,
  FeatureRequestStatus,
  PaymentEvent,
  ReleaseHistoryEntry,
  DownloadTokenRow,
  License,
  Order,
  OrderStatus,
  PairingRow,
  Session,
  User,
  UserNotification,
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
  user_id TEXT,
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
  status TEXT NOT NULL DEFAULT 'ativo',
  license_id TEXT,
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
  confirm_token_hash TEXT,
  email_sent_at TEXT,
  confirmed_at TEXT,
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

CREATE TABLE IF NOT EXISTS release_manifest (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS remote_messages (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  direction TEXT NOT NULL,
  seq BIGINT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  delivered_at TEXT,
  UNIQUE (device_id, seq)
);

CREATE TABLE IF NOT EXISTS remote_seq (
  device_id TEXT PRIMARY KEY,
  last_seq BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_remote_undelivered ON remote_messages (device_id, direction, seq);
CREATE INDEX IF NOT EXISTS idx_remote_created ON remote_messages (created_at);
CREATE INDEX IF NOT EXISTS idx_remote_device_seq ON remote_messages (device_id, seq);

CREATE TABLE IF NOT EXISTS release_history (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL,
  uploaded_by_email TEXT NOT NULL,
  uploaded_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_release_history_kind ON release_history (kind, created_at);

CREATE TABLE IF NOT EXISTS feature_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente',
  published_version TEXT,
  admin_note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS feature_request_events (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  request_id TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT
);

CREATE TABLE IF NOT EXISTS payment_events (
  id TEXT PRIMARY KEY,
  order_id TEXT,
  payment_id TEXT,
  event_type TEXT NOT NULL,
  result TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_feature_requests_user ON feature_requests (user_id, status);
CREATE INDEX IF NOT EXISTS idx_feature_request_events_request ON feature_request_events (request_id, created_at);
CREATE INDEX IF NOT EXISTS idx_user_notifications_user ON user_notifications (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_payment_events_order ON payment_events (order_id, created_at);
CREATE INDEX IF NOT EXISTS idx_payment_events_payment ON payment_events (payment_id, created_at);
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
    userId: row.user_id == null ? null : String(row.user_id),
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
    status: row.status == null ? "ativo" : (String(row.status) as "ativo" | "bloqueado"),
    licenseId: row.license_id == null ? null : String(row.license_id),
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
    confirmTokenHash:
      row.confirm_token_hash == null ? null : String(row.confirm_token_hash),
    emailSentAt: row.email_sent_at == null ? null : String(row.email_sent_at),
    confirmedAt: row.confirmed_at == null ? null : String(row.confirmed_at),
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

export function rowToHistory(row: Record<string, unknown>): ReleaseHistoryEntry | null {
  const kind = String(row.kind ?? "");
  if (!isReleaseKind(kind)) return null;
  let parsed: unknown = row.payload;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }
  const payload = parseReleaseFile(kind, parsed);
  if (!payload) return null;
  return {
    id: String(row.id),
    kind,
    payload,
    uploadedByEmail: String(row.uploaded_by_email),
    uploadedByUserId: String(row.uploaded_by_user_id),
    createdAt: String(row.created_at),
  };
}

export function rowToFeatureRequest(row: Record<string, unknown>): FeatureRequest {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    title: String(row.title),
    description: String(row.description),
    category: String(row.category),
    status: String(row.status) as FeatureRequestStatus,
    publishedVersion: row.published_version == null ? null : String(row.published_version),
    adminNote: row.admin_note == null ? null : String(row.admin_note),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function rowToFeatureRequestEvent(row: Record<string, unknown>): FeatureRequestEvent {
  return {
    id: String(row.id),
    requestId: String(row.request_id),
    fromStatus: row.from_status == null ? null : (String(row.from_status) as FeatureRequestStatus),
    toStatus: String(row.to_status) as FeatureRequestStatus,
    actorUserId: String(row.actor_user_id),
    actorRole: String(row.actor_role) as "user" | "admin",
    note: row.note == null ? null : String(row.note),
    createdAt: String(row.created_at),
  };
}

export function rowToUserNotification(row: Record<string, unknown>): UserNotification {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    kind: String(row.kind),
    title: String(row.title),
    body: String(row.body),
    requestId: row.request_id == null ? null : String(row.request_id),
    readAt: row.read_at == null ? null : String(row.read_at),
    createdAt: String(row.created_at),
    expiresAt: row.expires_at == null ? null : String(row.expires_at),
  };
}

export function rowToPaymentEvent(row: Record<string, unknown>): PaymentEvent {
  return {
    id: String(row.id),
    orderId: row.order_id == null ? null : String(row.order_id),
    paymentId: row.payment_id == null ? null : String(row.payment_id),
    eventType: String(row.event_type) as PaymentEvent["eventType"],
    result: String(row.result) as PaymentEvent["result"],
    reasonCode: String(row.reason_code),
    createdAt: String(row.created_at),
  };
}
