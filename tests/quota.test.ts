import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as registerPost } from "../app/api/auth/register/route";
import { POST as appsPost } from "../app/api/apps/route";
import { POST as uploadPost } from "../app/api/uploads/app/route";
import { createSessionForUser } from "../lib/auth";
import {
  DEFAULT_SIGNUP_IP_DAILY_MAX,
  DEFAULT_UPLOAD_QUOTA_DAILY_BYTES,
  DEFAULT_UPLOAD_QUOTA_DAILY_MAX,
  getSignupIpDailyMax,
  getUploadQuotaDailyBytes,
  getUploadQuotaDailyMax,
} from "../lib/config";
import { setStoreForTests } from "../lib/db";
import { createMemoryStore } from "../lib/db/memory";
import { signupIpQuotaArgs, uploadQuotaArgs } from "../lib/db/quota";
import { SIGNUP_IP_QUOTA_UPSERT, UPLOAD_QUOTA_UPSERT } from "../lib/db/quota-sql";
import { createSqliteStore } from "../lib/db/sqlite";
import type { SignupIpQuotaInput, Store, UploadQuotaInput } from "../lib/db/types";
import { resetRateLimits } from "../lib/rate-limit";
import { setBlobInspectorForTests } from "../lib/store-apps";

const { openDatabases, tempDirs } = vi.hoisted(() => ({
  openDatabases: [] as Array<{ close(): void }>,
  tempDirs: [] as string[],
}));

vi.mock("node:sqlite", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:sqlite")>();
  class TrackedDatabaseSync extends actual.DatabaseSync {
    constructor(...args: ConstructorParameters<typeof actual.DatabaseSync>) {
      super(...args);
      openDatabases.push(this);
    }
  }
  return { ...actual, DatabaseSync: TrackedDatabaseSync };
});

vi.mock("@vercel/blob/client", () => ({
  handleUpload: async ({
    body,
    onBeforeGenerateToken,
  }: {
    body: { type?: string; payload?: { pathname?: string; clientPayload?: string | null } };
    onBeforeGenerateToken: (pathname: string, clientPayload: string | null) => Promise<unknown>;
  }) => {
    if (body.type !== "blob.generate-client-token") throw new Error("evento_invalido");
    await onBeforeGenerateToken(body.payload?.pathname ?? "", body.payload?.clientPayload ?? null);
    return { type: body.type, clientToken: "test-token" };
  },
}));

const ENV_KEYS = ["UPLOAD_QUOTA_DAILY_MAX", "UPLOAD_QUOTA_DAILY_BYTES", "SIGNUP_IP_DAILY_MAX"] as const;
const savedEnv = new Map<string, string | undefined>();
const SHA = "ab".repeat(32);

