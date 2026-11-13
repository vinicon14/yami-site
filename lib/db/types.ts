import type { ReleaseManifest } from "../release";
export type OrderStatus = "pending" | "paid" | "failed" | "refunded";

export type Order = {
  id: string;
  email: string;
  name: string | null;
  amountBrl: number;
  currency: "BRL";
  status: OrderStatus;
  mpPreferenceId: string | null;
  mpPaymentId: string | null;
  createdAt: string;
  paidAt: string | null;
};

export type License = {
  id: string;
  orderId: string;
  key: string;
  createdAt: string;
};

export type DownloadTokenRow = {
  id: string;
  orderId: string;
  licenseId: string;
  tokenHash: string;
  expiresAt: string;
  downloadsUsed: number;
  maxDownloads: number;
  createdAt: string;
};

export type NewOrderInput = {
  id: string;
  email: string;
  name?: string | null;
  amountBrl: number;
};

export type User = {
  id: string;
  email: string;
  name: string | null;
  passwordHash: string;
  createdAt: string;
};

export type Session = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  createdAt: string;
  userAgent: string | null;
};

export type Device = {
  id: string;
  userId: string;
  name: string;
  tokenHash: string;
  createdAt: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
};

export type PairingRow = {
  id: string;
  codeHash: string;
  pollTokenHash: string;
  userId: string | null;
  deviceId: string | null;
  deviceName: string | null;
  /** Clear device token kept only until the desktop claims it once. */
  pendingDeviceToken: string | null;
  expiresAt: string;
  consumedAt: string | null;
  createdAt: string;
};

export type AuditEntry = {
  id: string;
  userId: string;
  deviceId: string | null;
  action: string;
  ip: string | null;
  meta: string | null;
  createdAt: string;
};

export interface Store {
  createOrder(input: NewOrderInput): Promise<Order>;
  getOrderById(id: string): Promise<Order | null>;
  getOrderByPaymentId(paymentId: string): Promise<Order | null>;
  getOrdersByEmail(email: string): Promise<Order[]>;
  setPreferenceId(orderId: string, preferenceId: string): Promise<void>;
  markPaid(orderId: string, paymentId: string, paidAt?: Date): Promise<Order>;
  markFailed(orderId: string): Promise<void>;
  createLicense(orderId: string, key: string): Promise<License>;
  getLicenseByOrderId(orderId: string): Promise<License | null>;
  getLicensesByEmail(email: string): Promise<Array<License & { orderId: string; orderEmail: string }>>;
  createDownloadToken(
    row: Omit<DownloadTokenRow, "createdAt"> & { createdAt?: string },
  ): Promise<DownloadTokenRow>;
  getDownloadTokenByHash(hash: string): Promise<DownloadTokenRow | null>;
  getLatestDownloadToken(orderId: string): Promise<DownloadTokenRow | null>;
  incrementDownload(tokenId: string): Promise<DownloadTokenRow>;
  totalDownloadsForOrder(orderId: string): Promise<number>;

  createUser(input: {
    id: string;
    email: string;
    name?: string | null;
    passwordHash: string;
  }): Promise<User>;
  getUserByEmail(email: string): Promise<User | null>;
  getUserById(id: string): Promise<User | null>;

  createSession(input: {
    id: string;
    userId: string;
    tokenHash: string;
    expiresAt: string;
    userAgent?: string | null;
  }): Promise<Session>;
  getSessionByTokenHash(hash: string): Promise<Session | null>;
  deleteSession(id: string): Promise<void>;
  deleteSessionsForUser(userId: string): Promise<void>;

  createPairing(row: PairingRow): Promise<PairingRow>;
  getPairingByCodeHash(hash: string): Promise<PairingRow | null>;
  getPairingByPollHash(hash: string): Promise<PairingRow | null>;
  confirmPairing(input: {
    id: string;
    userId: string;
    deviceId: string;
    deviceName: string;
    pendingDeviceToken: string;
  }): Promise<PairingRow>;
  claimPairing(id: string): Promise<PairingRow>;

  createDevice(input: {
    id: string;
    userId: string;
    name: string;
    tokenHash: string;
  }): Promise<Device>;
  getDeviceById(id: string): Promise<Device | null>;
  getDeviceByTokenHash(hash: string): Promise<Device | null>;
  listDevices(userId: string): Promise<Device[]>;
  touchDevice(id: string): Promise<void>;
  revokeDevice(id: string, userId: string): Promise<Device | null>;

  addAudit(entry: Omit<AuditEntry, "createdAt"> & { createdAt?: string }): Promise<void>;
  listAudit(userId: string, limit?: number): Promise<AuditEntry[]>;

  getReleaseManifest(): Promise<ReleaseManifest | null>;
  putReleaseManifest(manifest: ReleaseManifest): Promise<void>;
}

export function nowIso(date: Date = new Date()): string {
  return date.toISOString();
}
