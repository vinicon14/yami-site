import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMemoryStore } from "../lib/db/memory";
import { processMercadoPagoNotification } from "../lib/mp-webhook";
import {
  buildManifest,
  computeSignatureHex,
} from "../lib/mp-signature";
import type { MpPayment } from "../lib/mp-checkout";
import { fulfillApprovedPayment } from "../lib/fulfill";

const ORDER_ID = "order-1111-2222-3333";
const PAYMENT_ID = "999888777";

function approvedPayment(overrides: Partial<MpPayment> = {}): MpPayment {
  return {
    id: PAYMENT_ID,
    status: "approved",
    live_mode: true,
    transaction_amount: 20,
    currency_id: "BRL",
    external_reference: ORDER_ID,
    ...overrides,
  };
}

async function seededStore() {
  const store = createMemoryStore();
  await store.createOrder({
    id: ORDER_ID,
    email: "comprador@example.com",
    amountBrl: 20,
  });
  return store;
}

describe("processMercadoPagoNotification", () => {
  const env = { ...process.env };

  beforeEach(() => {
    process.env.MP_MODE = "production";
    process.env.MP_ACCESS_TOKEN = "test-token-not-real";
    process.env.PRICE_BRL = "20";
    delete process.env.MP_WEBHOOK_SECRET;
    delete process.env.VERCEL;
    // NODE_ENV já é test no vitest
  });

  afterEach(() => {
    process.env = { ...env };
  });

  it("sem segredo, confia só no pagamento buscado na API (aprovado, pedido e R$ 20)", async () => {
    const store = await seededStore();
    const result = await processMercadoPagoNotification({
      body: { type: "payment", data: { id: PAYMENT_ID } },
      url: new URL("https://yami.example/api/mp/webhook"),
      headers: { signature: null, requestId: null },
      store,
      fetchPaymentFn: async () => approvedPayment(),
    });
    expect(result).toMatchObject({ ok: true, fulfilled: true });
    const order = await store.getOrderById(ORDER_ID);
    expect(order?.status).toBe("paid");
    expect(order?.mpPaymentId).toBe(PAYMENT_ID);
    const license = await store.getLicenseByOrderId(ORDER_ID);
    expect(license?.key).toMatch(/^YAMI-/);
  });

  it("é idempotente: a segunda notificação do mesmo pagamento não quebra e não cria outra licença", async () => {
    const store = await seededStore();
    const first = await fulfillApprovedPayment({
      store,
      orderId: ORDER_ID,
      paymentId: PAYMENT_ID,
      payment: approvedPayment(),
    });
    const result = await processMercadoPagoNotification({
      body: { type: "payment", data: { id: PAYMENT_ID } },
      url: new URL("https://yami.example/api/mp/webhook"),
      headers: { signature: null, requestId: null },
      store,
      fetchPaymentFn: async () => approvedPayment(),
    });
    expect(result).toMatchObject({ ok: true, fulfilled: true, alreadyPaid: true });
    const license = await store.getLicenseByOrderId(ORDER_ID);
    expect(license?.id).toBe(first.license.id);
    expect(license?.key).toBe(first.license.key);
  });

  it("recusa pagamento não aprovado, mesmo que o corpo da notificação diga o contrário", async () => {
    const store = await seededStore();
    const result = await processMercadoPagoNotification({
      body: { type: "payment", data: { id: PAYMENT_ID }, action: "payment.updated" },
      url: new URL("https://yami.example/api/mp/webhook"),
      headers: { signature: null, requestId: null },
      store,
      fetchPaymentFn: async () => approvedPayment({ status: "pending" }),
    });
    expect(result).toMatchObject({ ok: true, skipped: "status_pending" });
    const order = await store.getOrderById(ORDER_ID);
    expect(order?.status).toBe("pending");
  });

  it("recusa valor diferente de R$ 20,00", async () => {
    const store = await seededStore();
    const result = await processMercadoPagoNotification({
      body: { type: "payment", data: { id: PAYMENT_ID } },
      url: new URL("https://yami.example/api/mp/webhook"),
      headers: { signature: null, requestId: null },
      store,
      fetchPaymentFn: async () => approvedPayment({ transaction_amount: 1 }),
    });
    expect(result).toMatchObject({ ok: true, skipped: "amount_mismatch" });
    const order = await store.getOrderById(ORDER_ID);
    expect(order?.status).toBe("pending");
  });

  it("ignora pagamento cujo external_reference não é um pedido conhecido", async () => {
    const store = await seededStore();
    const result = await processMercadoPagoNotification({
      body: { type: "payment", data: { id: PAYMENT_ID } },
      url: new URL("https://yami.example/api/mp/webhook"),
      headers: { signature: null, requestId: null },
      store,
      fetchPaymentFn: async () =>
        approvedPayment({ external_reference: "outro-pedido" }),
    });
    expect(result).toMatchObject({ ok: true, skipped: "unknown_order" });
    const order = await store.getOrderById(ORDER_ID);
    expect(order?.status).toBe("pending");
  });

  it("com MP_WEBHOOK_SECRET, rejeita notificação sem assinatura válida", async () => {
    process.env.MP_WEBHOOK_SECRET = "test-webhook-secret-not-real";
    const store = await seededStore();
    const result = await processMercadoPagoNotification({
      body: { type: "payment", data: { id: PAYMENT_ID } },
      url: new URL("https://yami.example/api/mp/webhook"),
      headers: { signature: "ts=1,v1=deadbeef", requestId: "req-1" },
      store,
      fetchPaymentFn: async () => approvedPayment(),
    });
    expect(result).toEqual({ ok: false, error: "assinatura inválida", status: 401 });
    const order = await store.getOrderById(ORDER_ID);
    expect(order?.status).toBe("pending");
  });

  it("com MP_WEBHOOK_SECRET, aceita assinatura válida e ainda consulta o pagamento", async () => {
    const secret = "test-webhook-secret-not-real";
    process.env.MP_WEBHOOK_SECRET = secret;
    const ts = String(Math.floor(Date.now() / 1000));
    const requestId = "req-abc";
    const manifest = buildManifest(PAYMENT_ID, requestId, ts);
    const v1 = computeSignatureHex(manifest, secret);
    const store = await seededStore();
    let fetched = false;
    const result = await processMercadoPagoNotification({
      body: { type: "payment", data: { id: PAYMENT_ID } },
      url: new URL("https://yami.example/api/mp/webhook"),
      headers: { signature: `ts=${ts},v1=${v1}`, requestId },
      store,
      fetchPaymentFn: async () => {
        fetched = true;
        return approvedPayment();
      },
    });
    expect(fetched).toBe(true);
    expect(result).toMatchObject({ ok: true, fulfilled: true });
  });
});
