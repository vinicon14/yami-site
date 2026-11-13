import { blobConfigured, readManifestFromBlob, writeManifestToBlob } from "./blob-release";
import { getStore, type Store } from "./db";
import { parseReleaseManifest, type ReleaseManifest } from "./release";

export async function getCurrentManifest(
  store?: Store,
): Promise<ReleaseManifest | null> {
  const s = store ?? (await getStore());
  const fromDb = await s.getReleaseManifest();
  if (fromDb) return fromDb;
  const fromBlob = await readManifestFromBlob();
  if (fromBlob) {
    // Espelha no banco para as próximas leituras, sem falhar o pedido.
    await s.putReleaseManifest(fromBlob).catch(() => undefined);
    return fromBlob;
  }
  // Fallback de teste / dev: JSON no ambiente, sem pathname secreto em produção.
  const raw = process.env.YAMI_RELEASE_MANIFEST_JSON;
  if (raw) return parseReleaseManifest(JSON.parse(raw));
  return null;
}

export async function saveManifest(manifest: ReleaseManifest, store?: Store) {
  const s = store ?? (await getStore());
  await s.putReleaseManifest(manifest);
  if (blobConfigured()) {
    await writeManifestToBlob(manifest);
  }
}
