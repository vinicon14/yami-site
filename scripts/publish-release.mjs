#!/usr/bin/env node
/**
 * Publica instaladores no Blob privado e atualiza o manifesto.
 *
 * Uso:
 *   scripts/publish-release \
 *     --setup /caminho/YAMI-*-setup-x64.exe \
 *     --portable /caminho/YAMI-*-portable-x64.exe \
 *     [--apk /caminho/YAMI-*.apk] \
 *     --version 0.62.0
 *
 * Variáveis: BLOB_READ_WRITE_TOKEN (obrigatório fora da Vercel),
 *            DATABASE_URL (opcional — espelha o manifesto no Postgres).
 * Nunca imprime o token nem URLs permanentes. O pathname no Blob leva
 * um segmento aleatório; o arquivo só é servido por um link assinado
 * e de curta validade pelo site.
 */
import { createHash, randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { put, get } from "@vercel/blob";

const META = {
  setup: {
    label: "Instalador Windows",
    contentType: "application/octet-stream",
  },
  portable: {
    label: "Windows portátil",
    contentType: "application/octet-stream",
  },
  apk: {
    label: "Aplicativo Android (APK)",
    contentType: "application/vnd.android.package-archive",
  },
};

const MANIFEST_PATH = "releases/manifest.json";

function parseArgs(argv) {
  const out = { version: "", paths: {}, dryRun: false, help: false, expected: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--version") out.version = String(next() ?? "");
    else if (a === "--setup") out.paths.setup = next();
    else if (a === "--portable") out.paths.portable = next();
    else if (a === "--apk") out.paths.apk = next();
    else if (a === "--sha256-setup") out.expected.setup = String(next() ?? "").toLowerCase();
    else if (a === "--sha256-portable") out.expected.portable = String(next() ?? "").toLowerCase();
    else if (a === "--sha256-apk") out.expected.apk = String(next() ?? "").toLowerCase();
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--help" || a === "-h") out.help = true;
    else {
      console.error(`argumento desconhecido: ${a}`);
      process.exit(2);
    }
  }
  return out;
}

async function sha256AndSize(path) {
  const info = await stat(path);
  const hash = createHash("sha256");
  await new Promise((resolveP, reject) => {
    const s = createReadStream(path);
    s.on("data", (c) => hash.update(c));
    s.on("error", reject);
    s.on("end", resolveP);
  });
  return { size: info.size, sha256: hash.digest("hex"), mtime: info.mtime.toISOString() };
}

function randomPath(version, filename) {
  const token = randomBytes(16).toString("hex");
  const safe = filename.replace(/[^A-Za-z0-9._+-]/g, "_");
  return `releases/${version}/${token}/${safe}`;
}

async function loadPrevious() {
  try {
    const existing = await get(MANIFEST_PATH, { access: "private" });
    if (existing?.statusCode === 200 && existing.stream) {
      const text = await new Response(existing.stream).text();
      return JSON.parse(text);
    }
  } catch {
    /* primeiro publish */
  }
  return { files: {} };
}

async function maybeWriteDb(manifest) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log("DATABASE_URL ausente: manifesto só no Blob.");
    return;
  }
  const { default: postgres } = await import("postgres");
  const ssl =
    process.env.DATABASE_SSL === "false"
      ? false
      : url.includes("localhost") || url.includes("127.0.0.1")
        ? false
        : "require";
  const sql = postgres(url, { ssl, max: 1, idle_timeout: 10 });
  try {
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS release_manifest (
        id TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    const payload = JSON.stringify(manifest);
    const updatedAt = new Date().toISOString();
    await sql`
      INSERT INTO release_manifest (id, payload, updated_at)
      VALUES (${"current"}, ${payload}, ${updatedAt})
      ON CONFLICT (id) DO UPDATE SET payload = ${payload}, updated_at = ${updatedAt}
    `;
    console.log("Manifesto espelhado no Postgres.");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || Object.keys(args.paths).length === 0) {
    console.error(
      "Uso: scripts/publish-release --setup FILE --portable FILE [--apk FILE] --version X.Y.Z",
    );
    process.exit(args.help ? 0 : 2);
  }
  if (!args.version) {
    console.error("informe --version");
    process.exit(2);
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN && process.env.BLOB_TOKEN_FILE) {
    const { readFileSync } = await import("node:fs");
    process.env.BLOB_READ_WRITE_TOKEN = readFileSync(process.env.BLOB_TOKEN_FILE, "utf8").trim();
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.VERCEL) {
    console.error("BLOB_READ_WRITE_TOKEN não está definido");
    process.exit(2);
  }

  const publishedAt = new Date().toISOString();
  const previous = await loadPrevious();
  const files = { ...(previous.files ?? {}) };

  for (const [kind, rawPath] of Object.entries(args.paths)) {
    const path = resolve(rawPath);
    const info = await sha256AndSize(path);
    const expected = args.expected[kind];
    if (expected && expected !== info.sha256) {
      console.error(
        `SHA256 de ${kind} não confere (obtido ${info.sha256}, esperado ${expected})`,
      );
      process.exit(1);
    }
    const filename = basename(path);
    const pathname = randomPath(args.version, filename);
    const meta = META[kind];
    console.log(
      `Enviando ${kind}: ${filename} (${info.size} bytes, sha256=${info.sha256})`,
    );
    if (args.dryRun) {
      files[kind] = {
        kind,
        label: meta.label,
        filename,
        version: args.version,
        size: info.size,
        sha256: info.sha256,
        publishedAt: info.mtime,
        blobPathname: pathname,
        contentType: meta.contentType,
      };
      continue;
    }
    const stream = createReadStream(path);
    const blob = await put(pathname, stream, {
      access: "private",
      addRandomSuffix: false,
      multipart: true,
      contentType: meta.contentType,
      cacheControlMaxAge: 31536000,
    });
    files[kind] = {
      kind,
      label: meta.label,
      filename,
      version: kind === "apk" ? inferApkVersion(filename, args.version) : args.version,
      size: info.size,
      sha256: info.sha256,
      publishedAt: info.mtime,
      blobPathname: blob.pathname,
      contentType: meta.contentType,
    };
    console.log(`  ok pathname length=${blob.pathname.length}`);
  }

  const manifest = {
    version: args.version,
    publishedAt,
    files,
  };

  if (!args.dryRun) {
    await put(MANIFEST_PATH, JSON.stringify(manifest, null, 2), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json; charset=utf-8",
    });
    await maybeWriteDb(manifest);
  }

  const summary = {
    version: manifest.version,
    publishedAt: manifest.publishedAt,
    files: Object.fromEntries(
      Object.entries(manifest.files).map(([k, f]) => [
        k,
        {
          filename: f.filename,
          version: f.version,
          size: f.size,
          sha256: f.sha256,
          publishedAt: f.publishedAt,
          // pathname propositalmente omitido do resumo
        },
      ]),
    ),
  };
  console.log(JSON.stringify(summary, null, 2));
}

function inferApkVersion(filename, fallback) {
  const m = filename.match(/(\d+\.\d+\.\d+)/);
  return m ? m[1] : fallback;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
