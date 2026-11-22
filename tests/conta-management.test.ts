import { describe, expect, it } from "vitest";
import { createMemoryStore } from "../lib/db/memory";
import { createSessionForUser, hashPassword } from "../lib/auth";
import { setStoreForTests } from "../lib/db";
import { PATCH as contaPatch } from "../app/api/conta/route";

describe("gerenciamento de conta", () => {
  it("altera nome e senha", async () => {
    const store = createMemoryStore();
    setStoreForTests(store);
    const user = await store.createUser({ id: "u1", email: "u@example.com", passwordHash: await hashPassword("senha-antiga"), name: "Antigo", status: "ativo", licenseId: null });
    const { raw } = await createSessionForUser(user);
    const res = await contaPatch(new Request("http://localhost:3000/api/conta", {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: `yami_session=${raw}` },
      body: JSON.stringify({ name: "Novo", password: "senha-nova-123" }),
    }));
    expect(res.status).toBe(200);
    const updated = await store.getUserById("u1");
    expect(updated?.name).toBe("Novo");
  });
});
