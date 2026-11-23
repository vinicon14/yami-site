CREATE TABLE IF NOT EXISTS orders (
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
  file_name TEXT,
  file_size INTEGER,
  file_sha256 TEXT,
  file_blob_pathname TEXT,
  app_version TEXT,
  app_icon TEXT,
  app_platform TEXT,
  published_asset_url TEXT,
  published_at TEXT,
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

CREATE TABLE IF NOT EXISTS store_apps (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  owner_user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  icon TEXT,
  platform TEXT NOT NULL,
  visibility TEXT NOT NULL,
  review_note TEXT,
  verified INTEGER NOT NULL DEFAULT 0,
  author_version_id TEXT NOT NULL,
  public_version_id TEXT,
  source_request_id TEXT UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS store_app_versions (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL,
  version TEXT NOT NULL,
  file_name TEXT,
  file_size INTEGER NOT NULL,
  file_sha256 TEXT NOT NULL,
  sha256_source TEXT NOT NULL,
  file_blob_pathname TEXT,
  external_url TEXT,
  download_url TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS store_app_reports (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL,
  reporter_user_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_store_apps_owner ON store_apps (owner_user_id, visibility);
CREATE INDEX IF NOT EXISTS idx_store_app_versions_app ON store_app_versions (app_id, created_at);
CREATE INDEX IF NOT EXISTS idx_store_app_reports_status ON store_app_reports (status, created_at);

CREATE TABLE IF NOT EXISTS upload_quota (
  user_id TEXT NOT NULL,
  day TEXT NOT NULL,
  count INTEGER NOT NULL,
  bytes BIGINT NOT NULL,
  PRIMARY KEY (user_id, day)
);

CREATE TABLE IF NOT EXISTS signup_ip_quota (
  ip TEXT NOT NULL,
  day TEXT NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (ip, day)
);
