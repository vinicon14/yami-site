import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMemoryStore } from "../lib/db/memory";
import { createSessionForUser } from "../lib/auth";
import { setStoreForTests } from "../lib/db";
import { getSiteUrl } from "../lib/config";
import { resetRateLimits } from "../lib/rate-limit";
import { GET as appsGet, POST as appsPost } from "../app/api/apps/route";
import { POST as reviewPost } from "../app/api/apps/[id]/revisao/route";
import { POST as reportPost } from "../app/api/apps/[id]/denuncia/route";
import { GET as downloadGet } from "../app/api/apps/download/route";
import { POST as adminPost } from "../app/api/admin/apps/[id]/route";
import { PublishedAppsList } from "../components/PublishedAppsList";
import {
  setBlobInspectorForTests,
  setStoreAppPublisherForTests,
  signAppDownload,
  verifyAppDownload,
  type CatalogApp,
} from "../lib/store-apps";

const SHA = "ab".repeat(32);
const site = () => getSiteUrl();

function cookieHeader(raw: string) {
  return `yami_session=${raw}`;
}

function post(path: string, raw: string, body: unknown) {
  const base = site();
  return new Request(`${base}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: cookieHeader(raw),
      origin: new URL(base).origin,
    },
    body: JSON.stringify(body),
  });
}

const linuxBody = {
  name: "Editor Yami",
  description: "Um editor de texto simples para o teste.",
  category: "utilidades",
  version: "1.0.0",
  platform: "linux",
  fileName: "editor.AppImage",
  fileBlobPathname: "apps/11111111-1111-1111-1111-111111111111/editor.AppImage",
  size: 1200,
  sha256: SHA,
};

async function people() {
  const store = createMemoryStore();
  setStoreForTests(store);
  const author = await store.createUser({ id: "author", email: "author@example.com", passwordHash: "x", name: "Ana" });
  const other = await store.createUser({ id: "other", email: "other@example.com", passwordHash: "x", name: "Bia" });
  const admin = await store.createUser({ id: "admin", email: "admin@example.com", passwordHash: "x", name: "Admin" });
  process.env.ADMIN_EMAILS = "admin@example.com";
  return {
    store,
    author,
    other,
    admin,
    authorCookie: (await createSessionForUser(author)).raw,
    otherCookie: (await createSessionForUser(other)).raw,
    adminCookie: (await createSessionForUser(admin)).raw,
  };
}

describe("loja com publicação para o autor e revisão pública", () => {
  beforeEach(() => {
    resetRateLimits();
    setBlobInspectorForTests(async () => ({ sha256: SHA, size: 1200, magicHex: "7f454c46" }));
    setStoreAppPublisherForTests({
      async upsert(input) {
        return { assetUrl: input.version.externalUrl || `https://example.com/apps/${input.app.id}` };
      },
      async remove() {},
    });
  });

  afterEach(() => {
    resetRateLimits();
    setBlobInspectorForTests(null);
    setStoreAppPublisherForTests(null);
    delete process.env.ADMIN_EMAILS;
    delete process.env.UPLOAD_QUOTA_DAILY_MAX;
    delete process.env.UPLOAD_QUOTA_DAILY_BYTES;
    delete process.env.SIGNUP_IP_DAILY_MAX;
  });

  it("exige sessão e manda o cliente conferir o sha256", async () => {
    const res = await appsGet(new Request(`${site()}/api/apps`));
    expect(res.status).toBe(401);
  });

  it("deixa o app privado na hora para o autor e esconde dos outros até a aprovação", async () => {
    const { authorCookie, otherCookie, adminCookie } = await people();
    const created = await appsPost(post("/api/apps", authorCookie, linuxBody));
    expect(created.status).toBe(201);
    const createdBody = await created.json();
    const id = createdBody.app.id as string;

    const authorList = await (await appsGet(new Request(`${site()}/api/apps`, { headers: { cookie: cookieHeader(authorCookie) } }))).json();
    expect(authorList.verifySha256BeforeInstall).toBe(true);
    expect(authorList.apps).toHaveLength(1);
    expect(authorList.apps[0].sha256).toBe(SHA);
    expect(authorList.apps[0].visibility).toBe("privado");
    expect(authorList.apps[0].publisher).toEqual({ id: "author", name: "Ana" });
    expect(authorList.apps[0].badge).toBe("novo");
    expect(authorList.apps[0].actionLabel).toBe("Instalar");
    expect(authorList.apps[0].downloadUrl).toContain("/api/apps/download?");

    const otherList = await (await appsGet(new Request(`${site()}/api/apps`, { headers: { cookie: cookieHeader(otherCookie) } }))).json();
    expect(otherList.apps).toHaveLength(0);

    const review = await reviewPost(post(`/api/apps/${id}/revisao`, authorCookie, {}), { params: Promise.resolve({ id }) });
    expect(review.status).toBe(200);
    const stillPrivate = await (await appsGet(new Request(`${site()}/api/apps`, { headers: { cookie: cookieHeader(otherCookie) } }))).json();
    expect(stillPrivate.apps).toHaveLength(0);

    const approved = await adminPost(post(`/api/admin/apps/${id}`, adminCookie, { action: "aprovar" }), { params: Promise.resolve({ id }) });
    expect(approved.status).toBe(200);
    const publicList = await (await appsGet(new Request(`${site()}/api/apps`, { headers: { cookie: cookieHeader(otherCookie) } }))).json();
    expect(publicList.apps).toHaveLength(1);
    expect(publicList.apps[0].downloadUrl).toBe(`https://example.com/apps/${id}`);
    expect(publicList.apps[0].sha256).toHaveLength(64);
  });

  it("mantém a versão pública antiga até nova revisão", async () => {
    const { authorCookie, otherCookie, adminCookie } = await people();
    const created = await (await appsPost(post("/api/apps", authorCookie, linuxBody))).json();
    const id = created.app.id as string;
    await reviewPost(post(`/api/apps/${id}/revisao`, authorCookie, {}), { params: Promise.resolve({ id }) });
    await adminPost(post(`/api/admin/apps/${id}`, adminCookie, { action: "aprovar" }), { params: Promise.resolve({ id }) });

    const updated = await appsPost(post("/api/apps", authorCookie, { ...linuxBody, version: "1.1.0", fileBlobPathname: "apps/22222222-2222-2222-2222-222222222222/editor.AppImage" }));
    expect(updated.status).toBe(201);

    const authorView = await (await appsGet(new Request(`${site()}/api/apps`, { headers: { cookie: cookieHeader(authorCookie) } }))).json();
    expect(authorView.apps[0].version).toBe("1.1.0");
    expect(authorView.apps[0].publicVersion).toBe("1.0.0");
    expect(authorView.apps[0].updatePending).toBe(true);

    const publicView = await (await appsGet(new Request(`${site()}/api/apps`, { headers: { cookie: cookieHeader(otherCookie) } }))).json();
    expect(publicView.apps[0].version).toBe("1.0.0");

    await reviewPost(post(`/api/apps/${id}/revisao`, authorCookie, {}), { params: Promise.resolve({ id }) });
    const rejected = await adminPost(post(`/api/admin/apps/${id}`, adminCookie, { action: "rejeitar", note: "Falta a descrição da mudança." }), { params: Promise.resolve({ id }) });
    expect(rejected.status).toBe(200);
    const afterReject = await (await appsGet(new Request(`${site()}/api/apps`, { headers: { cookie: cookieHeader(otherCookie) } }))).json();
    expect(afterReject.apps[0].version).toBe("1.0.0");
    const authorAfter = await (await appsGet(new Request(`${site()}/api/apps`, { headers: { cookie: cookieHeader(authorCookie) } }))).json();
    expect(authorAfter.apps[0].version).toBe("1.1.0");
    expect(authorAfter.apps[0].reviewNote).toContain("descrição");
  });

  it("recusa nome de outra pessoa, hash divergente e estouro de limite", async () => {
    const { authorCookie, otherCookie } = await people();
    expect((await appsPost(post("/api/apps", authorCookie, linuxBody))).status).toBe(201);
    const stolen = await appsPost(post("/api/apps", otherCookie, linuxBody));
    expect(stolen.status).toBe(400);
    expect((await stolen.json()).error).toBe("nome_em_uso");

    setBlobInspectorForTests(async () => ({ sha256: "cd".repeat(32), size: 1200, magicHex: "7f454c46" }));
    const mismatch = await appsPost(post("/api/apps", authorCookie, { ...linuxBody, name: "Outro editor", version: "1.0.0" }));
    expect((await mismatch.json()).error).toBe("sha256_divergente");

    setBlobInspectorForTests(async () => ({ sha256: SHA, size: 1200, magicHex: "7f454c46" }));
    process.env.UPLOAD_QUOTA_DAILY_MAX = "2";
    const again = await appsPost(post("/api/apps", authorCookie, { ...linuxBody, name: "App extra", version: "1.0.0" }));
    expect(again.status).toBe(201);
    const limited = await appsPost(post("/api/apps", authorCookie, { ...linuxBody, name: "App estoura", version: "1.0.0" }));
    expect(limited.status).toBe(429);
    expect((await limited.json()).error).toBe("cota_diaria_excedida");
  });

  it("publica Windows com download externo e o botão Baixar para Windows", async () => {
    const { authorCookie, otherCookie, adminCookie } = await people();
    const created = await appsPost(post("/api/apps", authorCookie, {
      name: "YAMI Desktop",
      description: "Instalador do YAMI para Windows.",
      category: "desktop",
      version: "1.0.0",
      platform: "windows",
      externalUrl: "https://example.com/YAMI-setup.exe",
      sha256: SHA,
      size: 4096,
      fileName: "YAMI-setup.exe",
    }));
    expect(created.status).toBe(201);
    const id = (await created.json()).app.id as string;
    const mine = await (await appsGet(new Request(`${site()}/api/apps`, { headers: { cookie: cookieHeader(authorCookie) } }))).json();
    expect(mine.apps[0].platform).toBe("windows");
    expect(mine.apps[0].actionLabel).toBe("Baixar para Windows");
    expect(mine.apps[0].downloadUrl).toBe("https://example.com/YAMI-setup.exe");
    expect(mine.apps[0].sha256).toBe(SHA);

    const httpUrl = await appsPost(post("/api/apps", authorCookie, {
      name: "Link inseguro",
      description: "Não pode ser http nem rede local.",
      category: "desktop",
      version: "1.0.0",
      platform: "windows",
      externalUrl: "http://example.com/app.exe",
      sha256: SHA,
      size: 10,
    }));
    expect((await httpUrl.json()).error).toBe("url_externa_invalida");

    await reviewPost(post(`/api/apps/${id}/revisao`, authorCookie, {}), { params: Promise.resolve({ id }) });
    await adminPost(post(`/api/admin/apps/${id}`, adminCookie, { action: "aprovar" }), { params: Promise.resolve({ id }) });
    const listed = await (await appsGet(new Request(`${site()}/api/apps`, { headers: { cookie: cookieHeader(otherCookie) } }))).json();
    const html = renderToStaticMarkup(createElement(PublishedAppsList, { apps: listed.apps as CatalogApp[] }));
    expect(html).toContain("Baixar para Windows");
    expect(html).toContain('href="https://example.com/YAMI-setup.exe"');
    expect(html).toContain("Ana");
    expect(html).toContain("novo");
  });

  it("denúncia e retirada tiram o app de todo mundo; ban bloqueia o publicador", async () => {
    const { store, authorCookie, otherCookie, adminCookie } = await people();
    const created = await (await appsPost(post("/api/apps", authorCookie, linuxBody))).json();
    const id = created.app.id as string;
    await reviewPost(post(`/api/apps/${id}/revisao`, authorCookie, {}), { params: Promise.resolve({ id }) });
    await adminPost(post(`/api/admin/apps/${id}`, adminCookie, { action: "aprovar" }), { params: Promise.resolve({ id }) });

    const report = await reportPost(
      post(`/api/apps/${id}/denuncia`, otherCookie, { reason: "O arquivo não corresponde à descrição publicada." }),
      { params: Promise.resolve({ id }) },
    );
    expect(report.status).toBe(201);

    const removed = await adminPost(post(`/api/admin/apps/${id}`, adminCookie, { action: "retirar" }), { params: Promise.resolve({ id }) });
    expect(removed.status).toBe(200);
    const gone = await (await appsGet(new Request(`${site()}/api/apps`, { headers: { cookie: cookieHeader(otherCookie) } }))).json();
    expect(gone.apps).toHaveLength(0);
    const authorGone = await (await appsGet(new Request(`${site()}/api/apps`, { headers: { cookie: cookieHeader(authorCookie) } }))).json();
    expect(authorGone.apps).toHaveLength(0);

    const again = await (await appsPost(post("/api/apps", authorCookie, { ...linuxBody, name: "Segundo app", version: "1.0.0" }))).json();
    await adminPost(post(`/api/admin/apps/${again.app.id}`, adminCookie, { action: "banir" }), { params: Promise.resolve({ id: again.app.id }) });
    expect((await store.getUserById("author"))?.status).toBe("bloqueado");
    const ended = await appsPost(post("/api/apps", authorCookie, { ...linuxBody, name: "Terceiro app", version: "1.0.0" }));
    expect(ended.status).toBe(401);
    const fresh = (await createSessionForUser((await store.getUserById("author"))!)).raw;
    const blocked = await appsPost(post("/api/apps", fresh, { ...linuxBody, name: "Terceiro app", version: "1.0.0" }));
    expect(blocked.status).toBe(403);
  });

  it("migra solicitação pendente para o autor e a já publicada para todo mundo", async () => {
    const { store, authorCookie, otherCookie } = await people();
    await store.createFeatureRequest({
      userId: "author",
      title: "App pendente",
      description: "Ainda esperava um administrador.",
      category: "geral",
      fileName: "pendente.AppImage",
      fileSize: 1200,
      fileSha256: SHA,
      fileBlobPathname: "apps/pendente/pendente.AppImage",
      appVersion: "1.0.0",
      appIcon: null,
      appPlatform: "linux",
      publishedAssetUrl: null,
      publishedAt: null,
    });
    const published = await store.createFeatureRequest({
      userId: "author",
      title: "App antigo",
      description: "Já estava na loja pública.",
      category: "geral",
      fileName: "antigo.AppImage",
      fileSize: 1200,
      fileSha256: SHA,
      fileBlobPathname: "apps/antigo/antigo.AppImage",
      appVersion: "2.0.0",
      appIcon: null,
      appPlatform: "linux",
      publishedAssetUrl: "https://example.com/antigo.AppImage",
      publishedAt: "2026-11-01T00:00:00.000Z",
    });
    await store.transitionFeatureRequest({
      id: published.id,
      actorUserId: "admin",
      actorRole: "admin",
      toStatus: "publicada",
      publishedVersion: "2.0.0",
      publishedAssetUrl: "https://example.com/antigo.AppImage",
    });
    await store.createFeatureRequest({
      userId: "author",
      title: "App rejeitado",
      description: "Não deve voltar para a loja.",
      category: "geral",
      fileName: "nao.AppImage",
      fileSize: 1200,
      fileSha256: SHA,
      fileBlobPathname: "apps/nao/nao.AppImage",
      appVersion: "1.0.0",
      appIcon: null,
      appPlatform: "linux",
      publishedAssetUrl: null,
      publishedAt: null,
    }).then(async (item) => {
      await store.transitionFeatureRequest({
        id: item.id,
        actorUserId: "admin",
        actorRole: "admin",
        toStatus: "rejeitada",
      });
    });

    const authorView = await (await appsGet(new Request(`${site()}/api/apps`, { headers: { cookie: cookieHeader(authorCookie) } }))).json();
    const names = authorView.apps.map((app: { name: string }) => app.name).sort();
    expect(names).toEqual(["App antigo", "App pendente"]);
    const otherView = await (await appsGet(new Request(`${site()}/api/apps`, { headers: { cookie: cookieHeader(otherCookie) } }))).json();
    expect(otherView.apps.map((app: { name: string }) => app.name)).toEqual(["App antigo"]);
  });

  it("recusa link de download com assinatura inválida", async () => {
    setStoreForTests(createMemoryStore());
    const bad = await downloadGet(new Request(`${site()}/api/apps/download?version=abc&exp=1&sig=00`));
    expect(bad.status).toBe(403);
    const exp = Date.now() + 1000;
    const sig = signAppDownload("versao-inexistente", exp);
    expect(verifyAppDownload("versao-inexistente", exp, sig)).toBe(true);
    const missing = await downloadGet(new Request(`${site()}/api/apps/download?version=versao-inexistente&exp=${exp}&sig=${sig}`));
    expect(missing.status).toBe(404);
  });
});
