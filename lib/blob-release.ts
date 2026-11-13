import { issueSignedToken, presignUrl, put, get } from "@vercel/blob";
import {
  parseReleaseManifest,
  type ReleaseManifest,
} from "./release";

export const MANIFEST_BLOB_PATH = "releases/manifest.json";

/** Tempo de vida do link assinado: 30 minutos — o download grande precisa começar neste prazo. */
export const PRESIGN_TTL_MS = 30 * 60 * 1000;

export function blobConfigured(): boolean {
  return Boolean(
    process.env.BLOB_READ_WRITE_TOKEN ||
      process.env.BLOB_STORE_ID ||
      process.env.VERCEL,
  );
}

export async function readManifestFromBlob(): Promise<ReleaseManifest | null> {
  if (!blobConfigured()) return null;
  try {
    const result = await get(MANIFEST_BLOB_PATH, { access: "private" });
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    const text = await new Response(result.stream).text();
    return parseReleaseManifest(JSON.parse(text));
  } catch {
    return null;
  }
}

export async function writeManifestToBlob(
  manifest: ReleaseManifest,
): Promise<void> {
  await put(MANIFEST_BLOB_PATH, JSON.stringify(manifest, null, 2), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json; charset=utf-8",
  });
}

export async function uploadReleaseFile(opts: {
  pathname: string;
  body: import("node:stream").Readable | Buffer | Blob | File;
  contentType: string;
  filename: string;
}): Promise<{ pathname: string; url: string }> {
  const blob = await put(opts.pathname, opts.body, {
    access: "private",
    addRandomSuffix: false,
    multipart: true,
    contentType: opts.contentType,
    cacheControlMaxAge: 31536000,
  });
  return { pathname: blob.pathname, url: blob.url };
}

export async function presignReleaseDownload(opts: {
  pathname: string;
  operation: "get" | "head";
  validMs?: number;
}): Promise<{ url: string; expiresAt: string }> {
  const validUntil = Date.now() + (opts.validMs ?? PRESIGN_TTL_MS);
  const token = await issueSignedToken({
    pathname: opts.pathname,
    operations: [opts.operation],
    validUntil,
  });
  const { presignedUrl } = await presignUrl(token, {
    operation: opts.operation,
    pathname: opts.pathname,
    access: "private",
    validUntil,
  } as Parameters<typeof presignUrl>[1]);
  return { url: presignedUrl, expiresAt: new Date(validUntil).toISOString() };
}
