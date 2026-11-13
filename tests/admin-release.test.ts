import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isAdminEmail, parseAdminEmails, getAdminFromRequest } from "../lib/admin";
import {
  applyReleaseFile,
  assertUploadPathname,
  buildReleaseFile,
  extensionForKind,
  randomReleasePathname,
  sanitizeFilename,
  validateUploadMeta,
} from "../lib/admin-release";
import { registerPublishedFile, rollbackReleaseFile } from "../lib/admin-publish";
import { createMemoryStore } from "../lib/db/memory";
import { resetStoreCache, setStoreForTests } from "../lib/db";
import { hashPassword, createSessionForUser, sessionCookie } from "../lib/auth";
import { toPublicManifest } from "../lib/release";
import { POST as uploadPost } from "../app/api/admin/upload/route";

const SHA = "61a4c98b23ef888efd0ad4d05fe8a6225c0aff04f5c39e960a6d2766080b6da9";
const SHA2 = "aa".repeat(32);

function sampleFile(kind: "setup" | "portable" | "apk", version = "0.62.0") {
  const filename =
    kind === "apk" ? `YAMI-${version}.apk` : `YAMI-${version}-${kind}-x64.exe`;
  return buildReleaseFile({
    kind,
    filename,
    version,
    size: 1024,
    sha256: SHA,
    blobPathname: `releases/${version}/${"ab".repeat(16)}/${filename}`,
  })!;
}

describe("checagem de admin", () => {
  it("separa e normaliza a lista; vazio não autoriza ninguém", () => {
    expect(parseAdminEmails(undefined)).toEqual([]);
    expect(parseAdminEmails("")).toEqual([]);
    expect(parseAdminEmails(" a@x.com, B@X.COM ,,nao-email,c@y.com ")).toEqual([
      "a@x.com",
      "b@x.com",
      "c@y.com",
    ]);
    expect(isAdminEmail("a@x.com", "")).toBe(false);
    expect(isAdminEmail("a@x.com", "a@x.com")).toBe(true);
    expect(isAdminEmail("A@X.com", "a@x.com, outro@x.com")).toBe(true);
    expect(isAdminEmail("intruso@x.com", "a@x.com")).toBe(false);
  });

  it("getAdminFromRequest recusa quem não está na lista", async () => {
    process.env.ADMIN_EMAILS = "chefe@example.com";
    setStoreForTests(createMemoryStore());
    const req = new Request("http://localhost/api/admin/upload", {
      method: "POST",
      headers: { cookie: "yami_session=token-invalido" },
    });
    const none = await getAdminFromRequest(req);
    expect(none.ok).toBe(false);
    if (!none.ok) expect(none.status).toBe(401);

    const store = createMemoryStore();
    setStoreForTests(store);
    const user = await store.createUser({
      id: crypto.randomUUID(),
      email: "visitante@example.com",
      passwordHash: await hashPassword("12345678"),
    });
    const { raw } = await createSessionForUser(user);
    const forbidden = await getAdminFromRequest(
      new Request("http://localhost/api/admin/upload", {
        method: "POST",
        headers: { cookie: `yami_session=${raw}` },
      }),
    );
    expect(forbidden.ok).toBe(false);
    if (!forbidden.ok) expect(forbidden.status).toBe(403);
    delete process.env.ADMIN_EMAILS;
  });
});

describe("validação do upload", () => {
  it("aceita exe no setup/portátil e apk no android, com tamanho e hash", () => {
    expect(extensionForKind("setup")).toBe("exe");
    expect(extensionForKind("portable")).toBe("exe");
    expect(extensionForKind("apk")).toBe("apk");
    expect(sanitizeFilename("C:\\\\tmp\\\\YAMI 1.exe")).toBe("YAMI_1.exe");
    const ok = validateUploadMeta({
      kind: "setup",
      filename: "YAMI-0.70.0-setup-x64.exe",
      version: "0.70.0",
      size: 2048,
      sha256: SHA,
    });
    expect(ok.ok).toBe(true);
    expect(
      validateUploadMeta({
        kind: "setup",
        filename: "app.apk",
        version: "0.70.0",
        size: 10,
      }).ok,
    ).toBe(false);
    expect(
      validateUploadMeta({
        kind: "apk",
        filename: "app.apk",
        version: "0.70.0",
        size: 500 * 1024 * 1024 + 1,
      }).ok,
    ).toBe(false);
    expect(
      validateUploadMeta({
        kind: "apk",
        filename: "app.apk",
        version: "errado",
        size: 10,
      }).ok,
    ).toBe(false);
  });

  it("só aceita pathname no formato do publish-release", () => {
    const filename = "YAMI-0.70.0-setup-x64.exe";
    const pathname = randomReleasePathname("0.70.0", filename);
    expect(assertUploadPathname(pathname, { kind: "setup", version: "0.70.0", filename })).toBeNull();
    expect(
      assertUploadPathname("releases/0.70.0/not-a-token/YAMI-0.70.0-setup-x64.exe", {
        kind: "setup",
        version: "0.70.0",
        filename,
      }),
    ).toBeTruthy();
    expect(
      assertUploadPathname(pathname, { kind: "apk", version: "0.70.0", filename }),
    ).toBeTruthy();
  });
});

