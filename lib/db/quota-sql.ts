/**
 * Upsert atômico da cota. O INSERT já sai recusado quando o primeiro pedido
 * não cabe; o ON CONFLICT só atualiza se o teto ainda comporta o incremento.
 * Os dois ramos devolvem linha só quando a cota foi consumida.
 *
 * Parâmetros, nesta ordem:
 * userId, day, bytes, bytes, maxBytes, maxCount, maxCount, maxBytes.
 */
export const UPLOAD_QUOTA_UPSERT = `
INSERT INTO upload_quota (user_id, day, count, bytes)
SELECT ?, ?, 1, ?
WHERE ? <= ? AND 1 <= ?
ON CONFLICT(user_id, day) DO UPDATE SET
  count = upload_quota.count + 1,
  bytes = upload_quota.bytes + excluded.bytes
WHERE upload_quota.count + 1 <= ?
  AND upload_quota.bytes + excluded.bytes <= ?
RETURNING count, bytes
`;

/**
 * Parâmetros, nesta ordem: ip, day, maxCount, maxCount.
 */
export const SIGNUP_IP_QUOTA_UPSERT = `
INSERT INTO signup_ip_quota (ip, day, count)
SELECT ?, ?, 1
WHERE 1 <= ?
ON CONFLICT(ip, day) DO UPDATE SET
  count = signup_ip_quota.count + 1
WHERE signup_ip_quota.count + 1 <= ?
RETURNING count
`;

export const QUOTA_TABLES_SQL = `
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
`;
