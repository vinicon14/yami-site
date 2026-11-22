import type { ReleaseKind, ReleaseManifest } from "../release";
import type {
  AuditEntry,
  Device,
  ReleaseHistoryEntry,
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
  const history: ReleaseHistoryEntry[] = [];

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
        userId: input.userId ?? null,
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

    async listUsers() {
      return [...users.values()].map((u) => ({ ...u }));
    },

    async updateUser(id, input) {
      const u = users.get(id);
      if (!u) return null;
      if (input.name !== undefined) u.name = input.name;
      if (input.passwordHash !== undefined) u.passwordHash = input.passwordHash;
      if (input.status !== undefined) u.status = input.status;
      if (input.licenseId !== undefined) u.licenseId = input.licenseId;
      users.set(u.id, u);
      return { ...u };
    },

    async updateUserLicense(id, licenseId) {
      const u = users.get(id);
      if (u) {
        u.licenseId = licenseId;
        users.set(u.id, u);
      }
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

    async getPairingByConfirmHash(hash) {
      for (const p of pairings.values()) {
        if (p.confirmTokenHash === hash) return { ...p };
      }
      return null;
    },

    async confirmPairing(input) {
      const p = pairings.get(input.id);
      if (!p || p.consumedAt) return false;
      p.userId = input.userId;
      p.deviceId = input.deviceId;
      p.deviceName = input.deviceName;
      p.pendingDeviceToken = input.pendingDeviceToken;
      p.consumedAt = nowIso();
      return true;
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
    async addReleaseHistory(entry) {
      history.push({ ...entry, createdAt: entry.createdAt ?? nowIso() });
    },
    async listReleaseHistory(kind, limit = 30) {
      return history
        .filter((h) => (kind ? h.kind === kind : true))
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .slice(0, limit)
        .map((h) => ({ ...h, payload: JSON.parse(JSON.stringify(h.payload)) }));
    },
    async getReleaseHistoryById(id) {
      const found = history.find((h) => h.id === id);
      return found
        ? { ...found, payload: JSON.parse(JSON.stringify(found.payload)) }
        : null;
    },

    async markPaidOnce({ orderId, paymentId, paidAt }) {
      const order = orders.get(orderId);
      if (!order) return null;
      if (order.mpPaymentId && order.mpPaymentId !== paymentId) return null;
      const changed = !order.mpPaymentId;
      if (changed) {
        order.status = "paid";
        order.mpPaymentId = paymentId;
        order.paidAt = nowIso(paidAt ?? new Date());
      }
      return { order: { ...order }, changed };
    },

    async addPaymentEvent(entry) {
      paymentEvents.push({ ...entry, createdAt: entry.createdAt ?? nowIso() });
    },

    async createFeatureRequest(input) {
      const now = nowIso();
      const request: import("./types").FeatureRequest = {
        ...input,
        id: crypto.randomUUID(),
        status: "pendente",
        publishedVersion: null,
        adminNote: null,
        createdAt: now,
        updatedAt: now,
      };
      featureRequests.set(request.id, request);
      return { ...request };
    },

    async listFeatureRequests(userId) {
      return [...featureRequests.values()]
        .filter((r) => !userId || r.userId === userId)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .map((r) => ({ ...r }));
    },

    async getFeatureRequest(id) {
      const r = featureRequests.get(id);
      return r ? { ...r } : null;
    },

    async updateFeatureRequest(input) {
      const r = featureRequests.get(input.id);
      if (!r || r.userId !== input.userId || r.status !== "pendente") return null;
      r.title = input.title;
      r.description = input.description;
      r.category = input.category;
      r.updatedAt = nowIso();
      featureRequests.set(r.id, r);
      return { ...r };
    },

    async transitionFeatureRequest(input) {
      const r = featureRequests.get(input.id);
      if (!r) return null;
      const from = r.status;
      r.status = input.toStatus;
      r.updatedAt = nowIso();
      if (input.publishedVersion !== undefined) r.publishedVersion = input.publishedVersion;
      if (input.note !== undefined && input.note !== null) r.adminNote = input.note;
      requestEvents.push({
        id: crypto.randomUUID(),
        requestId: r.id,
        fromStatus: from,
        toStatus: input.toStatus,
        actorUserId: input.actorUserId,
        actorRole: input.actorRole,
        note: input.note ?? null,
        createdAt: nowIso(),
      });
      featureRequests.set(r.id, r);
      return { ...r };
    },

    async createUserNotification(input) {
      const n: import("./types").UserNotification = {
        ...input,
        id: crypto.randomUUID(),
        readAt: null,
        createdAt: input.createdAt ?? nowIso(),
      };
      notifications.push(n);
      return { ...n };
    },

    async listUserNotifications(userId, limit = 30) {
      return notifications
        .filter((n) => n.userId === userId)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .slice(0, limit)
        .map((n) => ({ ...n }));
    },

    async markNotificationRead(id, userId) {
      const n = notifications.find((item) => item.id === id && item.userId === userId);
      if (!n || n.readAt) return false;
      n.readAt = nowIso();
      return true;
    },

    async countUnreadNotifications(userId) {
      return notifications.filter((n) => n.userId === userId && !n.readAt).length;
    },
  };

  const featureRequests = new Map<string, import("./types").FeatureRequest>();
  const requestEvents: import("./types").FeatureRequestEvent[] = [];
  const notifications: import("./types").UserNotification[] = [];
  const paymentEvents: import("./types").PaymentEvent[] = [];

  return store;
}
