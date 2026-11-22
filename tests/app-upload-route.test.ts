import { describe, expect, it } from "vitest";
import { createMemoryStore } from "../lib/db/memory";
import { createSessionForUser, hashPassword } from "../lib/auth";
import { setStoreForTests } from "../lib/db";
import { POST as uploadPost } from "../app/api/uploads/app/route";

describe("upload de app", () => {
  it("exige licença", async () => {
    const store = createMemoryStore();
    setStoreForTests(store);
    const user = await store.createUser({ id: "u1", email: "u@example.com", passwordHash: await hashPassword("senha-forte-123"), name: "U", status: "ativo", licenseId: null });
    const { raw } = await createSessionForUser(user);
    const res = await uploadPost(new Request("http://localhost:3000/api/uploads/app", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000", cookie: `yami_session=${raw}` },
      body: JSON.stringify({ pathname: "apps/test.AppImage", clientPayload: JSON.stringify({ kind: "app", filename: "test.AppImage", version: "1.0.0", size: 1000, sha256: "a".repeat(64) }) }),
    }));
    expect(res.status).toBe(403);
  });
});