beforeEach(() => {
  resetRateLimits();
  for (const key of ENV_KEYS) savedEnv.set(key, process.env[key]);
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const previous = savedEnv.get(key);
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  }
  setBlobInspectorForTests(null);
  for (const db of openDatabases.splice(0)) {
    try { db.close(); } catch { /* já fechado */ }
  }
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function sqliteStore() {
  const dir = mkdtempSync(join(tmpdir(), "yami-quota-"));
  tempDirs.push(dir);
  const path = join(dir, "quota.db");
  return { store: createSqliteStore(path), path };
}

function stores(): Array<{ name: string; store: Store }> {
  return [
    { name: "memória", store: createMemoryStore() },
    { name: "sqlite", store: sqliteStore().store },
  ];
}

function uploadInput(patch: Partial<UploadQuotaInput> = {}): UploadQuotaInput {
  return {
    userId: "user-1",
    day: "2026-11-23",
    bytes: 10,
    maxCount: 2,
    maxBytes: 100,
    ...patch,
  };
}

function runUpsert(path: string, sql: string, params: unknown[]) {
  return new Promise<Record<string, unknown> | null>((resolve, reject) => {
    const worker = new Worker(
      `
        const { parentPort, workerData } = require("node:worker_threads");
        const { DatabaseSync } = require("node:sqlite");
        try {
          const db = new DatabaseSync(workerData.path);
          db.exec("PRAGMA journal_mode = WAL;");
          db.exec("PRAGMA busy_timeout = 5000;");
          const row = db.prepare(workerData.sql).get(...workerData.params);
          db.close();
          parentPort.postMessage({ row: row ?? null });
        } catch (error) {
          parentPort.postMessage({ error: String(error && error.stack ? error.stack : error) });
        }
      `,
      { eval: true, workerData: { path, sql, params } },
    );
    worker.once("message", (message: { row?: Record<string, unknown> | null; error?: string }) => {
      if (message.error) reject(new Error(message.error));
      else resolve(message.row ?? null);
      void worker.terminate();
    });
    worker.once("error", reject);
  });
}

describe("cota diária de envio", () => {
  it("usa 10 envios e 2 GiB quando o ambiente não define teto", () => {
    delete process.env.UPLOAD_QUOTA_DAILY_MAX;
    delete process.env.UPLOAD_QUOTA_DAILY_BYTES;
    delete process.env.SIGNUP_IP_DAILY_MAX;
    expect(getUploadQuotaDailyMax()).toBe(DEFAULT_UPLOAD_QUOTA_DAILY_MAX);
    expect(getUploadQuotaDailyMax()).toBe(10);
    expect(getUploadQuotaDailyBytes()).toBe(DEFAULT_UPLOAD_QUOTA_DAILY_BYTES);
    expect(getUploadQuotaDailyBytes()).toBe(2147483648);
    expect(getSignupIpDailyMax()).toBe(DEFAULT_SIGNUP_IP_DAILY_MAX);
    expect(getSignupIpDailyMax()).toBe(5);
  });

  it("soma contagem e bytes no dia UTC e isola usuário e dia", async () => {
    for (const { store } of stores()) {
      const first = await store.consumeUploadQuota(uploadInput({ bytes: 40 }));
      const second = await store.consumeUploadQuota(uploadInput({ bytes: 50 }));
      const third = await store.consumeUploadQuota(uploadInput({ bytes: 1 }));
      expect(first).toEqual({ ok: true, count: 1, bytes: 40 });
      expect(second).toEqual({ ok: true, count: 2, bytes: 90 });
      expect(third).toEqual({ ok: false, code: "cota_diaria_excedida" });

      const bytes = await store.consumeUploadQuota(uploadInput({ userId: "user-2", bytes: 80, maxCount: 5, maxBytes: 100 }));
      const over = await store.consumeUploadQuota(uploadInput({ userId: "user-2", bytes: 30, maxCount: 5, maxBytes: 100 }));
      expect(bytes).toEqual({ ok: true, count: 1, bytes: 80 });
      expect(over).toEqual({ ok: false, code: "cota_diaria_excedida" });
      const afterReject = await store.consumeUploadQuota(uploadInput({ userId: "user-2", bytes: 20, maxCount: 5, maxBytes: 100 }));
      expect(afterReject).toEqual({ ok: true, count: 2, bytes: 100 });

      const nextDay = await store.consumeUploadQuota(uploadInput({ bytes: 40, day: "2026-11-24" }));
      expect(nextDay).toEqual({ ok: true, count: 1, bytes: 40 });

      const tooBig = await store.consumeUploadQuota(uploadInput({ userId: "user-3", bytes: 101 }));
      const fits = await store.consumeUploadQuota(uploadInput({ userId: "user-3", bytes: 100 }));
      expect(tooBig.ok).toBe(false);
      expect(fits).toEqual({ ok: true, count: 1, bytes: 100 });
    }
  });

  it("deixa só um dos dois pedidos concorrentes passar no limite", async () => {
    for (const { store } of stores()) {
      const input = uploadInput({ bytes: 10, maxCount: 1, maxBytes: 1000 });
      const [left, right] = await Promise.all([
        store.consumeUploadQuota(input),
        store.consumeUploadQuota(input),
      ]);
      const accepted = [left, right].filter((item) => item.ok);
      expect(accepted).toHaveLength(1);
      expect(accepted[0]).toMatchObject({ count: 1, bytes: 10 });
      const again = await store.consumeUploadQuota(input);
      expect(again).toEqual({ ok: false, code: "cota_diaria_excedida" });
    }
  });

  it("serializa duas conexões SQLite no mesmo arquivo", async () => {
    const { path } = sqliteStore();
    const input = uploadInput({ bytes: 25, maxCount: 1, maxBytes: 1000 });
    const [left, right] = await Promise.all([
      runUpsert(path, UPLOAD_QUOTA_UPSERT, uploadQuotaArgs(input)),
      runUpsert(path, UPLOAD_QUOTA_UPSERT, uploadQuotaArgs(input)),
    ]);
    const rows = [left, right].filter((row) => row);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]?.count)).toBe(1);
    expect(Number(rows[0]?.bytes)).toBe(25);

    const signup = { ip: "203.0.113.8", day: "2026-11-23", maxCount: 1 } satisfies SignupIpQuotaInput;
    const [one, two] = await Promise.all([
      runUpsert(path, SIGNUP_IP_QUOTA_UPSERT, signupIpQuotaArgs(signup)),
      runUpsert(path, SIGNUP_IP_QUOTA_UPSERT, signupIpQuotaArgs(signup)),
    ]);
    expect([one, two].filter((row) => row)).toHaveLength(1);
  });

  it("abre a cota num banco antigo sem recriar o usuário", async () => {
    const dir = mkdtempSync(join(tmpdir(), "yami-quota-legacy-"));
    tempDirs.push(dir);
    const path = join(dir, "legacy.db");
    const { DatabaseSync } = await import("node:sqlite");
    const legacy = new DatabaseSync(path);
    legacy.exec(`CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`);
    legacy.prepare(
      `INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)`,
    ).run("u-old", "old@example.com", "Antiga", "hash", "2026-01-01T00:00:00.000Z");
    legacy.close();

    const store = createSqliteStore(path);
    expect((await store.getUserById("u-old"))?.email).toBe("old@example.com");
    const taken = await store.consumeUploadQuota(uploadInput({ userId: "u-old", maxCount: 1 }));
    expect(taken.ok).toBe(true);
    expect((await store.getUserById("u-old"))?.name).toBe("Antiga");
  });

  it("responde 429 no upload antes de devolver o token", async () => {
    process.env.UPLOAD_QUOTA_DAILY_MAX = "1";
    process.env.UPLOAD_QUOTA_DAILY_BYTES = "1000";
    const store = createMemoryStore();
    setStoreForTests(store);
    const user = await store.createUser({ id: "u1", email: "u@example.com", passwordHash: "hash", name: "U" });
    const { raw } = await createSessionForUser(user);

    const bad = await uploadPost(uploadRequest(raw, { filename: "nota.txt", size: 100 }));
    expect(bad.status).toBe(400);

    const [first, second] = await Promise.all([
      uploadPost(uploadRequest(raw, { filename: "app.AppImage", size: 400 })),
      uploadPost(uploadRequest(raw, { filename: "app.AppImage", size: 400 })),
    ]);
    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 429]);
    const denied = first.status === 429 ? first : second;
    expect((await denied.json()).error).toBe("cota_diaria_excedida");
    const allowed = first.status === 200 ? first : second;
    expect((await allowed.json()).clientToken).toBe("test-token");

    process.env.UPLOAD_QUOTA_DAILY_MAX = "10";
    process.env.UPLOAD_QUOTA_DAILY_BYTES = "500";
    const other = await store.createUser({ id: "u2", email: "u2@example.com", passwordHash: "hash", name: "U2" });
    const otherRaw = (await createSessionForUser(other)).raw;
    const overBytes = await uploadPost(uploadRequest(otherRaw, { filename: "outro.AppImage", size: 700 }));
    expect(overBytes.status).toBe(429);
    expect((await overBytes.json()).error).toBe("cota_diaria_excedida");
    const fits = await uploadPost(uploadRequest(otherRaw, { filename: "outro.AppImage", size: 500 }));
    expect(fits.status).toBe(200);
  });

  it("responde 429 no envio do app e não grava o que passou do teto", async () => {
    process.env.UPLOAD_QUOTA_DAILY_MAX = "1";
    const store = createMemoryStore();
    setStoreForTests(store);
    setBlobInspectorForTests(async () => {
      await new Promise((resolve) => setImmediate(resolve));
      return { sha256: SHA, size: 100, magicHex: "7f454c46" };
    });
    const author = await store.createUser({ id: "author", email: "author@example.com", passwordHash: "x", name: "Ana" });
    const raw = (await createSessionForUser(author)).raw;
    const [left, right] = await Promise.all([
      appsPost(appRequest(raw, "Editor Um")),
      appsPost(appRequest(raw, "Editor Dois")),
    ]);
    const statuses = [left.status, right.status].sort();
    expect(statuses).toEqual([201, 429]);
    const denied = left.status === 429 ? left : right;
    expect((await denied.json()).error).toBe("cota_diaria_excedida");
    expect(await store.listStoreApps()).toHaveLength(1);

    process.env.UPLOAD_QUOTA_DAILY_MAX = "10";
    process.env.UPLOAD_QUOTA_DAILY_BYTES = "50";
    const sqlite = sqliteStore().store;
    setStoreForTests(sqlite);
    const other = await sqlite.createUser({ id: "other", email: "other@example.com", passwordHash: "x", name: "Bia" });
    const otherRaw = (await createSessionForUser(other)).raw;
    const tooBig = await appsPost(appRequest(otherRaw, "Editor Grande"));
    expect(tooBig.status).toBe(429);
    expect((await tooBig.json()).error).toBe("cota_diaria_excedida");
    expect(await sqlite.listStoreApps()).toHaveLength(0);
  });
});

