import { generateToken, hashSecret, verifyPassword } from "./auth";
import { getStore, type Device, type Store } from "./db";

export const MAX_DESKTOP_DEVICES = 5;

export async function desktopLogin(
  store: Store,
  email: string,
  password: string,
  deviceName: string,
): Promise<{ device: Device; deviceToken: string }> {
  const normalized = email.trim().toLowerCase();
  const user = await store.getUserByEmail(normalized);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new Error("invalid_credentials");
  }

  const active = (await store.listDevices(user.id)).filter((d) => !d.revokedAt);
  if (active.length >= MAX_DESKTOP_DEVICES) {
    const oldest = active.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))[0]!;
    await store.revokeDevice(oldest.id, user.id);
  }

  const deviceToken = generateToken(32);
  const device = await store.createDevice({
    id: crypto.randomUUID(),
    userId: user.id,
    name: deviceName.trim().slice(0, 80) || "YAMI OS",
    tokenHash: hashSecret(deviceToken),
  });
  await store.addAudit({
    id: crypto.randomUUID(),
    userId: user.id,
    deviceId: device.id,
    action: "desktop.login",
    ip: null,
    meta: device.name,
  });
  return { device, deviceToken };
}

export async function getDesktopSession(store: Store, deviceToken: string) {
  const device = await store.getDeviceByTokenHash(hashSecret(deviceToken));
  if (!device || device.revokedAt) return null;
  const user = await store.getUserById(device.userId);
  if (!user) return null;
  await store.touchDevice(device.id);
  const licenses = await store.getLicensesByEmail(user.email);
  const orders = await store.getOrdersByEmail(user.email);
  const unread = await store.countUnreadNotifications(user.id);
  return {
    user: { id: user.id, email: user.email, name: user.name },
    device: { id: device.id, name: device.name },
    license: licenses[0]
      ? { key: licenses[0].key, status: "ativa", createdAt: licenses[0].createdAt }
      : null,
    hasLicense: licenses.length > 0,
    orders: orders.map((o) => ({
      id: o.id,
      status: o.status,
      amountBrl: o.amountBrl,
      paidAt: o.paidAt,
      createdAt: o.createdAt,
    })),
    unreadNotifications: unread,
  };
}

export async function revokeDesktopDevice(store: Store, deviceId: string, userId?: string) {
  const device = await store.getDeviceById(deviceId);
  if (!device || (userId && device.userId !== userId)) return false;
  await store.revokeDevice(deviceId, device.userId);
  await store.addAudit({
    id: crypto.randomUUID(),
    userId: device.userId,
    deviceId,
    action: "desktop.logout",
    ip: null,
    meta: null,
  });
  return true;
}

export function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+([A-Za-z0-9_-]{32,128})$/i);
  return match?.[1] ?? null;
}
