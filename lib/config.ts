function readEnv(name: string, fallback = ""): string {
  const value = process.env[name];
  if (value == null) return fallback;
  return value.trim();
}

export const PRODUCT = {
  name: "YAMI",
  version: readEnv("YAMI_VERSION", "0.62.0"),
  platform: "Windows 10/11 x64",
} as const;

export function getPriceBrl(): number {
  const raw = readEnv("PRICE_BRL", readEnv("YAMI_PRICE_BRL", "20"));
  const n = Number(raw.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error("PRICE_BRL inválido");
  }
  return Math.round(n * 100) / 100;
}

export function formatPriceBrl(value: number = getPriceBrl()): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export type MpMode = "test" | "production";

export function getMpMode(): MpMode {
  const raw = readEnv("MP_MODE", "production").toLowerCase();
  if (raw === "test" || raw === "sandbox" || raw === "demo") return "test";
  return "production";
}

export function hasMpAccessToken(): boolean {
  return readEnv("MP_ACCESS_TOKEN").length > 0;
}

/** Checkout Pro real só entra com MP_MODE=production, token e segredo do webhook. */
export function chargesEnabled(): boolean {
  return (
    getMpMode() === "production" &&
    hasMpAccessToken() &&
    getWebhookSecret().length > 0
  );
}

/**
 * Em produção a venda só abre com token de acesso e MP_WEBHOOK_SECRET
 * configurados; sem eles a cobrança real permanece desligada.
 * No processador do webhook o pagamento é autenticado na API do Mercado Pago
 * e, quando MP_WEBHOOK_SECRET está definido, a assinatura x-signature também
 * é validada.
 */
export function salesOpen(): boolean {
  return chargesEnabled();
}

export function getSiteUrl(): string {
  const explicit = readEnv("NEXT_PUBLIC_SITE_URL", readEnv("SITE_URL"));
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = readEnv("VERCEL_PROJECT_PRODUCTION_URL", readEnv("VERCEL_URL"));
  if (vercel) {
    const host = vercel.replace(/^https?:\/\//, "").replace(/\/$/, "");
    return `https://${host}`;
  }
  return "http://localhost:3000";
}

export function getMpAccessToken(): string {
  return readEnv("MP_ACCESS_TOKEN");
}

export function getMpPublicKey(): string {
  return readEnv("MP_PUBLIC_KEY");
}

export function getWebhookSecret(): string {
  return readEnv("MP_WEBHOOK_SECRET");
}

export function getDownloadSecret(): string {
  const value = readEnv("DOWNLOAD_TOKEN_SECRET");
  if (value) return value;
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
    throw new Error("DOWNLOAD_TOKEN_SECRET é obrigatório em produção");
  }
  return "dev-only-insecure-download-secret";
}

export function getSessionSecret(): string {
  const value = readEnv("SESSION_SECRET", readEnv("AUTH_SECRET"));
  if (value) return value;
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
    throw new Error("SESSION_SECRET é obrigatório em produção");
  }
  return "dev-only-insecure-session-secret";
}

export function getDownloadTtlHours(): number {
  const n = Number(readEnv("DOWNLOAD_TOKEN_TTL_HOURS", "24"));
  return Number.isFinite(n) && n > 0 ? n : 24;
}

export function getMaxDownloads(): number {
  const n = Number(readEnv("DOWNLOAD_MAX_COUNT", "5"));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 5;
}

export function getInstallerUrl(): string {
  return readEnv("YAMI_INSTALLER_URL");
}

export function getInstallerPath(): string {
  return readEnv("YAMI_INSTALLER_PATH");
}

export function getInstallerFilename(): string {
  return readEnv(
    "YAMI_INSTALLER_FILENAME",
    `YAMI-Setup-${PRODUCT.version}.exe`,
  );
}

export function getInstallerAuthHeader(): string {
  return readEnv("YAMI_INSTALLER_AUTH_HEADER");
}

export function getDatabaseUrl(): string {
  return readEnv("DATABASE_URL");
}

export function getSqlitePath(): string {
  return readEnv("DATABASE_PATH", "data/yami.db");
}

export function emailEnabled(): boolean {
  return (
    readEnv("RESEND_API_KEY").length > 0 && readEnv("EMAIL_FROM").length > 0
  );
}

export function getEmailFrom(): string {
  return readEnv("EMAIL_FROM");
}

export function getResendApiKey(): string {
  return readEnv("RESEND_API_KEY");
}

export type RelayProvider = "memory" | "postgres" | "ably" | "pusher";

/** Envios (upload de token + POST /api/apps) por usuário no dia UTC. */
export const DEFAULT_UPLOAD_QUOTA_DAILY_MAX = 10;
/** 2 GiB. Cabe em inteiro seguro; no Postgres a coluna é BIGINT. */
export const DEFAULT_UPLOAD_QUOTA_DAILY_BYTES = 2147483648;
/**
 * Contas criadas por IP no dia UTC. 5 deixa uma rede compartilhada abrir
 * algumas contas e corta o atalho de criar uma conta nova para cada envio.
 */
export const DEFAULT_SIGNUP_IP_DAILY_MAX = 5;

function readNonNegativeInt(name: string, fallback: number): number {
  const raw = readEnv(name);
  if (!raw) return fallback;
  if (!/^\d+$/.test(raw)) throw new Error(`${name} inválido`);
  const n = Number(raw);
  if (!Number.isSafeInteger(n)) throw new Error(`${name} inválido`);
  return n;
}

export function getUploadQuotaDailyMax(): number {
  return readNonNegativeInt("UPLOAD_QUOTA_DAILY_MAX", DEFAULT_UPLOAD_QUOTA_DAILY_MAX);
}

export function getUploadQuotaDailyBytes(): number {
  return readNonNegativeInt("UPLOAD_QUOTA_DAILY_BYTES", DEFAULT_UPLOAD_QUOTA_DAILY_BYTES);
}

export function getSignupIpDailyMax(): number {
  return readNonNegativeInt("SIGNUP_IP_DAILY_MAX", DEFAULT_SIGNUP_IP_DAILY_MAX);
}

export function getRelayProvider(): RelayProvider {
  const raw = readEnv("RELAY_PROVIDER", "memory").toLowerCase();
  if (raw === "postgres" || raw === "ably" || raw === "pusher") return raw;
  return "memory";
}
