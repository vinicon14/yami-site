import { get } from "@vercel/blob";
import { createHash, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

const OWNER = "vinicon14";
const REPO = "yamios-releases";
const TAG = "v0.8.0";
const MANIFEST_ASSET = "yami-apps.json";

function token(): string {
  const value = process.env.GITHUB_TOKEN ?? process.env.GITHUB_RELEASE_TOKEN;
  if (!value) throw new Error("github_token_ausente");
  return value;
}

async function ghJson(path: string, init?: RequestInit) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token()}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`github_http_${res.status}`);
  return res.json();
}

async function getRelease() {
  try {
    return await ghJson(`/repos/${OWNER}/${REPO}/releases/tags/${TAG}`);
  } catch {
    return ghJson(`/repos/${OWNER}/${REPO}/releases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag_name: TAG, name: `YAMI OS ${TAG}`, body: "Apps publicados para a loja do YAMI OS." }),
    });
  }
}

async function deleteAsset(release: any, name: string) {
  const asset = release.assets?.find((a: any) => a.name === name);
  if (!asset) return;
  await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases/assets/${asset.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token()}`, "X-GitHub-Api-Version": "2022-11-28" },
  });
}

async function uploadAsset(release: any, name: string, contentType: string, body: ReadableStream | Buffer, size: number) {
  const uploadUrl = String(release.upload_url).replace(/{\?name,label}/, "") + `?name=${encodeURIComponent(name)}`;
  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": contentType,
      "Content-Length": String(size),
    },
    body: body as any,
    // @ts-expect-error duplex is supported by Node fetch for streams
    duplex: "half",
  });
  if (!res.ok) throw new Error(`github_upload_${res.status}`);
  return res.json();
}

export async function publishAppToGitHub(input: {
  requestId: string;
  fileName: string;
  blobPathname: string;
  sha256: string;
  size: number;
  version: string;
  title: string;
  description: string;
  category: string;
  icon: string | null;
  platform?: "linux" | "windows";
  externalUrl?: string | null;
  publisherName?: string | null;
  badge?: string | null;
  verified?: boolean;
}) {
  const platform = input.platform === "windows" ? "windows" : "linux";
  const external = platform === "windows" ? input.externalUrl : null;
  let release: any;
  let downloadUrl: string;
  let tempFile: string | null = null;
  if (external) {
    release = await getRelease();
    downloadUrl = external;
  } else {
    const blob = await get(input.blobPathname, { access: "private" });
    if (!blob?.stream) throw new Error("blob_indisponivel");
    const dir = join(tmpdir(), `yami-app-${randomBytes(8).toString("hex")}`);
    await mkdir(dir, { recursive: true });
    tempFile = join(dir, input.fileName);
    const hash = createHash("sha256");
    const hasher = new Transform({
      transform(chunk, _encoding, callback) {
        hash.update(chunk);
        callback(null, chunk);
      },
    });
    await pipeline(Readable.fromWeb(blob.stream as any), hasher, createWriteStream(tempFile));
    const actualSha = hash.digest("hex");
    const { statSync } = await import("node:fs");
    const actualSize = statSync(tempFile).size;
    if (actualSha !== input.sha256.toLowerCase() || actualSize !== input.size) {
      await unlink(tempFile).catch(() => undefined);
      throw new Error("hash_ou_tamanho_divergente");
    }
    release = await getRelease();
    const assetName = `${input.requestId}-${input.fileName}`;
    await deleteAsset(release, assetName);
    const uploadStream = Readable.toWeb(createReadStream(tempFile)) as ReadableStream;
    const asset = await uploadAsset(release, assetName, "application/octet-stream", uploadStream, actualSize);
    downloadUrl = asset.browser_download_url;
  }

  const manifestAsset = release.assets?.find((a: any) => a.name === MANIFEST_ASSET);
  let manifest: { version: string; publishedAt: string; apps: any[] } = {
    version: input.version,
    publishedAt: new Date().toISOString(),
    apps: [],
  };
  if (manifestAsset?.browser_download_url) {
    try {
      const res = await fetch(manifestAsset.browser_download_url);
      if (res.ok) manifest = await res.json();
    } catch {
      // Mantém manifesto vazio se o antigo não puder ser lido.
    }
  }
  manifest.version = input.version;
  manifest.publishedAt = new Date().toISOString();
  manifest.apps = (manifest.apps ?? []).filter((app: any) => app.id !== input.requestId);
  manifest.apps.push({
    id: input.requestId,
    name: input.title,
    description: input.description,
    category: input.category,
    version: input.version,
    icon: input.icon,
    platform,
    sha256: input.sha256.toLowerCase(),
    size: input.size,
    downloadUrl,
    externalUrl: external,
    publisher: input.publisherName ?? null,
    badge: input.badge ?? "nao_verificado",
    verified: input.verified === true,
    actionLabel: platform === "windows" ? "Baixar para Windows" : "Instalar",
    publishedAt: manifest.publishedAt,
  });
  await deleteAsset(release, MANIFEST_ASSET);
  const manifestBuffer = Buffer.from(JSON.stringify(manifest, null, 2));
  const manifestStream = Readable.toWeb(Readable.from(manifestBuffer)) as any;
  await uploadAsset(release, MANIFEST_ASSET, "application/json", manifestStream, manifestBuffer.length);

  if (tempFile) await unlink(tempFile).catch(() => undefined);
  return { assetUrl: downloadUrl, manifestUrl: `https://github.com/${OWNER}/${REPO}/releases/download/${TAG}/${MANIFEST_ASSET}` };
}

export async function removePublishedApp(appId: string): Promise<void> {
  const release = await getRelease();
  for (const asset of release.assets ?? []) {
    if (typeof asset?.name === "string" && asset.name.startsWith(`${appId}-`)) {
      await deleteAsset(release, asset.name);
    }
  }
  const fresh = await getRelease();
  const manifestAsset = fresh.assets?.find((a: any) => a.name === MANIFEST_ASSET);
  let manifest: { version: string; publishedAt: string; apps: any[] } = {
    version: "1",
    publishedAt: new Date().toISOString(),
    apps: [],
  };
  if (manifestAsset?.browser_download_url) {
    try {
      const res = await fetch(manifestAsset.browser_download_url);
      if (res.ok) manifest = await res.json();
    } catch {
      manifest.apps = [];
    }
  }
  manifest.publishedAt = new Date().toISOString();
  manifest.apps = (manifest.apps ?? []).filter((app: any) => app.id !== appId);
  await deleteAsset(fresh, MANIFEST_ASSET);
  const manifestBuffer = Buffer.from(JSON.stringify(manifest, null, 2));
  const manifestStream = Readable.toWeb(Readable.from(manifestBuffer)) as any;
  await uploadAsset(fresh, MANIFEST_ASSET, "application/json", manifestStream, manifestBuffer.length);
}
