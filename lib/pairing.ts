import { getSessionSecret } from "./config";
import { getStore, type Device, type PairingRow, type Store, type User } from "./db";
import { generateToken, hashSecret } from "./auth";
import { userHasPaidLicense } from "./license-gate";
import { nowIso } from "./db/types";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const PAIRING_TTL_MS = 10 * 60 * 1000;
export const PAIRING_CONFIRM_TTL_MS = 10 * 60 * 1000;

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
  const updated = await store.confirmPairing({
    id: row.id,
    userId: user.id,
    deviceId: device.id,
    deviceName: device.name,
    pendingDeviceToken: deviceToken,
  });
  if (!updated) throw new Error("código já usado");
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

function cleanDeviceName(name: string): string {
  return name.trim().slice(0, 80) || "PC de casa";
}

export function generateConfirmToken(): string {
  return generateToken(32);
}

export async function startPairingByEmail(
  store: Store,
  email: string,
  deviceName: string,
  now = new Date(),
): Promise<{ pollToken: string; confirmToken: string; expiresAt: string; email: string }> {
  const normalizedEmail = String(email ?? "").trim().toLowerCase();
  const user = await store.getUserByEmail(normalizedEmail);
  if (!user) throw new Error("usuário não encontrado");
  if (!(await userHasPaidLicense(user.email, store))) throw new Error("licença necessária");

  const pollToken = generateToken(24);
  const confirmToken = generateConfirmToken();
  const expiresAt = new Date(now.getTime() + PAIRING_CONFIRM_TTL_MS).toISOString();
  // code_hash e poll_token_hash são colunas NOT NULL UNIQUE; o fluxo por e-mail
  // não usa código nem poll token, então grava hashes de valores aleatórios descartáveis.
  await store.createPairing({
    id: crypto.randomUUID(),
    codeHash: hashPairingValue(generateToken(24)),
    pollTokenHash: hashPairingValue(pollToken),
    userId: user.id,
    deviceId: null,
    deviceName: cleanDeviceName(deviceName),
    pendingDeviceToken: null,
    expiresAt,
    consumedAt: null,
    confirmTokenHash: hashSecret(confirmToken),
    emailSentAt: null,
    confirmedAt: null,
    createdAt: nowIso(),
  });
  return { pollToken, confirmToken, expiresAt, email: user.email };
}

export async function confirmPairingByEmail(
  store: Store,
  confirmToken: string,
  userId: string,
): Promise<{ deviceToken: string; device: Device }> {
  const row = await store.getPairingByConfirmHash(hashSecret(confirmToken));
  if (!row || row.userId !== userId) throw new Error("token inválido");
  if (isPairingExpired(row)) throw new Error("token expirado");
  if (row.consumedAt) throw new Error("token já usado");
  const user = await store.getUserById(userId);
  if (!user) throw new Error("token inválido");

  const deviceToken = generateToken(32);
  const device = await store.createDevice({
    id: crypto.randomUUID(),
    userId: user.id,
    name: row.deviceName ?? "PC de casa",
    tokenHash: hashSecret(deviceToken),
  });
  const updated = await store.confirmPairing({
    id: row.id,
    userId: user.id,
    deviceId: device.id,
    deviceName: device.name,
    pendingDeviceToken: null,
  });
  if (!updated) throw new Error("token já usado");
  await store.addAudit({
    id: crypto.randomUUID(),
    userId: user.id,
    deviceId: device.id,
    action: "pairing.confirm_email",
    ip: null,
    meta: device.name,
  });
  return { deviceToken, device };
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
