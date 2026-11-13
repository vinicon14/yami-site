import { afterEach, describe, expect, it } from "vitest";
import { createMemoryStore } from "../lib/db/memory";
import { setStoreForTests, resetStoreCache } from "../lib/db";
import { authorizeDownload } from "../lib/download-serve";
import { generateDownloadToken, hashToken } from "../lib/download-token";
import { generateLicenseKey } from "../lib/license";
import {
  parseReleaseManifest,
  toPublicManifest,
  isReleaseKind,
} from "../lib/release";
import { LICENSE_MISSING_TITLE } from "../lib/license-messages";
import { userHasPaidLicense } from "../lib/license-gate";

const SECRET = "test-download-secret";
process.env.DOWNLOAD_TOKEN_SECRET = SECRET;
process.env.DOWNLOAD_MAX_COUNT = "5";
process.env.PRICE_BRL = "20";

const SAMPLE_FILE = {
  kind: "setup" as const,
  label: "Instalador Windows",
  filename: "YAMI-0.62.0-forage-v4-setup-x64.exe",
  version: "0.62.0",
  size: 315720030,
  sha256: "61a4c98b23ef888efd0ad4d05fe8a6225c0aff04f5c39e960a6d2766080b6da9",
  publishedAt: "2026-11-11T22:38:15.000Z",
  blobPathname: "releases/0.62.0/abc123/YAMI-0.62.0-forage-v4-setup-x64.exe",
  contentType: "application/octet-stream",
};

afterEach(() => {
  resetStoreCache();
});

describe("manifesto de release", () => {
  it("parseia e esconde o pathname na vista pública", () => {
    const parsed = parseReleaseManifest({
      version: "0.62.0",
      publishedAt: "2026-11-12T00:00:00.000Z",
      files: { setup: SAMPLE_FILE },
    });
    expect(parsed?.files.setup?.filename).toBe(SAMPLE_FILE.filename);
    const pub = toPublicManifest(parsed!);
    expect(pub.files.setup?.available).toBe(true);
    expect(JSON.stringify(pub)).not.toContain("blobPathname");
    expect(JSON.stringify(pub)).not.toContain("abc123");
    expect(isReleaseKind("apk")).toBe(true);
    expect(isReleaseKind("dmg")).toBe(false);
  });

  it("rejeita sha256 inválido", () => {
    expect(
      parseReleaseManifest({
        version: "1",
        publishedAt: "2026-11-12T00:00:00.000Z",
        files: { setup: { ...SAMPLE_FILE, sha256: "nope" } },
      })?.files.setup,
    ).toBeUndefined();
  });
});

describe("authorizeDownload", () => {
  async function readyStore(opts?: { used?: number; expiresAt?: Date; withApk?: boolean }) {
    const store = createMemoryStore();
    setStoreForTests(store);
    const order = await store.createOrder({
      id: "ord-test-1",
      email: "comprador@example.com",
      amountBrl: 20,
    });
    await store.markPaid(order.id, "pay-test-1");
    const license = await store.createLicense(order.id, generateLicenseKey());
    const token = generateDownloadToken();
    const expiresAt = (opts?.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000)).toISOString();
    await store.createDownloadToken({
      id: "tok-1",
      orderId: order.id,
      licenseId: license.id,
      tokenHash: hashToken(token, SECRET),
      expiresAt,
      downloadsUsed: opts?.used ?? 0,
      maxDownloads: 5,
    });
    const files: Record<string, unknown> = { setup: SAMPLE_FILE, portable: { ...SAMPLE_FILE, kind: "portable", filename: "YAMI-portable.exe", blobPathname: "releases/x/p.exe" } };
    if (opts?.withApk) {
      files.apk = { ...SAMPLE_FILE, kind: "apk", filename: "YAMI-1.4.6.apk", version: "1.4.6", blobPathname: "releases/x/a.apk" };
    }
    await store.putReleaseManifest({
      version: "0.62.0",
      publishedAt: "2026-11-12T00:00:00.000Z",
      files,
    } as never);
    return { store, token, order };
  }

  it("autoriza setup e portable com token válido", async () => {
    const { token, store } = await readyStore();
    const setup = await authorizeDownload({ token, file: "setup", store });
    expect(setup.ok).toBe(true);
    if (setup.ok) expect(setup.file.kind).toBe("setup");
    const portable = await authorizeDownload({ token, file: "portable", store });
    expect(portable.ok).toBe(true);
  });

  it("devolve APK em breve quando o apk não está no manifesto", async () => {
    const { token, store } = await readyStore({ withApk: false });
    const apk = await authorizeDownload({ token, file: "apk", store });
    expect(apk.ok).toBe(false);
    if (!apk.ok) {
      expect(apk.status).toBe(503);
      expect(apk.error).toBe("APK em breve");
      expect(apk.reason).toBe("apk_coming_soon");
    }
  });

  it("rejeita token expirado e limite atingido", async () => {
    const expired = await readyStore({ expiresAt: new Date(Date.now() - 1000) });
    const a = await authorizeDownload({
      token: expired.token,
      file: "setup",
      store: expired.store,
    });
    expect(a.ok).toBe(false);
    if (!a.ok) {
      expect(a.status).toBe(410);
      expect(a.reason).toBe("expired");
    }

    resetStoreCache();
    const limited = await readyStore({ used: 5 });
    const b = await authorizeDownload({
      token: limited.token,
      file: "setup",
      store: limited.store,
    });
    expect(b.ok).toBe(false);
    if (!b.ok) {
      expect(b.status).toBe(410);
      expect(b.reason).toBe("limit");
    }
  });

  it("rejeita token inválido", async () => {
    const store = createMemoryStore();
    const r = await authorizeDownload({ token: "abcd", file: "setup", store });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);
  });
});

describe("licença da conta", () => {
  it("detecta conta sem compra", async () => {
    const store = createMemoryStore();
    setStoreForTests(store);
    await store.createUser({
      id: "u1",
      email: "sem-licenca@example.com",
      passwordHash: "x",
    });
    expect(await userHasPaidLicense("sem-licenca@example.com", store)).toBe(false);
    expect(LICENSE_MISSING_TITLE).toBe("Você não comprou a licença com essa conta.");
  });

  it("detecta conta com licença paga", async () => {
    const store = createMemoryStore();
    const order = await store.createOrder({
      id: "ord-lic",
      email: "com-licenca@example.com",
      amountBrl: 20,
    });
    await store.markPaid(order.id, "pay-lic");
    await store.createLicense(order.id, generateLicenseKey());
    expect(await userHasPaidLicense("com-licenca@example.com", store)).toBe(true);
  });
});
