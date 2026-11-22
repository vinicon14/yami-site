import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { paymentMatchesOrder } from "../lib/fulfill";
import { chargesEnabled } from "../lib/config";
import type { Order } from "../lib/db";

const originalPriceBrl = process.env.PRICE_BRL;

beforeEach(() => {
  process.env.PRICE_BRL = "20";
});

afterEach(() => {
  if (originalPriceBrl === undefined) delete process.env.PRICE_BRL;
  else process.env.PRICE_BRL = originalPriceBrl;
});

const order: Order = {
  id: "pedido-1",
  email: "cliente@example.com",
  name: null,
  amountBrl: 20,
  currency: "BRL",
  status: "pending",
  mpPreferenceId: "pref-1",
  mpPaymentId: null,
  createdAt: "2026-11-21T00:00:00.000Z",
  paidAt: null,
};

describe("paymentMatchesOrder", () => {
  it("rejeita pagamento aprovado sem external_reference", () => {
    const result = paymentMatchesOrder({
      id: 123,
      status: "approved",
      currency_id: "BRL",
      transaction_amount: 20,
    }, order);
    expect(result).toEqual({ ok: false, reason: "missing_external_reference" });
  });

  it("rejeita referência de outro pedido", () => {
    const result = paymentMatchesOrder({
      id: 123,
      status: "approved",
      currency_id: "BRL",
      transaction_amount: 20,
      external_reference: "pedido-2",
    }, order);
    expect(result).toEqual({ ok: false, reason: "external_reference_mismatch" });
  });

  it("rejeita valor diferente do configurado", () => {
    const result = paymentMatchesOrder({
      id: 123,
      status: "approved",
      currency_id: "BRL",
      transaction_amount: 19,
      external_reference: "pedido-1",
    }, order);
    expect(result).toEqual({ ok: false, reason: "amount_mismatch" });
  });

  it("aceita pagamento correto", () => {
    const result = paymentMatchesOrder({
      id: 123,
      status: "approved",
      currency_id: "BRL",
      transaction_amount: 20,
      external_reference: "pedido-1",
    }, order);
    expect(result).toEqual({ ok: true });
  });
});

describe("chargesEnabled em produção", () => {
  it("exige token e segredo do webhook", () => {
    const originalMode = process.env.MP_MODE;
    const originalToken = process.env.MP_ACCESS_TOKEN;
    const originalSecret = process.env.MP_WEBHOOK_SECRET;
    try {
      process.env.PRICE_BRL = "20";
      process.env.MP_MODE = "production";
      process.env.MP_ACCESS_TOKEN = "token-teste";
      delete process.env.MP_WEBHOOK_SECRET;
      expect(chargesEnabled()).toBe(false);
      process.env.MP_WEBHOOK_SECRET = "segredo-teste";
      expect(chargesEnabled()).toBe(true);
    } finally {
      if (originalPriceBrl === undefined) delete process.env.PRICE_BRL;
      else process.env.PRICE_BRL = originalPriceBrl;
      if (originalMode === undefined) delete process.env.MP_MODE;
      else process.env.MP_MODE = originalMode;
      if (originalToken === undefined) delete process.env.MP_ACCESS_TOKEN;
      else process.env.MP_ACCESS_TOKEN = originalToken;
      if (originalSecret === undefined) delete process.env.MP_WEBHOOK_SECRET;
      else process.env.MP_WEBHOOK_SECRET = originalSecret;
    }
  });
});
