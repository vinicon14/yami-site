import { getSessionSecret } from "./config";
import { getStore, type Device, type PairingRow, type User } from "./db";
import { generateToken, hashSecret } from "./auth";
import { nowIso } from "./db/types";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const PAIRING_TTL_MS = 10 * 60 * 1000;

export function generatePairingCode(length = 6): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export function hashPairingValue(value: string): string {
  return hashSecret(value.toUpperCase(), getSessionSecret());
}

export function pairingExpiry(now = new Date()): string {
  return new Date(now.getTime() + PAIRING_TTL_MS).toISOString();
}

export function isPairingExpired(row: PairingRow, now = new Date()): boolean {
  return new Date(row.expiresAt).getTime() <= now.getTime();
}

export async function startPairing(): Promise<{
  code: string;
  pollToken: string;
  expiresAt: string;
}> {
  const store = await getStore();
  const code = generatePairingCode();
  const pollToken = generateToken(24);
  const expiresAt = pairingExpiry();
  await store.createPairing({
    id: crypto.randomUUID(),
    codeHash: hashPairingValue(code),
    pollTokenHash: hashPairingValue(pollToken),
    userId: null,
    deviceId: null,
    deviceName: null,
    pendingDeviceToken: null,
    confirmTokenHash: null,
    emailSentAt: null,
    confirmedAt: null,
    expiresAt,
    consumedAt: null,
    createdAt: nowIso(),
  });
  return { code, pollToken, expiresAt };
}

export async function confirmPairing(
  code: string,
  user: User,
  deviceName: string,
): Promise<Device> {
  const store = await getStore();
  const row = await store.getPairingByCodeHash(hashPairingValue(code));
  if (!row) throw new Error("código inválido");
  if (isPairingExpired(row)) throw new Error("código expirado");
  if (row.consumedAt) throw new Error("código já usado");

  const deviceToken = generateToken(32);
  const device = await store.createDevice({
    id: crypto.randomUUID(),
    userId: user.id,
    name: deviceName.trim().slice(0, 80) || "PC de casa",
    tokenHash: hashSecret(deviceToken),
  });
  await store.confirmPairing({
    id: row.id,
    userId: user.id,
    deviceId: device.id,
    deviceName: device.name,
    pendingDeviceToken: deviceToken,
  });
  await store.addAudit({
    id: crypto.randomUUID(),
    userId: user.id,
    deviceId: device.id,
    action: "pairing.confirm",
    ip: null,
    meta: device.name,
  });
  return device;
}

export async function pollPairing(pollToken: string): Promise<
  | { status: "pending"; expiresAt: string }
  | { status: "expired" }
  | { status: "consumed" }
  | { status: "ready"; deviceId: string; deviceName: string; deviceToken: string }
> {
  const store = await getStore();
  const row = await store.getPairingByPollHash(hashPairingValue(pollToken));
  if (!row) return { status: "expired" };
  if (isPairingExpired(row) && !row.pendingDeviceToken) return { status: "expired" };
  if (row.consumedAt && !row.pendingDeviceToken) return { status: "consumed" };
  if (!row.consumedAt || !row.pendingDeviceToken || !row.deviceId) {
    return { status: "pending", expiresAt: row.expiresAt };
  }
  const claimed = await store.claimPairing(row.id);
  if (!claimed.pendingDeviceToken || !claimed.deviceId) return { status: "consumed" };
  return {
    status: "ready",
    deviceId: claimed.deviceId,
    deviceName: claimed.deviceName ?? "PC de casa",
    deviceToken: claimed.pendingDeviceToken,
  };
}

export async function deviceFromToken(raw: string): Promise<Device | null> {
  if (!raw) return null;
  const store = await getStore();
  const device = await store.getDeviceByTokenHash(hashSecret(raw));
  if (!device || device.revokedAt) return null;
  await store.touchDevice(device.id);
  return device;
}