describe("registro da release", () => {
  beforeEach(() => {
    delete process.env.VERCEL;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.BLOB_STORE_ID;
    setStoreForTests(createMemoryStore());
  });
  afterEach(() => resetStoreCache());

  it("publica um slot, preserva os outros e esconde o pathname na vista pública", async () => {
    const store = createMemoryStore();
    setStoreForTests(store);
    const setup = sampleFile("setup", "0.62.0");
    const first = await registerPublishedFile({
      kind: setup.kind,
      filename: setup.filename,
      version: setup.version,
      size: setup.size,
      sha256: setup.sha256,
      blobPathname: setup.blobPathname,
      actor: { userId: "u1", email: "chefe@example.com" },
      store,
    });
    expect(first.files.setup?.version).toBe("0.62.0");
    expect(first.version).toBe("0.62.0");

    const apk = sampleFile("apk", "1.4.6");
    const second = await registerPublishedFile({
      kind: apk.kind,
      filename: apk.filename,
      version: apk.version,
      size: apk.size,
      sha256: SHA2,
      blobPathname: apk.blobPathname,
      actor: { userId: "u1", email: "chefe@example.com" },
      store,
    });
    expect(second.files.setup?.filename).toBe(setup.filename);
    expect(second.files.apk?.version).toBe("1.4.6");
    expect(second.version).toBe("0.62.0");
    const pub = toPublicManifest(second);
    expect(JSON.stringify(pub)).not.toContain("blobPathname");
    expect(JSON.stringify(pub)).not.toContain(apk.blobPathname.split("/")[2]);
    const history = await store.listReleaseHistory();
    expect(history).toHaveLength(2);
    expect(history[0]?.uploadedByEmail).toBe("chefe@example.com");
  });

  it("volta a uma versão anterior de um slot", async () => {
    const store = createMemoryStore();
    setStoreForTests(store);
    const first = sampleFile("portable", "0.62.0");
    await registerPublishedFile({
      kind: first.kind,
      filename: first.filename,
      version: first.version,
      size: first.size,
      sha256: first.sha256,
      blobPathname: first.blobPathname,
      actor: { userId: "u1", email: "chefe@example.com" },
      store,
    });
    const secondPath = `releases/0.70.0/${"cd".repeat(16)}/YAMI-0.70.0-portable-x64.exe`;
    await registerPublishedFile({
      kind: "portable",
      filename: "YAMI-0.70.0-portable-x64.exe",
      version: "0.70.0",
      size: 2048,
      sha256: SHA2,
      blobPathname: secondPath,
      actor: { userId: "u1", email: "chefe@example.com" },
      store,
    });
    const history = await store.listReleaseHistory("portable");
    const previous = history.find((h) => h.payload.version === "0.62.0");
    expect(previous).toBeTruthy();
    const rolled = await rollbackReleaseFile({
      historyId: previous!.id,
      actor: { userId: "u1", email: "chefe@example.com" },
      store,
    });
    expect(rolled.files.portable?.version).toBe("0.62.0");
    expect(rolled.files.portable?.sha256).toBe(SHA);
    expect(rolled.version).toBe("0.62.0");
  });
});

describe("API de token de upload", () => {
  beforeEach(() => {
    delete process.env.VERCEL;
    process.env.ADMIN_EMAILS = "chefe@example.com";
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost";
    setStoreForTests(createMemoryStore());
  });
  afterEach(() => {
    resetStoreCache();
    delete process.env.ADMIN_EMAILS;
  });

  it("responde 401 sem sessão e 403 para quem não é admin", async () => {
    const unauthorized = await uploadPost(
      new Request("http://localhost/api/admin/upload", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost" },
        body: "{}",
      }),
    );
    expect(unauthorized.status).toBe(401);

    const store = createMemoryStore();
    setStoreForTests(store);
    const user = await store.createUser({
      id: crypto.randomUUID(),
      email: "visitante@example.com",
      passwordHash: await hashPassword("12345678"),
    });
    const { raw } = await createSessionForUser(user);
    const forbidden = await uploadPost(
      new Request("http://localhost/api/admin/upload", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost",
          cookie: sessionCookie(raw, false).split(";")[0]!,
        },
        body: "{}",
      }),
    );
    expect(forbidden.status).toBe(403);
    const body = (await forbidden.json()) as { error?: string };
    expect(body.error).toBe("sem permissão");
  });
});
