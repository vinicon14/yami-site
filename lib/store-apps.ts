import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { get } from "@vercel/blob";
import { getSessionSecret } from "./config";
import type { Store } from "./db";
import type {
  FeatureRequest,
  Sha256Source,
  StoreApp,
  StoreAppReport,
  StoreAppVersion,
  StoreVisibility,
  User,
} from "./db/types";
import { nowIso } from "./db/types";
import { normalizeAppPlatform, storeActionLabel, type AppPlatform } from "./apps-catalog";
import { publishAppToGitHub, removePublishedApp } from "./github-apps";
import { rateLimit } from "./rate-limit";

export const LINUX_MAX_BYTES = 500 * 1024 * 1024;
export const WINDOWS_EXTERNAL_MAX_BYTES = 3 * 1024 * 1024 * 1024;
export const DOWNLOAD_TTL_MS = 30 * 60 * 1000;
const NOVO_MS = 14 * 24 * 60 * 60 * 1000;
const SUBMIT_LIMIT = 8;
const SUBMIT_WINDOW_MS = 60 * 60 * 1000;
const REPORT_LIMIT = 10;

export type BlobInspection = { sha256: string; size: number; magicHex: string };

export type CatalogApp = {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  version: string;
  icon: string | null;
  platform: AppPlatform;
  sha256: string;
  size: number;
  downloadUrl: string;
  publishedAt: string | null;
  actionLabel: string;
  badge: "novo" | "nao_verificado" | null;
  verified: boolean;
  publisher: { id: string; name: string };
  mine: boolean;
  visibility: StoreVisibility;
  reviewNote: string | null;
  updatePending: boolean;
  publicVersion: string | null;
  sha256Source: Sha256Source;
  /** O cliente do YAMI OS confere este sha256 antes de instalar. */
  verifySha256BeforeInstall: true;
};

export type SubmitInput = {
  name: string;
  description: string;
  category: string;
  version: string;
  platform?: unknown;
  icon?: string | null;
  fileName?: string | null;
  fileBlobPathname?: string | null;
  externalUrl?: string | null;
  size?: number | null;
  sha256?: string | null;
};

type Publisher = {
  upsert(input: {
    app: StoreApp;
    version: StoreAppVersion;
    publisherName: string | null;
    badge: string | null;
  }): Promise<{ assetUrl: string }>;
  remove(appId: string): Promise<void>;
};

async function defaultInspect(pathname: string): Promise<BlobInspection> {
  const blob = await get(pathname, { access: "private" });
  if (!blob?.stream) throw new Error("blob_indisponivel");
  const hash = createHash("sha256");
  const magic = Buffer.alloc(8);
  let magicFilled = 0;
  let size = 0;
  const hasher = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      hash.update(chunk);
      size += chunk.length;
      if (magicFilled < magic.length) {
        const take = Math.min(magic.length - magicFilled, chunk.length);
        chunk.copy(magic, magicFilled, 0, take);
        magicFilled += take;
      }
      if (size > LINUX_MAX_BYTES) {
        callback(new Error("tamanho_invalido"));
        return;
      }
      callback();
    },
  });
  await pipeline(Readable.fromWeb(blob.stream as never), hasher);
  return { sha256: hash.digest("hex"), size, magicHex: magic.subarray(0, magicFilled).toString("hex") };
}

const defaultPublisher: Publisher = {
  async upsert(input) {
    const platform = input.app.platform;
    const published = await publishAppToGitHub({
      requestId: input.app.id,
      fileName: input.version.fileName || `${input.app.slug}.bin`,
      blobPathname: input.version.fileBlobPathname || "",
      sha256: input.version.fileSha256,
      size: input.version.fileSize,
      version: input.version.version,
      title: input.app.name,
      description: input.app.description,
      category: input.app.category,
      icon: input.app.icon,
      platform,
      externalUrl: platform === "windows" ? input.version.externalUrl : null,
      publisherName: input.publisherName,
      badge: input.badge,
      verified: input.app.verified,
    });
    return { assetUrl: published.assetUrl };
  },
  remove: removePublishedApp,
};

let inspectBlob: (pathname: string) => Promise<BlobInspection> = defaultInspect;
let publisher: Publisher = defaultPublisher;

export function setBlobInspectorForTests(fn: ((pathname: string) => Promise<BlobInspection>) | null): void {
  inspectBlob = fn ?? defaultInspect;
}

