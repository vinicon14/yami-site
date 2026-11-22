import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMemoryStore } from "../lib/db/memory";
import { createSessionForUser, hashPassword } from "../lib/auth";
import { getStore, setStoreForTests } from "../lib/db";
import { resetRateLimits } from "../lib/rate-limit";
import { POST as loginPost } from "../app/api/desktop/login/route";
import { GET as sessionGet } from "../app/api/desktop/session/route";
import { POST as logoutPost } from "../app/api/desktop/logout/route";
import { GET as requestsGet, POST as requestPost } from "../app/api/desktop/requests/route";
import {
  DELETE as requestDelete,
  GET as requestGet,
  PATCH as requestPatch,
} from "../app/api/desktop/requests/[id]/route";
import { GET as notificationsGet } from "../app/api/desktop/notifications/route";
import { PATCH as notificationPatch } from "../app/api/desktop/notifications/[id]/route";
import { GET as adminRequestsGet } from "../app/api/admin/requests/route";
import { POST as adminRequestPost } from "../app/api/admin/requests/[id]/route";

const PASSWORD = "senha-forte-123";
const ORIGIN = "http://localhost:3000";

async function seed() {
  const store = createMemoryStore();
  setStoreForTests(store);
  await store.createUser({ id: "u1", email: "u@example.com", passwordHash: await hashPassword(PASSWORD) });
  await store.createUser({ id: "u2", email: "outro@example.com", passwordHash: await hashPassword(PASSWORD) });
  await store.createUser({ id: "adm", email: "chefe@example.com", passwordHash: await hashPassword(PASSWORD) });
  return store;
}

function req(url: string, init?: RequestInit) {
  return new Request(`http://localhost:3000${url}`, init);
}

function loginReq(email: string, password = PASSWORD, origin: string | null = ORIGIN) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (origin !== null) headers.origin = origin;
  return req("/api/desktop/login", {
    method: "POST",
    headers,
    body: JSON.stringify({ email, password, deviceName: "YAMI OS" }),
  });
}

async function loginAs(email: string): Promise<string> {
  const res = await loginPost(loginReq(email));
  return (await res.json()).deviceToken as string;
}

function bearer(token: string) {
  return { authorization: `Bearer ${token}` };
}

