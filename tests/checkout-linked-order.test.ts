import { afterEach, describe, expect, it } from "vitest";
import { createMemoryStore } from "../lib/db/memory";
import { setStoreForTests } from "../lib/db";
import { POST as checkoutPost } from "../app/api/checkout/route";
import { ensureCheckoutAccount } from "../lib/checkout-account";

describe("checkout com conta", () => {
  afterEach(() => {
    delete process.env.MP_MODE;
  });

  it("cria pedido vinculado à conta", async () => {
    process.env.MP_MODE = "test";
    const store = createMemoryStore();
    setStoreForTests(store);
    await ensureCheckoutAccount(store, "cliente@example.com", "SenhaTeste123!", "Cliente");
    const res = await checkoutPost(new Request("http://localhost:3000/api/checkout", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify({ email: "cliente@example.com", password: "", name: "Cliente", accepted: true }),
    }));
    expect(res.status).toBe(303);
    const orders = await store.getOrdersByEmail("cliente@example.com");
    expect(orders[0]?.userId).toBeTruthy();
  });
});