export function setStoreAppPublisherForTests(next: Publisher | null): void {
  publisher = next ?? defaultPublisher;
}

export function slugifyAppName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((part) => Number(part));
  const pb = b.split(".").map((part) => Number(part));
  for (let i = 0; i < 3; i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function appBadge(app: { verified: boolean; createdAt: string }, now = Date.now()): CatalogApp["badge"] {
  if (app.verified) return null;
  const created = new Date(app.createdAt).getTime();
  if (Number.isFinite(created) && now - created < NOVO_MS) return "novo";
  return "nao_verificado";
}

export function signAppDownload(versionId: string, exp: number, secret = getSessionSecret()): string {
  return createHmac("sha256", secret).update(`v1.${versionId}.${exp}`).digest("hex");
}

export function verifyAppDownload(versionId: string, exp: number, sig: string, now = Date.now()): boolean {
  if (!/^[a-f0-9]{64}$/.test(sig)) return false;
  if (!Number.isFinite(exp) || exp <= now) return false;
  const expected = signAppDownload(versionId, exp);
  const left = Buffer.from(sig, "hex");
  const right = Buffer.from(expected, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

export function appDownloadUrl(baseUrl: string, versionId: string, now = Date.now()): string {
  const exp = now + DOWNLOAD_TTL_MS;
  const sig = signAppDownload(versionId, exp);
  const root = baseUrl.replace(/\/$/, "");
  return `${root}/api/apps/download?version=${encodeURIComponent(versionId)}&exp=${exp}&sig=${sig}`;
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".localhost")) return true;
  if (host === "0.0.0.0" || host === "::1" || host === "metadata.google.internal") return true;
  const ipv4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!ipv4) return false;
  const a = Number(ipv4[1]);
  const b = Number(ipv4[2]);
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

export function parsePublicHttpsUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (isPrivateHost(url.hostname)) return null;
  if (url.href.length > 2000) return null;
  return url.toString();
}

function validBlobPath(pathname: string): boolean {
  if (pathname.includes("..") || pathname.includes("\\") || pathname.includes("\0")) return false;
  return /^apps\/[A-Za-z0-9._+/-]+$/.test(pathname);
}

function magicOk(platform: AppPlatform, fileName: string, magicHex: string): boolean {
  const lower = fileName.toLowerCase();
  const magic = magicHex.toLowerCase();
  if (platform === "linux") {
    if (lower.endsWith(".appimage")) return magic.startsWith("7f454c46");
    if (lower.endsWith(".tar.zst")) return magic.startsWith("28b52ffd");
    return false;
  }
  if (lower.endsWith(".exe")) return magic.startsWith("4d5a");
  if (lower.endsWith(".msi")) return magic.startsWith("d0cf11e0");
  if (lower.endsWith(".zip")) return magic.startsWith("504b0304");
  return false;
}

function extensionOk(platform: AppPlatform, fileName: string): boolean {
  const lower = fileName.toLowerCase();
  if (platform === "linux") return lower.endsWith(".appimage") || lower.endsWith(".tar.zst");
  return lower.endsWith(".exe") || lower.endsWith(".msi") || lower.endsWith(".zip");
}

function cleanIcon(value: string | null | undefined): string | null {
  if (value == null) return null;
  const icon = value.trim();
  if (!icon) return null;
  if (icon.length > 300 || icon.includes("<") || /javascript:/i.test(icon)) {
    throw new Error("icone_invalido");
  }
  return icon;
}

function publisherName(user: User | null): string {
  const name = user?.name?.trim();
  return name ? name.slice(0, 80) : "Publicador";
}

function versionDownloadUrl(
  app: StoreApp,
  version: StoreAppVersion,
  baseUrl: string,
  now: number,
): string | null {
  if (app.visibility === "retirado") return null;
  if (app.platform === "windows" && (version.externalUrl || version.downloadUrl)) {
    return version.externalUrl || version.downloadUrl;
  }
  if (version.id === app.publicVersionId && version.downloadUrl) return version.downloadUrl;
  if (version.fileBlobPathname) return appDownloadUrl(baseUrl, version.id, now);
  return version.downloadUrl;
}

async function usersById(store: Store, apps: StoreApp[]): Promise<Map<string, User>> {
  const ids = [...new Set(apps.map((app) => app.ownerUserId))];
  const entries = await Promise.all(ids.map(async (id) => [id, await store.getUserById(id)] as const));
  const map = new Map<string, User>();
  for (const [id, user] of entries) {
    if (user) map.set(id, user);
  }
  return map;
}

