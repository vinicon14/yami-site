import { createHash, randomBytes } from "node:crypto";

export function generateDownloadToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashToken(token: string, secret: string): string {
  return createHash("sha256").update(`${secret}:${token}`).digest("hex");
}

export type TokenRecord = {
  expiresAt: Date;
  downloadsUsed: number;
  maxDownloads: number;
};

export type TokenCheck =
  | { ok: true }
  | { ok: false; reason: "expired" | "limit" };

export function checkDownloadToken(
  record: TokenRecord,
  now: Date = new Date(),
): TokenCheck {
  if (record.expiresAt.getTime() <= now.getTime()) {
    return { ok: false, reason: "expired" };
  }
  if (record.downloadsUsed >= record.maxDownloads) {
    return { ok: false, reason: "limit" };
  }
  return { ok: true };
}

export function tokenExpiry(ttlHours: number, now: Date = new Date()): Date {
  return new Date(now.getTime() + ttlHours * 60 * 60 * 1000);
}

export function hoursUntil(expiresAt: Date, now: Date = new Date()): number {
  return Math.max(0, (expiresAt.getTime() - now.getTime()) / (60 * 60 * 1000));
}
