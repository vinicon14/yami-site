import { describe, expect, it } from "vitest";
import {
  checkDownloadToken,
  generateDownloadToken,
  hashToken,
  tokenExpiry,
} from "../lib/download-token";
import { generateLicenseKey, isLicenseKeyFormat } from "../lib/license";
import { createMemoryStore } from "../lib/db/memory";
import { fulfillApprovedPayment } from "../lib/fulfill";
import { paymentMatchesOrder } from "../lib/fulfill";
import { buildPreferencePayload } from "../lib/mp-checkout";

describe("tokens de download", () => {
  it("gera token de 64 hex e hash estável e distinto por segredo", () => {
    const token = generateDownloadToken();
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(hashToken(token, "s1")).toBe(hashToken(token, "s1"));
    expect(hashToken(token, "s1")).not.toBe(hashToken(token, "s2"));
    expect(hashToken(token, "s1")).not.toBe(token);
  });

  it("aceita token ainda válido e dentro do limite", () => {
    const now = new Date("2026-11-11T22:00:00-03:00");
    const result = checkDownloadToken(
      {
        expiresAt: new Date("2026-11-12T22:00:00-03:00"),
        downloadsUsed: 0,
        maxDownloads: 5,
      },
      now,
    );
    expect(result).toEqual({ ok: true });
  });

  it("rejeita token expirado, inclusive no instante exato", () => {
    const now = new Date("2026-11-12T22:00:00-03:00");
    const expired = checkDownloadToken(
      {
        expiresAt: now,
        downloadsUsed: 0,
        maxDownloads: 5,
      },
      now,
    );
    expect(expired).toEqual({ ok: false, reason: "expired" });

    const past = checkDownloadToken(
      {
        expiresAt: new Date(now.getTime() - 1),
        downloadsUsed: 2,
        maxDownloads: 5,
      },
      now,
    );
    expect(past).toEqual({ ok: false, reason: "expired" });
  });

  it("rejeita quando o limite de downloads foi atingido, mesmo no prazo", () => {
    const now = new Date("2026-11-11T22:00:00-03:00");
    const result = checkDownloadToken(
      {
        expiresAt: new Date("2026-11-12T22:00:00-03:00"),
        downloadsUsed: 5,
        maxDownloads: 5,
      },
      now,
    );
    expect(result).toEqual({ ok: false, reason: "limit" });
  });

  it("ainda aceita o último download antes do limite", () => {
    const now = new Date("2026-11-11T22:00:00-03:00");
    const result = checkDownloadToken(
      {
        expiresAt: new Date(now.getTime() + 1000),
        downloadsUsed: 4,
        maxDownloads: 5,
      },
      now,
    );
    expect(result).toEqual({ ok: true });
  });

  it("calcula expiração de 24 horas", () => {
    const now = new Date("2026-11-11T22:00:00.000Z");
    expect(tokenExpiry(24, now).toISOString()).toBe("2026-11-12T22:00:00.000Z");
  });
});

describe("chave de licença", () => {
  it("segue o formato YAMI-XXXX-XXXX-XXXX-XXXX", () => {
    for (let i = 0; i < 20; i++) {
      const key = generateLicenseKey();
      expect(isLicenseKeyFormat(key)).toBe(true);
    }
  });
});

describe("preferência Checkout Pro", () => {
  it("cobra em BRL, com Pix (bank_transfer) liberado e boleto excluído", () => {
    const payload = buildPreferencePayload({
      orderId: "ord-1",
      email: "alguem@example.com",
      price: 20,
      siteUrl: "https://yami.example",
      version: "0.62.0",
    });
    expect(payload.items[0]?.unit_price).toBe(20);
    expect(payload.items[0]?.currency_id).toBe("BRL");
    expect(payload.external_reference).toBe("ord-1");
    expect(payload.auto_return).toBe("approved");
    const excluded = payload.payment_methods.excluded_payment_types.map((t) => t.id);
    expect(excluded).toContain("ticket");
    expect(excluded).not.toContain("bank_transfer");
    expect(excluded).not.toContain("credit_card");
    expect(excluded).not.toContain("debit_card");
    expect(payload.notification_url).toBe(
      "https://yami.example/api/mp/webhook",
    );
    expect(payload.payment_methods.installments).toBe(1);
  });

  it("não pede auto_return em HTTP local", () => {
    const payload = buildPreferencePayload({
      orderId: "ord-1",
      email: "alguem@example.com",
      price: 20,
      siteUrl: "http://localhost:3000",
      version: "0.62.0",
    });
    expect(payload.auto_return).toBeUndefined();
  });
});

describe("pagamento × pedido", () => {
  const order = {
    id: "ord-1",
    email: "a@b.com",
    name: null,
    amountBrl: 20,
    currency: "BRL" as const,
    status: "pending" as const,
    mpPreferenceId: null,
    mpPaymentId: null,
    createdAt: new Date().toISOString(),
    paidAt: null,
  };

  it("aceita pagamento aprovado no valor certo", () => {
    // PRICE_BRL padrão 20, alinhado ao pedido.
    process.env.PRICE_BRL = "20";
    const check = paymentMatchesOrder(
      {
        id: 1,
        status: "approved",
        transaction_amount: 20,
        currency_id: "BRL",
        external_reference: "ord-1",
      },
      order,
    );
    expect(check.ok).toBe(true);
  });

  it("rejeita valor diferente ou status pendente", () => {
    process.env.PRICE_BRL = "20";
    expect(
      paymentMatchesOrder(
        {
          id: 1,
          status: "approved",
          transaction_amount: 1,
          currency_id: "BRL",
          external_reference: "ord-1",
        },
        order,
      ).ok,
    ).toBe(false);
    expect(
      paymentMatchesOrder(
        {
          id: 1,
          status: "pending",
          transaction_amount: 20,
          currency_id: "BRL",
          external_reference: "ord-1",
        },
        order,
      ).reason,
    ).toBe("status_pending");
  });
});

describe("entrega após pagamento (loja em memória)", () => {
  it("é idempotente e emite licença + token", async () => {
    process.env.PRICE_BRL = "20";
    process.env.DOWNLOAD_TOKEN_SECRET = "test-download-secret";
    const store = createMemoryStore();
    const order = await store.createOrder({
      id: "ord-mem-1",
      email: "comprador@example.com",
      amountBrl: 20,
    });
    const first = await fulfillApprovedPayment({
      store,
      orderId: order.id,
      paymentId: "pay-99",
      payment: {
        id: "pay-99",
        status: "approved",
        transaction_amount: 20,
        currency_id: "BRL",
        external_reference: order.id,
      },
    });
    expect(first.alreadyPaid).toBe(false);
    expect(first.license.key.startsWith("YAMI-")).toBe(true);
    expect(first.downloadToken).toMatch(/^[a-f0-9]{64}$/);

    const second = await fulfillApprovedPayment({
      store,
      orderId: order.id,
      paymentId: "pay-99",
      payment: {
        id: "pay-99",
        status: "approved",
        transaction_amount: 20,
        currency_id: "BRL",
        external_reference: order.id,
      },
    });
    expect(second.alreadyPaid).toBe(true);
    expect(second.license.key).toBe(first.license.key);
  });
});