describe("limite de cadastro por IP", () => {
  it("guarda o teto no banco e isola outro IP e outro dia", async () => {
    for (const { store } of stores()) {
      const input = { ip: "198.51.100.10", day: "2026-11-23", maxCount: 2 };
      expect(await store.consumeSignupIpQuota(input)).toEqual({ ok: true, count: 1 });
      expect(await store.consumeSignupIpQuota(input)).toEqual({ ok: true, count: 2 });
      expect(await store.consumeSignupIpQuota(input)).toEqual({ ok: false, code: "limite_ip_cadastro" });
      expect(await store.consumeSignupIpQuota({ ...input, ip: "198.51.100.11" })).toEqual({ ok: true, count: 1 });
      expect(await store.consumeSignupIpQuota({ ...input, day: "2026-11-24" })).toEqual({ ok: true, count: 1 });

      const raced = { ip: "198.51.100.20", day: "2026-11-23", maxCount: 1 };
      const [left, right] = await Promise.all([
        store.consumeSignupIpQuota(raced),
        store.consumeSignupIpQuota(raced),
      ]);
      expect([left, right].filter((item) => item.ok)).toHaveLength(1);
    }
  });

  it("responde 429 na rota de cadastro sem criar a conta extra", async () => {
    process.env.SIGNUP_IP_DAILY_MAX = "2";
    const store = createMemoryStore();
    setStoreForTests(store);
    const ip = "203.0.113.50";

    const first = await registerPost(registerRequest("uma@example.com", ip));
    expect(first.status).toBe(200);
    const duplicate = await registerPost(registerRequest("uma@example.com", ip));
    expect(duplicate.status).toBe(409);
    const second = await registerPost(registerRequest("duas@example.com", ip));
    expect(second.status).toBe(200);
    const third = await registerPost(registerRequest("tres@example.com", ip));
    expect(third.status).toBe(429);
    expect((await third.json()).error).toBe("limite_ip_cadastro");
    expect(await store.getUserByEmail("tres@example.com")).toBeNull();

    const otherNetwork = await registerPost(registerRequest("quatro@example.com", "203.0.113.51"));
    expect(otherNetwork.status).toBe(200);

    process.env.SIGNUP_IP_DAILY_MAX = "1";
    const sqlite = sqliteStore().store;
    setStoreForTests(sqlite);
    const [left, right] = await Promise.all([
      registerPost(registerRequest("alfa@example.com", "203.0.113.60")),
      registerPost(registerRequest("beta@example.com", "203.0.113.60")),
    ]);
    const statuses = [left.status, right.status].sort();
    expect(statuses).toEqual([200, 429]);
    const users = await sqlite.listUsers();
    expect(users).toHaveLength(1);
  });
});

