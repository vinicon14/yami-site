import { describe, expect, it } from "vitest";
import { fulfillApprovedPayment } from "../lib/fulfill";
import { createMemoryStore } from "../lib/db/memory";
import type { MpPayment } from "../lib/mp-checkout";

const payment: MpPayment = {
  id: 555,
  status: "approved",
  currency_id: "BRL",
  transaction_amount: 20,
  external_reference: "pedido-1",
};

describe("fulfillApprovedPayment", () => {
  it("cria uma licença e não emite token em webhook duplicado", async () => {
    const store = createMemoryStore();
    await store.createOrder({ id: "pedido-1", email: "cliente@example.com", amountBrl: 20 });
    const first = await fulfillApprovedPayment({ store, orderId: "pedido-1", paymentId: "555", payment });
    const second = await fulfillApprovedPayment({ store, orderId: "pedido-1", paymentId: "555", payment });
    expect(first.license.id).toBe(second.license.id);
    expect(first.alreadyPaid).toBe(false);
    expect(second.alreadyPaid).toBe(true);
    expect(second.downloadToken).toBe("");
    expect((await store.getLicensesByEmail("cliente@example.com")).length).toBe(1);
  });
});