function jsonHeaders(token: string) {
  return { ...bearer(token), "content-type": "application/json" };
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("rotas desktop", () => {
  beforeEach(() => {
    resetRateLimits();
  });

  it("faz login, lê sessão e cria solicitação", async () => {
    await seed();
    const loginRes = await loginPost(req("/api/desktop/login", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify({ email: "u@example.com", password: "senha-forte-123", deviceName: "YAMI OS" }),
    }));
    expect(loginRes.status).toBe(200);
    const { deviceToken } = await loginRes.json();

    const headers = { authorization: `Bearer ${deviceToken}` };
    const sessionRes = await sessionGet(req("/api/desktop/session", { headers }));
    expect(sessionRes.status).toBe(200);

    const createRes = await requestPost(req("/api/desktop/requests", {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ title: "Novo tema", description: "Adicionar tema azul", category: "tema" }),
    }));
    expect(createRes.status).toBe(201);
    expect((await createRes.json()).status).toBe("pendente");
  });

  it("rejeita Origin inválido ou malformado com 403", async () => {
    await seed();
    for (const origin of ["null", "não-é-url", "https://evil.example"]) {
      const res = await loginPost(loginReq("u@example.com", PASSWORD, origin));
      expect(res.status).toBe(403);
    }
  });

  it("limita tentativas de login a 10 por janela e responde 429 na 11ª", async () => {
    await seed();
    for (let i = 0; i < 10; i += 1) {
      const res = await loginPost(loginReq("u@example.com", "senha-errada"));
      expect(res.status).toBe(401);
    }
    const limited = await loginPost(loginReq("u@example.com", "senha-errada"));
    expect(limited.status).toBe(429);
  });

  it("resposta de login não expõe tokenHash do dispositivo", async () => {
    await seed();
    const res = await loginPost(loginReq("u@example.com"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["device", "deviceToken"]);
    expect(Object.keys(body.device).sort()).toEqual(["id", "name"]);
    expect(JSON.stringify(body)).not.toContain("tokenHash");
  });

  it("logout revoga o dispositivo e a sessão seguinte retorna 401", async () => {
    await seed();
    const token = await loginAs("u@example.com");
    expect((await sessionGet(req("/api/desktop/session", { headers: bearer(token) }))).status).toBe(200);

    const logoutRes = await logoutPost(req("/api/desktop/logout", { method: "POST", headers: bearer(token) }));
    expect(logoutRes.status).toBe(200);

    const after = await sessionGet(req("/api/desktop/session", { headers: bearer(token) }));
    expect(after.status).toBe(401);
    expect((await after.json()).error).toBe("device_revoked");
  });

  it("sem token ou com token inválido retorna 401", async () => {
    await seed();
    const res = await sessionGet(req("/api/desktop/session"));
    expect(res.status).toBe(401);
  });

  it("GET, PATCH e DELETE em solicitação própria; 404 para outro usuário", async () => {
    await seed();
    const token = await loginAs("u@example.com");
    const otherToken = await loginAs("outro@example.com");

    const created = await requestPost(req("/api/desktop/requests", {
      method: "POST",
      headers: jsonHeaders(token),
      body: JSON.stringify({ title: "Novo tema", description: "Adicionar tema azul", category: "tema" }),
    }));
    const { id } = await created.json();

    const getRes = await requestGet(req(`/api/desktop/requests/${id}`, { headers: bearer(token) }), ctx(id));
    expect(getRes.status).toBe(200);
    expect((await getRes.json()).item.id).toBe(id);

    const patchRes = await requestPatch(req(`/api/desktop/requests/${id}`, {
      method: "PATCH",
      headers: jsonHeaders(token),
      body: JSON.stringify({ title: "Tema escuro" }),
    }), ctx(id));
    expect(patchRes.status).toBe(200);
    expect((await patchRes.json()).item.title).toBe("Tema escuro");

    expect((await requestGet(req(`/api/desktop/requests/${id}`, { headers: bearer(otherToken) }), ctx(id))).status).toBe(404);
    expect((await requestPatch(req(`/api/desktop/requests/${id}`, {
      method: "PATCH",
      headers: jsonHeaders(otherToken),
      body: JSON.stringify({ title: "Invasão" }),
    }), ctx(id))).status).toBe(404);
    expect((await requestDelete(req(`/api/desktop/requests/${id}`, {
      method: "DELETE",
      headers: bearer(otherToken),
    }), ctx(id))).status).toBe(404);

    const deleteRes = await requestDelete(req(`/api/desktop/requests/${id}`, {
      method: "DELETE",
      headers: bearer(token),
    }), ctx(id));
    expect(deleteRes.status).toBe(200);
    expect((await deleteRes.json()).item.status).toBe("retirada");
  });

  it("PATCH valida os campos resultantes e aceita edição válida", async () => {
    await seed();
    const token = await loginAs("u@example.com");
    const created = await requestPost(req("/api/desktop/requests", {
      method: "POST",
      headers: jsonHeaders(token),
      body: JSON.stringify({ title: "Novo tema", description: "Adicionar tema azul", category: "tema" }),
    }));
    const { id } = await created.json();
    const patch = (body: Record<string, string>) => requestPatch(req(`/api/desktop/requests/${id}`, {
      method: "PATCH",
      headers: jsonHeaders(token),
      body: JSON.stringify(body),
    }), ctx(id));

    expect((await patch({ title: "a" })).status).toBe(400);
    expect((await patch({ category: "@@" })).status).toBe(400);

    const ok = await patch({ title: "Tema escuro", category: "tema" });
    expect(ok.status).toBe(200);
    expect((await ok.json()).item.title).toBe("Tema escuro");
  });

  it("limita login por e-mail mesmo alternando X-Forwarded-For", async () => {
    await seed();
    for (let i = 0; i < 10; i += 1) {
      const res = await loginPost(req("/api/desktop/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: ORIGIN,
          "x-forwarded-for": `10.0.0.${i}`,
        },
        body: JSON.stringify({ email: "u@example.com", password: "senha-errada" }),
      }));
      expect(res.status).toBe(401);
    }
    const limited = await loginPost(req("/api/desktop/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: ORIGIN,
        "x-forwarded-for": "10.0.0.99",
      },
      body: JSON.stringify({ email: "u@example.com", password: PASSWORD }),
    }));
    expect(limited.status).toBe(429);
  });

  it("lista solicitações apenas do próprio usuário", async () => {
    await seed();
    const token = await loginAs("u@example.com");
    const otherToken = await loginAs("outro@example.com");
    await requestPost(req("/api/desktop/requests", {
      method: "POST",
      headers: jsonHeaders(otherToken),
      body: JSON.stringify({ title: "Do outro", description: "Descrição suficiente", category: "tema" }),
    }));
    const res = await requestsGet(req("/api/desktop/requests", { headers: bearer(token) }));
    expect(res.status).toBe(200);
    expect((await res.json()).items).toHaveLength(0);
  });

  it("lista e marca notificações como lidas", async () => {
    const store = await seed();
    const token = await loginAs("u@example.com");
    await store.createUserNotification({
      userId: "u1",
      kind: "request.aprovada",
      title: "Solicitação aprovada",
      body: "Sua solicitação foi aprovada.",
      requestId: null,
      expiresAt: null,
    });

    const listRes = await notificationsGet(req("/api/desktop/notifications", { headers: bearer(token) }));
    expect(listRes.status).toBe(200);
    const list = await listRes.json();
    expect(list.items).toHaveLength(1);
    expect(list.unread).toBe(1);
    const notificationId = list.items[0].id as string;

    const patchRes = await notificationPatch(
      req(`/api/desktop/notifications/${notificationId}`, { method: "PATCH", headers: bearer(token) }),
      ctx(notificationId),
    );
    expect(patchRes.status).toBe(200);

    const afterRes = await notificationsGet(req("/api/desktop/notifications", { headers: bearer(token) }));
    expect((await afterRes.json()).unread).toBe(0);
  });

  it("não marca como lida notificação de outro usuário", async () => {
    const store = await seed();
    const otherToken = await loginAs("outro@example.com");
    const n = await store.createUserNotification({
      userId: "u1",
      kind: "request.aprovada",
      title: "Solicitação aprovada",
      body: "Sua solicitação foi aprovada.",
      requestId: null,
      expiresAt: null,
    });
    const res = await notificationPatch(
      req(`/api/desktop/notifications/${n.id}`, { method: "PATCH", headers: bearer(otherToken) }),
      ctx(n.id),
    );
    expect(res.status).toBe(404);
  });
});

