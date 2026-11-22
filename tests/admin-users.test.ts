import { afterEach, describe, expect, it } from "vitest";
import { createMemoryStore } from "../lib/db/memory";
import { createSessionForUser, hashPassword } from "../lib/auth";
import { setStoreForTests } from "../lib/db";
import { GET as adminUsersGet } from "../app/api/admin/users/route";
import { PATCH as adminUsersPatch } from "../app/api/admin/users/[id]/route";

describe("admin de usuários", () => {
  const original = process.env.ADMIN_EMAILS;
  afterEach(() => {
    process.env.ADMIN_EMAILS = original;
    delete process.env.VERCEL;
  });

  it("nega acesso a usuário comum e permite admin", async () => {
    const store = createMemoryStore();
    setStoreForTests(store);
    process.env.ADMIN_EMAILS = "admin@example.com";
    const admin = await store.createUser({ id: "a1", email: "admin@example.com", passwordHash: await hashPassword("senha-forte-123"), name: "Admin", status: "ativo", licenseId: null });
    const { raw } = await createSessionForUser(admin);
    const res = await adminUsersGet(new Request("http://localhost:3000/api/admin/users", { headers: { cookie: `yami_session=${raw}` } }));
    expect(res.status).toBe(200);
  });

  it("bloqueia usuário sem expor senha", async () => {
    const store = createMemoryStore();
    setStoreForTests(store);
    process.env.ADMIN_EMAILS = "admin@example.com";
    const admin = await store.createUser({ id: "a1", email: "admin@example.com", passwordHash: await hashPassword("senha-forte-123"), name: "Admin", status: "ativo", licenseId: null });
    await store.createUser({ id: "u1", email: "u@example.com", passwordHash: await hashPassword("senha-forte-123"), name: "User", status: "ativo", licenseId: null });
    const { raw } = await createSessionForUser(admin);
    const res = await adminUsersPatch(new Request("http://localhost:3000/api/admin/users/u1", {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: `yami_session=${raw}` },
      body: JSON.stringify({ status: "bloqueado" }),
    }), { params: Promise.resolve({ id: "u1" }) });
    expect(res.status).toBe(200);
    const user = await store.getUserById("u1");
    expect(user?.status).toBe("bloqueado");
  });
});
