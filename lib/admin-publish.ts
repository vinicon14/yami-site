import { applyReleaseFile, buildReleaseFile } from "./admin-release";
import { getStore, type Store } from "./db";
import type { ReleaseFile, ReleaseKind, ReleaseManifest } from "./release";
import { getCurrentManifest, saveManifest } from "./release-store";

export async function registerPublishedFile(opts: {
  kind: ReleaseKind;
  filename: string;
  version: string;
  size: number;
  sha256: string;
  blobPathname: string;
  publishedAt?: string;
  actor: { userId: string; email: string };
  ip?: string | null;
  store?: Store;
}): Promise<ReleaseManifest> {
  const file = buildReleaseFile({
    kind: opts.kind,
    filename: opts.filename,
    version: opts.version,
    size: opts.size,
    sha256: opts.sha256,
    blobPathname: opts.blobPathname,
    publishedAt: opts.publishedAt,
  });
  if (!file) throw new Error("não foi possível registrar o arquivo");
  return commitReleaseFile({ file, actor: opts.actor, ip: opts.ip, store: opts.store, action: "release.upload" });
}

export async function rollbackReleaseFile(opts: {
  historyId: string;
  actor: { userId: string; email: string };
  ip?: string | null;
  store?: Store;
}): Promise<ReleaseManifest> {
  const store = opts.store ?? (await getStore());
  const entry = await store.getReleaseHistoryById(opts.historyId);
  if (!entry) throw new Error("versão anterior não encontrada");
  return commitReleaseFile({
    file: entry.payload,
    actor: opts.actor,
    ip: opts.ip,
    store,
    action: "release.rollback",
  });
}

async function commitReleaseFile(opts: {
  file: ReleaseFile;
  actor: { userId: string; email: string };
  ip?: string | null;
  store?: Store;
  action: "release.upload" | "release.rollback";
}): Promise<ReleaseManifest> {
  const store = opts.store ?? (await getStore());
  const previous = await getCurrentManifest(store);
  const manifest = applyReleaseFile(previous, opts.file);
  await saveManifest(manifest, store);
  await store.addReleaseHistory({
    id: crypto.randomUUID(),
    kind: opts.file.kind,
    payload: opts.file,
    uploadedByEmail: opts.actor.email,
    uploadedByUserId: opts.actor.userId,
  });
  await store.addAudit({
    id: crypto.randomUUID(),
    userId: opts.actor.userId,
    deviceId: null,
    action: opts.action,
    ip: opts.ip ?? null,
    meta: JSON.stringify({
      kind: opts.file.kind,
      version: opts.file.version,
      filename: opts.file.filename,
      size: opts.file.size,
      sha256: opts.file.sha256,
    }),
  });
  return manifest;
}
