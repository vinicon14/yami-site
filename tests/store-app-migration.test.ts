import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSqliteStore } from "../lib/db/sqlite";
import { SCHEMA_SQL } from "../lib/db/sql-shared";

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

afterEach(() => {
  for (const db of openDatabases.splice(0)) {
    try { db.close(); } catch { /* já fechado */ }
  }
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("migração aditiva da loja", () => {
  it("só acrescenta app_platform e preserva a solicitação antiga", async () => {
    const sqlite = readFileSync(join(process.cwd(), "lib/db/sqlite.ts"), "utf8");
    const postgres = readFileSync(join(process.cwd(), "lib/db/postgres.ts"), "utf8");
    expect(sqlite).toContain("ADD COLUMN app_platform");
    expect(postgres).toContain("ADD COLUMN IF NOT EXISTS app_platform");
    expect(sqlite).not.toContain("DROP TABLE");
    expect(postgres).not.toContain("DROP TABLE");
    expect(SCHEMA_SQL).toContain("app_platform");
    expect(SCHEMA_SQL).toContain("CREATE TABLE IF NOT EXISTS store_apps");

    const dir = mkdtempSync(join(tmpdir(), "yami-store-"));
    tempDirs.push(dir);
    const path = join(dir, "yami.sqlite");
    const { DatabaseSync } = await import("node:sqlite");
    const setup = new DatabaseSync(path);
    setup.exec(`CREATE TABLE feature_requests (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      status TEXT NOT NULL,
      published_version TEXT,
      admin_note TEXT,
      file_name TEXT,
      file_size INTEGER,
      file_sha256 TEXT,
      file_blob_pathname TEXT,
      app_version TEXT,
      app_icon TEXT,
      published_asset_url TEXT,
      published_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
    setup.prepare(
      `INSERT INTO feature_requests
        (id, user_id, title, description, category, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run("req-1", "user-1", "App antigo", "Descricao que ja estava gravada", "geral", "pendente", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");
    setup.close();

    const store = createSqliteStore(path);
    const row = await store.getFeatureRequest("req-1");
    expect(row?.title).toBe("App antigo");
    expect(row?.description).toBe("Descricao que ja estava gravada");
    expect(row?.appPlatform).toBe("linux");

    const created = await store.createFeatureRequest({
      userId: "user-1",
      title: "Windows",
      description: "Download externo",
      category: "desktop",
      fileName: "app.exe",
      fileSize: 10,
      fileSha256: "ab".repeat(32),
      fileBlobPathname: null,
      appVersion: "1.0.0",
      appIcon: null,
      appPlatform: "windows",
      publishedAssetUrl: null,
      publishedAt: null,
    });
    expect(created.appPlatform).toBe("windows");
    expect(created.fileName).toBe("app.exe");
    expect((await store.getFeatureRequest("req-1"))?.title).toBe("App antigo");
  });
});