function entryFrom(
  app: StoreApp,
  version: StoreAppVersion,
  owner: User | undefined,
  viewerId: string,
  downloadUrl: string,
  now: number,
  publicVersion: string | null,
): CatalogApp {
  const mine = app.ownerUserId === viewerId;
  return {
    id: app.id,
    slug: app.slug,
    name: app.name,
    description: app.description,
    category: app.category,
    version: version.version,
    icon: app.icon,
    platform: app.platform,
    sha256: version.fileSha256,
    size: version.fileSize,
    downloadUrl,
    publishedAt: version.id === app.publicVersionId ? version.createdAt : null,
    actionLabel: storeActionLabel(app.platform),
    badge: appBadge(app, now),
    verified: app.verified,
    publisher: { id: app.ownerUserId, name: publisherName(owner ?? null) },
    mine,
    visibility: app.visibility,
    reviewNote: mine ? app.reviewNote : null,
    updatePending: mine && Boolean(app.publicVersionId) && app.authorVersionId !== app.publicVersionId,
    publicVersion: mine ? publicVersion : null,
    sha256Source: version.sha256Source,
    verifySha256BeforeInstall: true,
  };
}

async function catalogEntries(
  store: Store,
  apps: StoreApp[],
  pick: (app: StoreApp) => string | null,
  viewerId: string,
  baseUrl: string,
  now: number,
  allowMissingUrl = false,
): Promise<CatalogApp[]> {
  const owners = await usersById(store, apps);
  const out: CatalogApp[] = [];
  for (const app of apps) {
    const versionId = pick(app);
    if (!versionId) continue;
    const version = await store.getStoreAppVersion(versionId);
    if (!version || !/^[a-f0-9]{64}$/.test(version.fileSha256)) continue;
    const resolved = versionDownloadUrl(app, version, baseUrl, now);
    if (!resolved && !allowMissingUrl) continue;
    const downloadUrl = resolved ?? "";
    let publicVersion: string | null = null;
    if (app.publicVersionId && app.ownerUserId === viewerId) {
      const published = await store.getStoreAppVersion(app.publicVersionId);
      publicVersion = published?.version ?? null;
    }
    out.push(entryFrom(app, version, owners.get(app.ownerUserId), viewerId, downloadUrl, now, publicVersion));
  }
  return out;
}

/**
 * Catálogo que o YAMI OS instala.
 * O autor recebe a própria versão mais nova. Os demais recebem só a versão já aprovada.
 * Atualização de app público: o público continua na versão anterior até nova revisão.
 */
export async function catalogForInstall(
  store: Store,
  viewer: User,
  opts: { baseUrl: string; now?: number },
): Promise<CatalogApp[]> {
  await migrateLegacyAppRequests(store);
  const now = opts.now ?? Date.now();
  const apps = await store.listStoreApps();
  return catalogEntries(
    store,
    apps.filter((app) => app.visibility !== "retirado"),
    (app) => (app.ownerUserId === viewer.id ? app.authorVersionId : app.publicVersionId),
    viewer.id,
    opts.baseUrl,
    now,
  );
}

/** Vitrine do site: só o que já foi aprovado para todo mundo. */
export async function catalogForShowcase(
  store: Store,
  viewer: User,
  opts: { baseUrl: string; now?: number },
): Promise<CatalogApp[]> {
  await migrateLegacyAppRequests(store);
  const now = opts.now ?? Date.now();
  const apps = await store.listStoreApps();
  return catalogEntries(
    store,
    apps.filter((app) => app.visibility !== "retirado" && app.publicVersionId),
    (app) => app.publicVersionId,
    viewer.id,
    opts.baseUrl,
    now,
  );
}

export async function listOwnApps(
  store: Store,
  viewer: User,
  opts: { baseUrl: string; now?: number },
): Promise<CatalogApp[]> {
  await migrateLegacyAppRequests(store);
  const now = opts.now ?? Date.now();
  const apps = (await store.listStoreApps()).filter((app) => app.ownerUserId === viewer.id);
  return catalogEntries(store, apps, (app) => app.authorVersionId, viewer.id, opts.baseUrl, now, true);
}

