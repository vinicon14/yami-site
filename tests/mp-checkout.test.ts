import { describe, expect, it } from "vitest";
import {
  buildPreferencePayload,
  checkoutInitPoint,
  reusablePendingOrder,
  SAME_COLLECTOR_WARNING,
} from "../lib/mp-checkout";

const now = Date.parse("2026-11-16T03:00:00.000Z");

function order(overrides: Partial<Parameters<typeof reusablePendingOrder>[0][number]> & { id?: string } = {}) {
  return {
    id: overrides.id ?? "ord-1",
    status: "pending",
    amountBrl: 20,
    mpPreferenceId: "2368076458-aaaa-bbbb-cccc",
    createdAt: "2026-11-14T19:09:46.987Z",
    ...overrides,
  };
}

describe("buildPreferencePayload", () => {
  it("monta back_urls, notification_url, auto_return e pagador no site HTTPS", () => {
    const payload = buildPreferencePayload({
      orderId: "order-1",
      email: "comprador@example.com",
      name: "Ana",
      price: 20,
      siteUrl: "https://yami-site-pi.vercel.app",
      version: "0.62.0",
    });
    expect(payload.back_urls).toEqual({
      success: "https://yami-site-pi.vercel.app/sucesso",
      failure: "https://yami-site-pi.vercel.app/checkout?status=falhou",
      pending: "https://yami-site-pi.vercel.app/checkout?status=pendente",
    });
    expect(payload.auto_return).toBe("approved");
    expect(payload.notification_url).toBe(
      "https://yami-site-pi.vercel.app/api/mp/webhook",
    );
    expect(payload.payer).toEqual({ email: "comprador@example.com", name: "Ana" });
    expect(payload.external_reference).toBe("order-1");
    expect(payload.payment_methods.excluded_payment_types).toEqual([
      { id: "ticket" },
      { id: "atm" },
    ]);
  });

  it("não envia auto_return em HTTP (localhost)", () => {
    const payload = buildPreferencePayload({
      orderId: "order-1",
      email: "comprador@example.com",
      price: 20,
      siteUrl: "http://localhost:3000",
      version: "0.62.0",
    });
    expect(payload.auto_return).toBeUndefined();
  });
});

describe("reusablePendingOrder", () => {
  it("devolve o pedido pendente mais recente com preferência e o mesmo valor", () => {
    const found = reusablePendingOrder(
      [
        order({ id: "old", createdAt: "2026-11-13T02:45:36.136Z" }),
        order({
          id: "new",
          mpPreferenceId: "pref-new",
          createdAt: "2026-11-14T19:09:46.987Z",
        }),
      ],
      { amountBrl: 20, now },
    );
    expect(found?.id).toBe("new");
    expect(found?.mpPreferenceId).toBe("pref-new");
  });

  it("ignora pedidos pagos, de outro valor, sem preferência ou velhos demais", () => {
    expect(
      reusablePendingOrder(
        [
          order({ id: "paid", status: "paid" }),
          order({ id: "other-price", amountBrl: 30 }),
          order({ id: "no-pref", mpPreferenceId: null }),
          order({ id: "old", createdAt: "2026-10-01T00:00:00.000Z" }),
        ],
        { amountBrl: 20, now },
      ),
    ).toBeNull();
  });
});

describe("checkoutInitPoint", () => {
  it("aponta para o Checkout Pro de produção", () => {
    expect(checkoutInitPoint("2368076458-aaaa-bbbb-cccc")).toBe(
      "https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=2368076458-aaaa-bbbb-cccc",
    );
  });
});

describe("SAME_COLLECTOR_WARNING", () => {
  it("explica que o comprador não pode usar a conta da loja", () => {
    expect(SAME_COLLECTOR_WARNING.toLowerCase()).toMatch(/mesma conta/);
    expect(SAME_COLLECTOR_WARNING.toLowerCase()).toMatch(/mercado pago/);
  });
});
