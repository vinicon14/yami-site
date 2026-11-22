import { describe, expect, it } from "vitest";
import { createMemoryStore } from "../lib/db/memory";
import { fulfillApprovedPayment } from "../lib/fulfill";

describe("licença vinculada", () => {
  it("grava license_id no usuário", async () => {
    const store = createMemoryStore();
    await store.createUser({ id: "u1", email: "u@example.com", passwordHash: "hash", name: "U", status: "ativo", licenseId: null });
    await store.createOrder({ id: "o1", email: "u@example.com", amountBrl: 20, userId: "u1" });
    const result = await fulfillApprovedPayment({ store, orderId: "o1", paymentId: "p1" });
    const user = await store.getUserById("u1");
    expect(user?.licenseId).toBe(result.license.id);
  });
});