async function takenPath(store: Store, pathname: string, ownerUserId: string): Promise<boolean> {
  const apps = await store.listStoreApps();
  for (const app of apps) {
    if (app.ownerUserId === ownerUserId) continue;
    const versions = await store.listStoreAppVersions(app.id);
    if (versions.some((version) => version.fileBlobPathname === pathname)) return true;
  }
  return false;
}

export async function submitStoreApp(store: Store, user: User, input: SubmitInput, now = Date.now()): Promise<StoreApp> {
  if (user.status === "bloqueado") throw new Error("conta_bloqueada");
  const limited = rateLimit(`store-app-submit:${user.id}`, SUBMIT_LIMIT, SUBMIT_WINDOW_MS, now);
  if (!limited.ok) throw new Error("limite_excedido");

  const name = input.name.trim();
  const description = input.description.trim();
  const category = input.category.trim();
  const version = input.version.trim();
  const platform = normalizeAppPlatform(input.platform);
  if (name.length < 3 || name.length > 80) throw new Error("nome_invalido");
  if (description.length < 10 || description.length > 4000) throw new Error("descricao_invalida");
  if (!/^[a-z0-9_-]{2,32}$/.test(category)) throw new Error("categoria_invalida");
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error("versao_invalida");
  const slug = slugifyAppName(name);
  if (slug.length < 2) throw new Error("slug_invalido");
  const icon = cleanIcon(input.icon);
  const existing = await store.getStoreAppBySlug(slug);
  if (existing && existing.ownerUserId !== user.id) throw new Error("nome_em_uso");
  if (existing?.visibility === "retirado") throw new Error("app_retirado");
  if (existing && existing.platform !== platform) throw new Error("plataforma_inalteravel");
  const currentVersion = existing ? await store.getStoreAppVersion(existing.authorVersionId) : null;
  if (currentVersion && compareVersions(version, currentVersion.version) <= 0) throw new Error("versao_nao_maior");

  const fileName = input.fileName?.trim() || null;
  const pathname = input.fileBlobPathname?.trim() || null;
  const declaredSha = input.sha256?.trim().toLowerCase() || null;
  const externalRaw = input.externalUrl?.trim() || null;

  let externalUrl: string | null = null;
  if (platform === "windows") {
    if (!externalRaw) throw new Error("url_externa_obrigatoria");
    externalUrl = parsePublicHttpsUrl(externalRaw);
    if (!externalUrl) throw new Error("url_externa_invalida");
  }

  let fileSize = 0;
  let fileSha = "";
  let sha256Source: Sha256Source = "declarado";
  let storedPath: string | null = null;

  if (platform === "linux" || pathname) {
    if (!fileName || !extensionOk(platform, fileName)) throw new Error("formato_invalido");
    if (!pathname || !validBlobPath(pathname)) throw new Error("arquivo_invalido");
    if (await takenPath(store, pathname, user.id)) throw new Error("arquivo_em_uso");
    const inspected = await inspectBlob(pathname);
    if (!magicOk(platform, fileName, inspected.magicHex)) throw new Error("formato_invalido");
    if (inspected.size <= 0 || inspected.size > LINUX_MAX_BYTES) throw new Error("tamanho_invalido");
    if (input.size != null && Number(input.size) !== inspected.size) throw new Error("tamanho_divergente");
    if (declaredSha && declaredSha !== inspected.sha256) throw new Error("sha256_divergente");
    fileSize = inspected.size;
    fileSha = inspected.sha256;
    sha256Source = "servidor";
    storedPath = pathname;
  } else {
    if (!declaredSha || !/^[a-f0-9]{64}$/.test(declaredSha)) throw new Error("sha256_invalido");
    const size = Number(input.size);
    if (!Number.isInteger(size) || size <= 0 || size > WINDOWS_EXTERNAL_MAX_BYTES) throw new Error("tamanho_invalido");
    if (fileName && !extensionOk("windows", fileName)) throw new Error("formato_invalido");
    fileSize = size;
    fileSha = declaredSha;
    sha256Source = "declarado";
  }

  const createdAt = new Date(now).toISOString();
  const versionRow: StoreAppVersion = {
    id: crypto.randomUUID(),
    appId: existing?.id ?? crypto.randomUUID(),
    version,
    fileName,
    fileSize,
    fileSha256: fileSha,
    sha256Source,
    fileBlobPathname: storedPath,
    externalUrl,
    downloadUrl: null,
    createdAt,
  };
  await store.addStoreAppVersion(versionRow);

  if (!existing) {
    const app: StoreApp = {
      id: versionRow.appId,
      slug,
      ownerUserId: user.id,
      name,
      description,
      category,
      icon,
      platform,
      visibility: "privado",
      reviewNote: null,
      verified: false,
      authorVersionId: versionRow.id,
      publicVersionId: null,
      sourceRequestId: null,
      createdAt,
      updatedAt: createdAt,
    };
    return store.createStoreApp(app);
  }

  const updated = await store.updateStoreApp(existing.id, {
    name,
    description,
    category,
    icon,
    authorVersionId: versionRow.id,
    updatedAt: createdAt,
  });
  if (!updated) throw new Error("app_indisponivel");
  return updated;
}

