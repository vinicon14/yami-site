import type { ReleaseFile, ReleaseKind, ReleaseManifest } from "../release";
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
  userId?: string | null;
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
  userId?: string | null;
};

export type User = {
  id: string;
  email: string;
  name: string | null;
  passwordHash: string;
  status?: "ativo" | "bloqueado";
  licenseId?: string | null;
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
  confirmTokenHash: string | null;
  emailSentAt: string | null;
  confirmedAt: string | null;
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


export type ReleaseHistoryEntry = {
  id: string;
  kind: ReleaseKind;
  payload: ReleaseFile;
  uploadedByEmail: string;
  uploadedByUserId: string;
  createdAt: string;
};

export const FEATURE_REQUEST_STATUSES = [
  "pendente", "aprovada", "rejeitada", "em_desenvolvimento", "publicada", "retirada",
] as const;
export type FeatureRequestStatus = (typeof FEATURE_REQUEST_STATUSES)[number];

export type FeatureRequest = {
  id: string;
  userId: string;
  title: string;
  description: string;
  category: string;
  status: FeatureRequestStatus;
  publishedVersion: string | null;
  adminNote: string | null;
  fileName: string | null;
  fileSize: number | null;
  fileSha256: string | null;
  fileBlobPathname: string | null;
  appVersion: string | null;
  appIcon: string | null;
  publishedAssetUrl: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FeatureRequestEvent = {
  id: string;
  requestId: string;
  fromStatus: FeatureRequestStatus | null;
  toStatus: FeatureRequestStatus;
  actorUserId: string;
  actorRole: "user" | "admin";
  note: string | null;
  createdAt: string;
};

export type UserNotification = {
  id: string;
  userId: string;
  kind: string;
  title: string;
  body: string;
  requestId: string | null;
  readAt: string | null;
  createdAt: string;
  expiresAt: string | null;
};

export type PaymentEvent = {
  id: string;
  orderId: string | null;
  paymentId: string | null;
  eventType: "webhook" | "fulfill" | "duplicate" | "match_failed" | "api_error";
  result: "ok" | "skipped" | "error";
  reasonCode: string;
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
  listUsers(): Promise<User[]>;
  updateUser(id: string, input: { name?: string | null; passwordHash?: string; status?: "ativo" | "bloqueado"; licenseId?: string | null }): Promise<User | null>;
  updateUserLicense(id: string, licenseId: string | null): Promise<void>;

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
  getPairingByConfirmHash(hash: string): Promise<PairingRow | null>;
  confirmPairing(input: {
    id: string;
    userId: string;
    deviceId: string;
    deviceName: string;
    pendingDeviceToken: string | null;
  }): Promise<boolean>;
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
  addReleaseHistory(entry: Omit<ReleaseHistoryEntry, "createdAt"> & { createdAt?: string }): Promise<void>;
  listReleaseHistory(kind?: ReleaseKind, limit?: number): Promise<ReleaseHistoryEntry[]>;
  getReleaseHistoryById(id: string): Promise<ReleaseHistoryEntry | null>;

  markPaidOnce(input: { orderId: string; paymentId: string; paidAt?: Date; }): Promise<{ order: Order; changed: boolean } | null>;
  addPaymentEvent(entry: Omit<PaymentEvent, "createdAt"> & { createdAt?: string }): Promise<void>;
  createFeatureRequest(input: Omit<FeatureRequest, "id" | "status" | "publishedVersion" | "adminNote" | "createdAt" | "updatedAt">): Promise<FeatureRequest>;
  listFeatureRequests(userId?: string): Promise<FeatureRequest[]>;
  getFeatureRequest(id: string): Promise<FeatureRequest | null>;
  updateFeatureRequest(input: { id: string; userId: string; title: string; description: string; category: string }): Promise<FeatureRequest | null>;
  transitionFeatureRequest(input: { id: string; actorUserId: string; actorRole: "user" | "admin"; toStatus: FeatureRequestStatus; note?: string | null; publishedVersion?: string | null; publishedAssetUrl?: string | null; }): Promise<FeatureRequest | null>;
  createUserNotification(input: Omit<UserNotification, "id" | "readAt" | "createdAt"> & { createdAt?: string }): Promise<UserNotification>;
  listUserNotifications(userId: string, limit?: number): Promise<UserNotification[]>;
  markNotificationRead(id: string, userId: string): Promise<boolean>;
  countUnreadNotifications(userId: string): Promise<number>;
}


export function nowIso(date: Date = new Date()): string {
  return date.toISOString();
}
