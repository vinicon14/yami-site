import { describe, expect, it } from "vitest";
import {
  normalizePaymentEvent,
  type PaymentEventInput,
} from "../lib/payment-events";

function makeInput(overrides: Partial<PaymentEventInput> = {}): PaymentEventInput {
  return {
    orderId: "pedido-1",
    paymentId: "pagamento-1",
    eventType: "webhook",
    result: "ok",
    reasonCode: "approved",
    ...overrides,
  };
}

describe("normalizePaymentEvent", () => {
  it("trunca orderId em 80 e paymentId em 40 caracteres", () => {
    const long = "x".repeat(200);
    expect(normalizePaymentEvent(makeInput({ orderId: long, paymentId: long }))).toEqual({
      orderId: long.slice(0, 80),
      paymentId: long.slice(0, 40),
      eventType: "webhook",
      result: "ok",
      reasonCode: "approved",
    });
  });

  it("preserva ids nulos", () => {
    expect(normalizePaymentEvent(makeInput({ orderId: null, paymentId: null }))).toMatchObject({
      orderId: null,
      paymentId: null,
    });
  });

  it("troca motivo desconhecido por other", () => {
    expect(normalizePaymentEvent(makeInput({ reasonCode: "motivo_inexistente" })).reasonCode).toBe("other");
  });

  it.each([
    "approved",
    "duplicate",
    "amount_mismatch",
    "signature_invalid",
    "payment_fetch_failed",
    "status_pending",
    "no_payment_id",
  ])("mantém o código permitido %s", (reasonCode) => {
    expect(normalizePaymentEvent(makeInput({ reasonCode })).reasonCode).toBe(reasonCode);
  });

  it("aceita os códigos do fluxo atual do webhook", () => {
    for (const reasonCode of [
      "no_payment_id",
      "no_reference",
      "status_pending",
      "status_in_process",
    ]) {
      expect(normalizePaymentEvent(makeInput({ reasonCode })).reasonCode).toBe(reasonCode);
    }
  });
});