export async function requestPublication(store: Store, user: User, appId: string): Promise<StoreApp> {
  if (user.status === "bloqueado") throw new Error("conta_bloqueada");
  const app = await store.getStoreApp(appId);
  if (!app) throw new Error("nao_encontrado");
  if (app.ownerUserId !== user.id) throw new Error("nao_e_dono");
  if (app.visibility === "retirado") throw new Error("app_retirado");
  if (app.visibility === "publico" && app.authorVersionId === app.publicVersionId) throw new Error("ja_publico");
  const updated = await store.updateStoreApp(app.id, {
    visibility: "em_revisao",
    reviewNote: null,
    updatedAt: nowIso(),
  });
  if (!updated) throw new Error("nao_encontrado");
  return updated;
}

async function notify(store: Store, userId: string, title: string, body: string, requestId: string | null) {
  await store.createUserNotification({
    userId,
    kind: "store.app",
    title,
    body,
    requestId,
    expiresAt: null,
  });
}

export async function approveStoreApp(
  store: Store,
  opts: { appId: string; adminUserId: string; note?: string | null; force?: boolean },
): Promise<StoreApp> {
  const app = await store.getStoreApp(opts.appId);
  if (!app || app.visibility === "retirado") throw new Error("app_indisponivel");
  if (!opts.force && app.visibility !== "em_revisao") throw new Error("fora_de_revisao");
  const version = await store.getStoreAppVersion(app.authorVersionId);
  if (!version) throw new Error("versao_ausente");
  const owner = await store.getUserById(app.ownerUserId);
  const badge = appBadge(app);
  const published = await publisher.upsert({
    app,
    version,
    publisherName: publisherName(owner),
    badge,
  });
  await store.updateStoreAppVersion(version.id, { downloadUrl: published.assetUrl });
  const updated = await store.updateStoreApp(app.id, {
    visibility: "publico",
    publicVersionId: version.id,
    reviewNote: opts.note?.trim() ? opts.note.trim().slice(0, 1000) : null,
    updatedAt: nowIso(),
  });
  if (!updated) throw new Error("app_indisponivel");
  await notify(store, app.ownerUserId, "App na loja pública", `“${app.name}” ${version.version} foi aprovado e aparece para todo mundo.`, null);
  await store.addAudit({
    id: crypto.randomUUID(),
    userId: opts.adminUserId,
    deviceId: null,
    action: "store.approve",
    ip: null,
    meta: app.id,
  });
  return updated;
}

export async function rejectStoreApp(
  store: Store,
  opts: { appId: string; adminUserId: string; note: string },
): Promise<StoreApp> {
  const note = opts.note.trim();
  if (note.length < 3 || note.length > 1000) throw new Error("motivo_invalido");
  const app = await store.getStoreApp(opts.appId);
  if (!app || app.visibility === "retirado") throw new Error("app_indisponivel");
  if (app.visibility !== "em_revisao") throw new Error("fora_de_revisao");
  const visibility: StoreVisibility = app.publicVersionId ? "publico" : "privado";
  const updated = await store.updateStoreApp(app.id, {
    visibility,
    reviewNote: note,
    updatedAt: nowIso(),
  });
  if (!updated) throw new Error("app_indisponivel");
  await notify(store, app.ownerUserId, "Publicação não aprovada", `“${app.name}” continua disponível para você. Motivo: ${note}`, null);
  await store.addAudit({
    id: crypto.randomUUID(),
    userId: opts.adminUserId,
    deviceId: null,
    action: "store.reject",
    ip: null,
    meta: app.id,
  });
  return updated;
}