describe("migração da cota", () => {
  it("cria as tabelas com IF NOT EXISTS e o postgres faz o upsert condicional", () => {
    const schema = readFileSync(join(process.cwd(), "lib/db/schema.sql"), "utf8");
    const postgres = readFileSync(join(process.cwd(), "lib/db/postgres.ts"), "utf8");
    expect(schema).toContain("CREATE TABLE IF NOT EXISTS upload_quota");
    expect(schema).toContain("CREATE TABLE IF NOT EXISTS signup_ip_quota");
    expect(schema).not.toContain("DROP TABLE");
    expect(postgres).toContain("ON CONFLICT (user_id, day) DO UPDATE");
    expect(postgres).toContain("ON CONFLICT (ip, day) DO UPDATE");
    expect(postgres).not.toContain("DROP TABLE");
  });
});

function uploadRequest(raw: string, file: { filename: string; size: number }) {
  return new Request("http://localhost:3000/api/uploads/app", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
      cookie: `yami_session=${raw}`,
    },
    body: JSON.stringify({
      type: "blob.generate-client-token",
      payload: {
        pathname: `apps/${file.filename}`,
        clientPayload: JSON.stringify({
          filename: file.filename,
          size: file.size,
          sha256: SHA,
          platform: "linux",
        }),
      },
    }),
  });
}

function appRequest(raw: string, name: string) {
  return new Request("http://localhost:3000/api/apps", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
      cookie: `yami_session=${raw}`,
    },
    body: JSON.stringify({
      name,
      description: "Um editor de texto simples para o teste.",
      category: "utilidades",
      version: "1.0.0",
      platform: "linux",
      fileName: "editor.AppImage",
      fileBlobPathname: `apps/${name.replace(/\s+/g, "-").toLowerCase()}/editor.AppImage`,
      size: 100,
      sha256: SHA,
    }),
  });
}

function registerRequest(email: string, ip: string) {
  return new Request("http://localhost:3000/api/auth/register", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify({ email, password: "senha-forte-123", name: "Ada" }),
  });
}
