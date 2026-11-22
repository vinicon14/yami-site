import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryStore } from "../lib/db/memory";
import type { Store } from "../lib/db";
import type { MpPayment } from "../lib/mp-checkout";
import { processMercadoPagoNotification } from "../lib/mp-webhook";
import {
  normalizePaymentEvent,
  type PaymentEventInput,
} from "../lib/payment-events";

const ORDER_ID = "pedido-log-1";
const PAYMENT_ID = "777666555";
const WEBHOOK_URL = new URL("https://yami.example/api/mp/webhook");

function payment(overrides: Partial<MpPayment> = {}): MpPayment {
  return {
    id: PAYMENT_ID,
    status: "approved",
    currency_id: "BRL",
    transaction_amount: 20,
    external_reference: ORDER_ID,
    ...overrides,
  };
}

async function seededStore(): Promise<Store> {
  const store = createMemoryStore();
  await store.createOrder({ id: ORDER_ID, email: "cliente@example.com", amountBrl: 20 });
  return store;
}

async function notify(store: Store, fetched: MpPayment) {
  return processMercadoPagoNotification({
    body: { type: "payment", data: { id: PAYMENT_ID } },
    url: WEBHOOK_URL,
    headers: { signature: null, requestId: null },
    store,
    fetchPaymentFn: async () => fetched,
  });
}

function captureEvents(store: Store): PaymentEventInput[] {
  const logged: PaymentEventInput[] = [];
  vi.spyOn(store, "addPaymentEvent").mockImplementation(async (entry) => {
    logged.push({
      orderId: entry.orderId,
      paymentId: entry.paymentId,
      eventType: entry.eventType,
      result: entry.result,
      reasonCode: entry.reasonCode,
    });
  });
  return logged;
}

describe("auditoria de eventos do webhook", () => {
  const env = { ...process.env };

  beforeEach(() => {
    process.env.MP_MODE = "production";
    process.env.MP_ACCESS_TOKEN = "test-token-not-real";
    process.env.PRICE_BRL = "20";
    delete process.env.MP_WEBHOOK_SECRET;
    delete process.env.VERCEL;
  });

  afterEach(() => {
    process.env = { ...env };
    vi.restoreAllMocks();
  });

  it("registra fulfill, duplicate e falha com códigos de motivo normalizados", async () => {
    const store = await seededStore();
    const logged = captureEvents(store);

    const first = await notify(store, payment());
    const second = await notify(store, payment());
    const failed = await notify(store, payment({ status: "pending" }));

    expect(first).toMatchObject({ ok: true, fulfilled: true, alreadyPaid: false });
    expect(second).toMatchObject({ ok: true, fulfilled: true, alreadyPaid: true });
    expect(failed).toMatchObject({ ok: true, skipped: "status_pending" });

    expect(logged).toContainEqual({
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
      eventType: "fulfill",
      result: "ok",
      reasonCode: "approved",
    });
    expect(logged).toContainEqual(
      expect.objectContaining({
        eventType: "duplicate",
        result: "ok",
        reasonCode: "duplicate",
      }),
    );
    expect(logged).toContainEqual(
      expect.objectContaining({
        eventType: "match_failed",
        result: "skipped",
        reasonCode: "status_pending",
      }),
    );
    for (const event of logged) {
      expect(event.reasonCode).toBe(normalizePaymentEvent(event).reasonCode);
    }
  });

  it("não altera a resposta nem a liberação quando o log de auditoria falha", async () => {
    const store = await seededStore();
    vi.spyOn(store, "addPaymentEvent").mockRejectedValue(new Error("db indisponível"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await notify(store, payment());
    const failed = await notify(store, payment({ status: "pending" }));

    expect(result).toMatchObject({ ok: true, fulfilled: true, alreadyPaid: false });
    expect(failed).toMatchObject({ ok: true, skipped: "status_pending" });
    expect((await store.getOrderById(ORDER_ID))?.status).toBe("paid");
    expect(await store.getLicenseByOrderId(ORDER_ID)).not.toBeNull();

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("falha ao registrar evento de pagamento"));
    for (const [message] of consoleSpy.mock.calls) {
      expect(message).not.toContain("test-token-not-real");
      expect(message).not.toContain("db indisponível");
      expect(message).not.toContain(PAYMENT_ID);
    }
  });
});