export async function unpublishStoreApp(store: Store, appId: string, adminUserId: string): Promise<{ app: StoreApp; warning: string | null }> {
  const app = await store.getStoreApp(appId);
  if (!app) throw new Error("nao_encontrado");
  const updated = await store.updateStoreApp(app.id, { visibility: "retirado", updatedAt: nowIso() });
  if (!updated) throw new Error("nao_encontrado");
  await store.resolveStoreAppReports(app.id);
  let warning: string | null = null;
  try {
    await publisher.remove(app.id);
  } catch (error) {
    warning = error instanceof Error ? error.message : "github_indisponivel";
  }
  await notify(store, app.ownerUserId, "App retirado da loja", `“${app.name}” saiu da loja e não pode mais ser instalado.`, null);
  await store.addAudit({
    id: crypto.randomUUID(),
    userId: adminUserId,
    deviceId: null,
    action: "store.unpublish",
    ip: null,
    meta: app.id,
  });
  return { app: updated, warning };
}

export async function verifyStoreApp(store: Store, appId: string, adminUserId: string): Promise<StoreApp> {
  const app = await store.getStoreApp(appId);
  if (!app) throw new Error("nao_encontrado");
  const updated = await store.updateStoreApp(app.id, { verified: true, updatedAt: nowIso() });
  if (!updated) throw new Error("nao_encontrado");
  await store.addAudit({
    id: crypto.randomUUID(),
    userId: adminUserId,
    deviceId: null,
    action: "store.verify",
    ip: null,
    meta: app.id,
  });
  return updated;
}

export async function restoreStoreApp(store: Store, appId: string, adminUserId: string): Promise<StoreApp> {
  const app = await store.getStoreApp(appId);
  if (!app) throw new Error("nao_encontrado");
  const updated = await store.updateStoreApp(app.id, {
    visibility: "privado",
    publicVersionId: null,
    updatedAt: nowIso(),
  });
  if (!updated) throw new Error("nao_encontrado");
  await store.addAudit({
    id: crypto.randomUUID(),
    userId: adminUserId,
    deviceId: null,
    action: "store.restore",
    ip: null,
    meta: app.id,
  });
  return updated;
}

export async function reportStoreApp(store: Store, user: User, appId: string, reason: string, now = Date.now()): Promise<StoreAppReport> {
  if (user.status === "bloqueado") throw new Error("conta_bloqueada");
  const limited = rateLimit(`store-app-report:${user.id}`, REPORT_LIMIT, SUBMIT_WINDOW_MS, now);
  if (!limited.ok) throw new Error("limite_excedido");
  const text = reason.trim();
  if (text.length < 10 || text.length > 1000) throw new Error("motivo_invalido");
  const app = await store.getStoreApp(appId);
  if (!app || app.visibility === "retirado" || !app.publicVersionId) throw new Error("app_nao_publico");
  if (app.ownerUserId === user.id) throw new Error("nao_pode_denunciar_proprio");
  const report: StoreAppReport = {
    id: crypto.randomUUID(),
    appId: app.id,
    reporterUserId: user.id,
    reason: text,
    status: "aberta",
    createdAt: new Date(now).toISOString(),
  };
  return store.createStoreAppReport(report);
}

export async function banPublisher(store: Store, userId: string, adminUserId: string): Promise<{ warnings: string[] }> {
  if (userId === adminUserId) throw new Error("nao_pode_banir_a_si");
  const user = await store.getUserById(userId);
  if (!user) throw new Error("nao_encontrado");
  await store.updateUser(userId, { status: "bloqueado" });
  await store.deleteSessionsForUser(userId);
  const devices = await store.listDevices(userId);
  for (const device of devices) {
    if (!device.revokedAt) await store.revokeDevice(device.id, userId);
  }
  const warnings: string[] = [];
  const apps = await store.listStoreApps();
  for (const app of apps) {
    if (app.ownerUserId !== userId || app.visibility === "retirado") continue;
    const result = await unpublishStoreApp(store, app.id, adminUserId);
    if (result.warning) warnings.push(result.warning);
  }
  await store.addAudit({
    id: crypto.randomUUID(),
    userId: adminUserId,
    deviceId: null,
    action: "store.ban",
    ip: null,
    meta: userId,
  });
  return { warnings };
}

