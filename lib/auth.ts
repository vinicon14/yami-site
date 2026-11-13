import {
  createHmac,
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { getSessionSecret } from "./config";
import { getStore, type Session, type User } from "./db";

const scrypt = promisify(scryptCb);

export const SESSION_COOKIE = "yami_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scrypt(password, salt, 32)) as Buffer;
  return `scrypt$${salt}$${buf.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const buf = (await scrypt(password, salt, 32)) as Buffer;
  const expected = Buffer.from(hash, "hex");
  if (buf.length !== expected.length) return false;
  return timingSafeEqual(buf, expected);
}

export function hashSecret(value: string, secret = getSessionSecret()): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}

export function passwordIssues(password: string): string | null {
  if (password.length < 8) return "a senha precisa ter pelo menos 8 caracteres";
  if (password.length > 200) return "a senha é longa demais";
  return null;
}

export async function createSessionForUser(
  user: User,
  userAgent?: string | null,
): Promise<{ raw: string; session: Session }> {
  const store = await getStore();
  const raw = generateToken();
  const session = await store.createSession({
    id: crypto.randomUUID(),
    userId: user.id,
    tokenHash: hashSecret(raw),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    userAgent: userAgent ?? null,
  });
  return { raw, session };
}

export async function getSessionUser(
  rawToken: string | undefined | null,
): Promise<{ user: User; session: Session } | null> {
  if (!rawToken) return null;
  const store = await getStore();
  const session = await store.getSessionByTokenHash(hashSecret(rawToken));
  if (!session) return null;
  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    await store.deleteSession(session.id);
    return null;
  }
  const user = await store.getUserById(session.userId);
  if (!user) return null;
  return { user, session };
}

export function sessionCookie(raw: string, secure: boolean): string {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  const parts = [
    `${SESSION_COOKIE}=${raw}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearSessionCookie(secure: boolean): string {
  const parts = [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function readSessionCookie(req: Request): string | null {
  const header = req.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${SESSION_COOKIE}=`)) {
      return trimmed.slice(SESSION_COOKIE.length + 1) || null;
    }
  }
  return null;
}

export function isSecureRequest(req: Request): boolean {
  const url = new URL(req.url);
  if (url.protocol === "https:") return true;
  const proto = req.headers.get("x-forwarded-proto");
  return proto === "https";
}