describe("rotas admin", () => {
  let previousAdminEmails: string | undefined;

  beforeEach(() => {
    resetRateLimits();
    previousAdminEmails = process.env.ADMIN_EMAILS;
    process.env.ADMIN_EMAILS = "chefe@example.com";
  });

  afterEach(() => {
    if (previousAdminEmails === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = previousAdminEmails;
  });

  async function sessionCookieFor(email: string): Promise<string> {
    const store = await getStore();
    const user = await store.getUserByEmail(email);
    if (!user) throw new Error(`usuário ${email} não encontrado`);
    const { raw } = await createSessionForUser(user);
    return `yami_session=${raw}`;
  }

  it("GET e POST retornam 403 sem sessão", async () => {
    const store = await seed();
    const created = await store.createFeatureRequest({
      userId: "u1",
      title: "Novo tema",
      description: "Adicionar tema azul",
      category: "tema",
    });

    const list = await adminRequestsGet(req("/api/admin/requests"));
    expect(list.status).toBe(403);

    const post = await adminRequestPost(req(`/api/admin/requests/${created.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "aprovada" }),
    }), ctx(created.id));
    expect(post.status).toBe(403);
  });

  it("GET e POST retornam 403 para usuário que não é admin", async () => {
    const store = await seed();
    const created = await store.createFeatureRequest({
      userId: "u1",
      title: "Novo tema",
      description: "Adicionar tema azul",
      category: "tema",
    });
    const cookie = await sessionCookieFor("u@example.com");

    const list = await adminRequestsGet(req("/api/admin/requests", { headers: { cookie } }));
    expect(list.status).toBe(403);

    const post = await adminRequestPost(req(`/api/admin/requests/${created.id}`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ status: "aprovada" }),
    }), ctx(created.id));
    expect(post.status).toBe(403);
    expect((await store.getFeatureRequest(created.id))?.status).toBe("pendente");
  });

  it("admin lista e aprova solicitação", async () => {
    const store = await seed();
    const created = await store.createFeatureRequest({
      userId: "u1",
      title: "Novo tema",
      description: "Adicionar tema azul",
      category: "tema",
    });
    const cookie = await sessionCookieFor("chefe@example.com");

    const list = await adminRequestsGet(req("/api/admin/requests", { headers: { cookie } }));
    expect(list.status).toBe(200);
    expect((await list.json()).items).toHaveLength(1);

    const post = await adminRequestPost(req(`/api/admin/requests/${created.id}`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ status: "aprovada", note: "ok" }),
    }), ctx(created.id));
    expect(post.status).toBe(200);
    expect((await post.json()).item.status).toBe("aprovada");
  });
});
