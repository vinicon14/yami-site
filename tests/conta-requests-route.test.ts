import { describe, expect, it } from "vitest";
import { createMemoryStore } from "../lib/db/memory";
import { createSessionForUser } from "../lib/auth";
import { setStoreForTests } from "../lib/db";
import { POST } from "../app/api/conta/requests/route";

const BODY = JSON.stringify({
  title: "Modo escuro no painel",
  description: "Quero um tema escuro para usar à noite sem cansar a vista.",
  category: "interface",
});

function postReq(cookie?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) headers.cookie = `yami_session=${cookie}`;
  return new Request("http://localhost:3000/api/conta/requests", {
    method: "POST",
    headers,
    body: BODY,
  });
}

describe("POST /api/conta/requests", () => {
  it("responde só com campos públicos da solicitação", async () => {
    const store = createMemoryStore();
    setStoreForTests(store);
    const user = await store.createUser({ id: "u1", email: "u@example.com", passwordHash: "x" });
    const { raw } = await createSessionForUser(user);

    const res = await POST(postReq(raw));
    expect(res.status).toBe(201);
    const data = await res.json();

    expect(data.item).toEqual({
      id: expect.any(String),
      title: "Modo escuro no painel",
      description: "Quero um tema escuro para usar à noite sem cansar a vista.",
      category: "interface",
      status: "pendente",
      publishedVersion: null,
      fileName: null,
      fileSize: null,
      fileSha256: null,
      fileBlobPathname: null,
      appVersion: null,
      appIcon: null,
      publishedAssetUrl: null,
      publishedAt: null,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(data.item).not.toHaveProperty("userId");
    expect(data.item).not.toHaveProperty("adminNote");
  });

  it("retorna 401 sem cookie de sessão", async () => {
    const res = await POST(postReq());
    expect(res.status).toBe(401);
  });
});
