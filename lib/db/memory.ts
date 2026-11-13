import type { ReleaseManifest } from "../release";
import type {
  AuditEntry,
  Device,
  DownloadTokenRow,
  License,
  NewOrderInput,
  Order,
  PairingRow,
  Session,
  Store,
  User,
} from "./types";
import { nowIso } from "./types";

export function createMemoryStore(): Store {
  let releaseManifest: ReleaseManifest | null = null;

  const orders = new Map<string, Order>();
  const licenses = new Map<string, License>();
  const tokens = new Map<string, DownloadTokenRow>();
  const users = new Map<string, User>();
  const sessions = new Map<string, Session>();
  const pairings = new Map<string, PairingRow>();
  const devices = new Map<string, Device>();
  const audit: AuditEntry[] = [];

  const store: Store = {
    async createOrder(input: NewOrderInput): Promise<Order> {
      const order: Order = {
        id: input.id,
        email: input.email.toLowerCase(),
        name: input.name ?? null,
        amountBrl: input.amountBrl,
        currency: "BRL",
        status: "pending",
        mpPreferenceId: null,
        mpPaymentId: null,
        createdAt: nowIso(),
        paidAt: null,
      };
      orders.set(order.id, order);
      return { ...order };
    },

    async getOrderById(id) {
      const o = orders.get(id);
      return o ? { ...o } : null;
    },

    async getOrderByPaymentId(paymentId) {
      for (const o of orders.values()) {
        if (o.mpPaymentId === paymentId) return { ...o };
      }
      return null;
    },

    async getOrdersByEmail(email) {
      const e = email.toLowerCase();
      return [...orders.values()]
        .filter((o) => o.email === e)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .map((o) => ({ ...o }));
    },

    async setPreferenceId(orderId, preferenceId) {
      const o = orders.get(orderId);
      if (!o) throw new Error("pedido não encontrado");
      o.mpPreferenceId = preferenceId;
    },

    async markPaid(orderId, paymentId, paidAt) {
      const o = orders.get(orderId);
      if (!o) throw new Error("pedido não encontrado");
      o.status = "paid";
      o.mpPaymentId = paymentId;
      o.paidAt = nowIso(paidAt ?? new Date());
      return { ...o };
    },

    async markFailed(orderId) {
      const o = orders.get(orderId);
      if (!o) throw new Error("pedido não encontrado");
      if (o.status !== "paid") o.status = "failed";
    },

    async createLicense(orderId, key) {
      for (const l of licenses.values()) {
        if (l.orderId === orderId) return { ...l };
      }
      const license: License = {
        id: crypto.randomUUID(),
        orderId,
        key,
        createdAt: nowIso(),
      };
      licenses.set(license.id, license);
      return { ...license };
    },

    async getLicenseByOrderId(orderId) {
      for (const l of licenses.values()) {
        if (l.orderId === orderId) return { ...l };
      }
      return null;
    },

    async getLicensesByEmail(email) {
      const e = email.toLowerCase();
      const result: Array<License & { orderId: string; orderEmail: string }> = [];
      for (const l of licenses.values()) {
        const o = orders.get(l.orderId);
        if (o && o.email === e) {
          result.push({ ...l, orderEmail: o.email });
        }
      }
      return result;
    },

    async createDownloadToken(row) {
      const record: DownloadTokenRow = {
        ...row,
        createdAt: row.createdAt ?? nowIso(),
      };
      tokens.set(record.id, record);
      return { ...record };
    },

    async getDownloadTokenByHash(hash) {
      for (const t of tokens.values()) {
        if (t.tokenHash === hash) return { ...t };
      }
      return null;
    },

    async getLatestDownloadToken(orderId) {
      const list = [...tokens.values()]
        .filter((t) => t.orderId === orderId)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      return list[0] ? { ...list[0] } : null;
    },

    async incrementDownload(tokenId) {
      const t = tokens.get(tokenId);
      if (!t) throw new Error("token não encontrado");
      t.downloadsUsed += 1;
      return { ...t };
    },

    async totalDownloadsForOrder(orderId) {
      let n = 0;
      for (const t of tokens.values()) {
        if (t.orderId === orderId) n += t.downloadsUsed;
      }
      return n;
    },

    async createUser(input) {
      const existing = [...users.values()].find(
        (u) => u.email === input.email.toLowerCase(),
      );
      if (existing) throw new Error("e-mail já cadastrado");
      const user: User = {
        id: input.id,
        email: input.email.toLowerCase(),
        name: input.name ?? null,
        passwordHash: input.passwordHash,
        createdAt: nowIso(),
      };
      users.set(user.id, user);
      return { ...user };
    },

    async getUserByEmail(email) {
      const e = email.toLowerCase();
      for (const u of users.values()) {
        if (u.email === e) return { ...u };
      }
      return null;
    },

    async getUserById(id) {
      const u = users.get(id);
      return u ? { ...u } : null;
    },

    async createSession(input) {
      const session: Session = {
        id: input.id,
        userId: input.userId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        createdAt: nowIso(),
        userAgent: input.userAgent ?? null,
      };
      sessions.set(session.id, session);
      return { ...session };
    },

    async getSessionByTokenHash(hash) {
      for (const s of sessions.values()) {
        if (s.tokenHash === hash) return { ...s };
      }
      return null;
    },

    async deleteSession(id) {
      sessions.delete(id);
    },

    async deleteSessionsForUser(userId) {
      for (const [id, s] of sessions) {
        if (s.userId === userId) sessions.delete(id);
      }
    },

    async createPairing(row) {
      pairings.set(row.id, { ...row });
      return { ...row };
    },

    async getPairingByCodeHash(hash) {
      for (const p of pairings.values()) {
        if (p.codeHash === hash) return { ...p };
      }
      return null;
    },

    async getPairingByPollHash(hash) {
      for (const p of pairings.values()) {
        if (p.pollTokenHash === hash) return { ...p };
      }
      return null;
    },

    async confirmPairing(input) {
      const p = pairings.get(input.id);
      if (!p) throw new Error("pareamento não encontrado");
      p.userId = input.userId;
      p.deviceId = input.deviceId;
      p.deviceName = input.deviceName;
      p.pendingDeviceToken = input.pendingDeviceToken;
      p.consumedAt = nowIso();
      return { ...p };
    },

    async claimPairing(id) {
      const p = pairings.get(id);
      if (!p) throw new Error("pareamento não encontrado");
      const copy = { ...p };
      p.pendingDeviceToken = null;
      return copy;
    },

    async createDevice(input) {
      const device: Device = {
        id: input.id,
        userId: input.userId,
        name: input.name,
        tokenHash: input.tokenHash,
        createdAt: nowIso(),
        lastSeenAt: null,
        revokedAt: null,
      };
      devices.set(device.id, device);
      return { ...device };
    },

    async getDeviceById(id) {
      const d = devices.get(id);
      return d ? { ...d } : null;
    },

    async getDeviceByTokenHash(hash) {
      for (const d of devices.values()) {
        if (d.tokenHash === hash) return { ...d };
      }
      return null;
    },

    async listDevices(userId) {
      return [...devices.values()]
        .filter((d) => d.userId === userId)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .map((d) => ({ ...d }));
    },

    async touchDevice(id) {
      const d = devices.get(id);
      if (d) d.lastSeenAt = nowIso();
    },

    async revokeDevice(id, userId) {
      const d = devices.get(id);
      if (!d || d.userId !== userId) return null;
      d.revokedAt = nowIso();
      return { ...d };
    },

    async addAudit(entry) {
      audit.push({ ...entry, createdAt: entry.createdAt ?? nowIso() });
    },

    async listAudit(userId, limit = 50) {
      return audit
        .filter((a) => a.userId === userId)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .slice(0, limit)
        .map((a) => ({ ...a }));
    },

    async getReleaseManifest() {
      return releaseManifest
        ? (JSON.parse(JSON.stringify(releaseManifest)) as ReleaseManifest)
        : null;
    },
    async putReleaseManifest(manifest) {
      releaseManifest = JSON.parse(JSON.stringify(manifest)) as ReleaseManifest;
    },
  };

  return store;
}
