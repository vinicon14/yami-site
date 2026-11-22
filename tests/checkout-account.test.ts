import { describe, expect, it } from "vitest";
import { createMemoryStore } from "../lib/db/memory";
import { verifyPassword } from "../lib/auth";
import { ensureCheckoutAccount } from "../lib/checkout-account";

describe("conta no checkout", () => {
  it("cria conta com senha quando o e-mail é novo", async () => {
    const store = createMemoryStore();
    const user = await ensureCheckoutAccount(store, "novo@example.com", "SenhaTeste123!", "Novo");
    expect(user.email).toBe("novo@example.com");
    expect(await verifyPassword("SenhaTeste123!", user.passwordHash)).toBe(true);
  });

  it("reutiliza conta existente", async () => {
    const store = createMemoryStore();
    const first = await ensureCheckoutAccount(store, "novo@example.com", "SenhaTeste123!", "Novo");
    const second = await ensureCheckoutAccount(store, "novo@example.com", "", "Novo");
    expect(second.id).toBe(first.id);
  });
});
