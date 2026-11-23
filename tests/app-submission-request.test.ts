import { afterEach, describe, expect, it } from "vitest";
import { createMemoryStore } from "../lib/db/memory";
import { hashPassword } from "../lib/auth";
import { createSessionForUser } from "../lib/auth";
import { setStoreForTests } from "../lib/db";
import { POST as requestPost } from "../app/api/conta/requests/route";

describe("solicitação com arquivo", () => {
  afterEach(() => {
    delete process.env.VERCEL;
  });

  it("grava metadados do app", async () => {
    const store = createMemoryStore();
    setStoreForTests(store);
    const user = await store.createUser({ id: "u1", email: "u@example.com", passwordHash: await hashPassword("senha-forte-123"), name: "U", status: "ativo", licenseId: null });
    await store.createOrder({ id: "o1", email: "u@example.com", amountBrl: 20, userId: "u1" });
    await store.createLicense("o1", "YAMI-DEMO-KEY");
    const { raw } = await createSessionForUser(user);
    const res = await requestPost(new Request("http://localhost:3000/api/conta/requests", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: `yami_session=${raw}` },
      body: JSON.stringify({
        title: "Meu app",
        description: "Descrição do aplicativo",
        category: "produtividade",
        fileName: "meu-app.AppImage",
        fileSize: 1000,
        fileSha256: "a".repeat(64),
        fileBlobPathname: "apps/teste/meu-app.AppImage",
        appVersion: "1.0.0",
      }),
    }));
    expect(res.status).toBe(201);
    const items = await store.listFeatureRequests("u1");
    expect(items[0]?.fileName).toBe("meu-app.AppImage");
  });
});
