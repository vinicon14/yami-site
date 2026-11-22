import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryStore } from "../lib/db/memory";
import { createSqliteStore } from "../lib/db/sqlite";
import { nowIso, type Store } from "../lib/db/types";

// A Store do SQLite não expõe o handle do banco; rastreiamos as instâncias para
// fechá-las antes de remover os diretórios temporários (necessário no Windows).
const { openDatabases, tempDirs } = vi.hoisted(() => ({
  openDatabases: [] as Array<{ close(): void }>,
  tempDirs: [] as string[],
}));

vi.mock("node:sqlite", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:sqlite")>();
  class TrackedDatabaseSync extends actual.DatabaseSync {
    constructor(...args: ConstructorParameters<typeof actual.DatabaseSync>) {
      super(...args);
      openDatabases.push(this);
    }
  }
  return { ...actual, DatabaseSync: TrackedDatabaseSync };
});

function baseUser(store: Store) {
  return store.createUser({
    id: "user-1",
    email: "user@example.com",
    passwordHash: "hash",
  });
}

afterEach(() => {
  for (const db of openDatabases.splice(0)) {
    try {
      db.close();
    } catch {
      // já fechado explicitamente pelo teste
    }
  }
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function sqliteStore() {
  const dir = mkdtempSync(join(tmpdir(), "yami-store-test-"));
  tempDirs.push(dir);
  return { store: createSqliteStore(join(dir, "test.db")), dbPath: join(dir, "test.db") };
}

describe("novos métodos da Store", () => {
  it("marca um pedido como pago uma única vez", async () => {
    const store = createMemoryStore();
    await store.createOrder({ id: "o1", email: "user@example.com", amountBrl: 20 });
    const first = await store.markPaidOnce({ orderId: "o1", paymentId: "p1" });
    const second = await store.markPaidOnce({ orderId: "o1", paymentId: "p1" });
    const other = await store.markPaidOnce({ orderId: "o1", paymentId: "p2" });
    expect(first?.changed).toBe(true);
    expect(first?.order.paidAt).not.toBeNull();
    expect(second?.changed).toBe(false);
    expect(second?.order.mpPaymentId).toBe("p1");
    expect(second?.order.paidAt).toBe(first?.order.paidAt);
    expect(other).toBeNull();
  });

  it("gerencia solicitações, eventos e avisos", async () => {
    const store = createMemoryStore();
    await baseUser(store);
    const created = await store.createFeatureRequest({
      userId: "user-1",
      title: "Novo tema",
      description: "Adicionar tema azul",
      category: "personalizacao",
    });
    const approved = await store.transitionFeatureRequest({
      id: created.id,
      actorUserId: "admin-1",
      actorRole: "admin",
      toStatus: "aprovada",
      note: "Aprovado",
    });
    expect(approved?.status).toBe("aprovada");

    await store.createUserNotification({
      userId: "user-1",
      kind: "request.approved",
      title: "Solicitação aprovada",
      body: "Sua solicitação foi aprovada.",
      requestId: created.id,
      expiresAt: null,
    });
    expect(await store.countUnreadNotifications("user-1")).toBe(1);
    expect(await store.listUserNotifications("user-1", 10)).toHaveLength(1);
  });

  it("registra o pagamento mesmo quando o pedido já está pago (sqlite)", async () => {
    const { store, dbPath } = sqliteStore();
    await store.createOrder({ id: "o2", email: "user@example.com", amountBrl: 30 });
    const raw = new DatabaseSync(dbPath);
    raw.prepare("UPDATE orders SET status = 'paid', paid_at = ? WHERE id = ?").run(nowIso(), "o2");
    raw.close();

    const marked = await store.markPaidOnce({ orderId: "o2", paymentId: "p2" });
    expect(marked?.changed).toBe(true);
    expect(marked?.order.status).toBe("paid");
    expect(marked?.order.mpPaymentId).toBe("p2");
    expect(marked?.order.paidAt).not.toBeNull();

    const repeated = await store.markPaidOnce({ orderId: "o2", paymentId: "p2" });
    expect(repeated?.changed).toBe(false);
    expect(repeated?.order.paidAt).toBe(marked?.order.paidAt);
    expect(await store.markPaidOnce({ orderId: "o2", paymentId: "p3" })).toBeNull();
  });

  it("publishedVersion: null limpa e undefined preserva (memory e sqlite)", async () => {
    for (const store of [createMemoryStore(), sqliteStore().store]) {
      await baseUser(store);
      const created = await store.createFeatureRequest({
        userId: "user-1",
        title: "Publicar tema",
        description: "Tema azul",
        category: "personalizacao",
      });
      const base = {
        id: created.id,
        actorUserId: "admin-1",
        actorRole: "admin" as const,
        toStatus: "publicada" as const,
      };
      expect(
        (await store.transitionFeatureRequest({ ...base, publishedVersion: "1.0.0" }))?.publishedVersion,
      ).toBe("1.0.0");
      expect((await store.transitionFeatureRequest(base))?.publishedVersion).toBe("1.0.0");
      expect(
        (await store.transitionFeatureRequest({ ...base, publishedVersion: null }))?.publishedVersion,
      ).toBeNull();
      expect((await store.transitionFeatureRequest({ ...base, note: "Nota" }))?.adminNote).toBe("Nota");
      expect((await store.transitionFeatureRequest({ ...base, note: null }))?.adminNote).toBe("Nota");
    }
  });

  it("markNotificationRead é idempotente no memory store", async () => {
    const store = createMemoryStore();
    await baseUser(store);
    const notification = await store.createUserNotification({
      userId: "user-1",
      kind: "test",
      title: "Aviso",
      body: "Corpo",
      requestId: null,
      expiresAt: null,
    });
    expect(await store.markNotificationRead("missing", "user-1")).toBe(false);
    expect(await store.markNotificationRead(notification.id, "user-1")).toBe(true);
    const readAt = (await store.listUserNotifications("user-1", 10))[0].readAt;
    expect(readAt).not.toBeNull();
    expect(await store.markNotificationRead(notification.id, "user-1")).toBe(false);
    expect((await store.listUserNotifications("user-1", 10))[0].readAt).toBe(readAt);
    expect(await store.countUnreadNotifications("user-1")).toBe(0);
  });

  // O memory store não expõe accessor de payment_events na interface Store;
  // sua implementação faz `paymentEvents.push({ ...entry, ... })`, preservando
  // `entry.id`. Por isso o id fornecido só é verificável via consulta direta no SQL.
  it("addPaymentEvent persiste o id fornecido pelo chamador (sqlite)", async () => {
    const { store, dbPath } = sqliteStore();
    await store.addPaymentEvent({
      id: "evt-id-fornecido",
      orderId: "o3",
      paymentId: "p3",
      eventType: "webhook",
      result: "ok",
      reasonCode: "paid",
    });
    const raw = new DatabaseSync(dbPath);
    const row = raw
      .prepare("SELECT id, order_id, payment_id FROM payment_events WHERE id = ?")
      .get("evt-id-fornecido") as { id: string; order_id: string; payment_id: string } | undefined;
    raw.close();
    expect(row?.id).toBe("evt-id-fornecido");
    expect(row?.order_id).toBe("o3");
    expect(row?.payment_id).toBe("p3");
  });
});