function semverOrDefault(value: string | null | undefined): string {
  const version = value?.trim() ?? "";
  return /^\d+\.\d+\.\d+$/.test(version) ? version : "1.0.0";
}

/**
 * Solicitações antigas com arquivo viram app da loja.
 * Pendente, aprovada ou em desenvolvimento fica só com o autor.
 * Já publicada continua pública. Rejeitada e retirada não voltam.
 */
export async function migrateLegacyAppRequests(store: Store): Promise<{ migrated: number; skipped: number }> {
  const requests = await store.listFeatureRequests();
  let migrated = 0;
  let skipped = 0;
  for (const request of requests) {
    const result = await migrateOne(store, request);
    if (result === "migrated") migrated += 1;
    else if (result === "skipped") skipped += 1;
  }
  return { migrated, skipped };
}

async function migrateOne(store: Store, request: FeatureRequest): Promise<"migrated" | "skipped" | "exists"> {
  if (await store.getStoreAppBySourceRequest(request.id)) return "exists";
  if (request.status === "rejeitada" || request.status === "retirada") return "skipped";
  const published = request.status === "publicada" && Boolean(request.publishedAssetUrl);
  const pending = request.status === "pendente" || request.status === "aprovada" || request.status === "em_desenvolvimento";
  if (!published && !pending) return "skipped";
  if (!request.fileSha256 || !/^[a-f0-9]{64}$/i.test(request.fileSha256)) return "skipped";
  if (!request.fileBlobPathname && !published) return "skipped";

  const platform = normalizeAppPlatform(request.appPlatform);
  let sha = request.fileSha256.toLowerCase();
  let size = request.fileSize ?? 0;
  let source: Sha256Source = published ? "servidor" : "declarado";
  if (request.fileBlobPathname) {
    try {
      const inspected = await inspectBlob(request.fileBlobPathname);
      sha = inspected.sha256;
      size = inspected.size;
      source = "servidor";
    } catch {
      if (!published && size <= 0) return "skipped";
    }
  }
  if (size <= 0) return "skipped";

  const base = slugifyAppName(request.title) || "app";
  let slug = base;
  const taken = await store.getStoreAppBySlug(slug);
  if (taken) slug = `${base}-${request.id.slice(0, 8)}`.slice(0, 48);
  const createdAt = request.createdAt || nowIso();
  const versionId = crypto.randomUUID();
  const appId = crypto.randomUUID();
  const externalUrl = platform === "windows" ? parsePublicHttpsUrl(request.publishedAssetUrl ?? "") : null;
  const downloadUrl = published ? request.publishedAssetUrl : null;
  try {
    await store.addStoreAppVersion({
      id: versionId,
      appId,
      version: semverOrDefault(request.appVersion || request.publishedVersion),
      fileName: request.fileName,
      fileSize: size,
      fileSha256: sha,
      sha256Source: source,
      fileBlobPathname: request.fileBlobPathname,
      externalUrl,
      downloadUrl,
      createdAt,
    });
    await store.createStoreApp({
      id: appId,
      slug,
      ownerUserId: request.userId,
      name: request.title.slice(0, 80),
      description: request.description.slice(0, 4000),
      category: /^[a-z0-9_-]{2,32}$/.test(request.category) ? request.category : "geral",
      icon: request.appIcon,
      platform,
      visibility: published ? "publico" : "privado",
      reviewNote: null,
      verified: false,
      authorVersionId: versionId,
      publicVersionId: published ? versionId : null,
      sourceRequestId: request.id,
      createdAt,
      updatedAt: request.updatedAt || createdAt,
    });
  } catch {
    return "exists";
  }
  return "migrated";
}

export async function adminStoreOverview(store: Store) {
  await migrateLegacyAppRequests(store);
  const apps = await store.listStoreApps();
  const reports = await store.listStoreAppReports();
  const items = [];
  for (const app of apps) {
    const owner = await store.getUserById(app.ownerUserId);
    const authorVersion = await store.getStoreAppVersion(app.authorVersionId);
    const publicVersion = app.publicVersionId ? await store.getStoreAppVersion(app.publicVersionId) : null;
    items.push({
      ...app,
      authorVersion,
      publicVersion,
      owner: owner ? { id: owner.id, email: owner.email, name: owner.name, status: owner.status ?? "ativo" } : null,
      openReports: reports.filter((report) => report.appId === app.id && report.status === "aberta"),
    });
  }
  return { apps: items, reports };
}
