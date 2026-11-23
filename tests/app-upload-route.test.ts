import { describe, expect, it } from "vitest";
import { createMemoryStore } from "../lib/db/memory";
import { createSessionForUser, hashPassword } from "../lib/auth";
import { setStoreForTests } from "../lib/db";
import { POST as uploadPost } from "../app/api/uploads/app/route";

describe("upload de app", () => {
  it("aceita conta sem licença e recusa conta bloqueada", async () => {
    const store = createMemoryStore();
    setStoreForTests(store);
    const user = await store.createUser({ id: "u1", email: "u@example.com", passwordHash: await hashPassword("senha-forte-123"), name: "U" });
    const { raw } = await createSessionForUser(user);
    const res = await uploadPost(new Request("http://localhost:3000/api/uploads/app", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000", cookie: `yami_session=${raw}` },
      body: JSON.stringify({ pathname: "apps/test.AppImage", clientPayload: JSON.stringify({ kind: "app", filename: "test.AppImage", version: "1.0.0", size: 1000, sha256: "a".repeat(64) }) }),
    }));
    const data = await res.json();
    expect(data.error).not.toBe("licença necessária");
    expect(res.status).not.toBe(403);

    await store.updateUser(user.id, { status: "bloqueado" });
    const blocked = await uploadPost(new Request("http://localhost:3000/api/uploads/app", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000", cookie: `yami_session=${raw}` },
      body: JSON.stringify({ pathname: "apps/test.AppImage", clientPayload: "{}" }),
    }));
    expect(blocked.status).toBe(403);
  });
});
