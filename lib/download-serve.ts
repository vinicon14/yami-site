import { getDownloadSecret, getMaxDownloads } from "./config";
import { getStore, type Store } from "./db";
import { checkDownloadToken, hashToken } from "./download-token";
import { presignReleaseDownload } from "./blob-release";
import { getCurrentManifest } from "./release-store";
import {
  isReleaseKind,
  type ReleaseFile,
  type ReleaseKind,
} from "./release";

export type DownloadAuthOk = {
  ok: true;
  file: ReleaseFile;
  tokenId: string;
  orderId: string;
};

export type DownloadAuthErr = {
  ok: false;
  status: number;
  error: string;
  reason: string;
};

export async function authorizeDownload(opts: {
  token: string;
  file: string | null;
  store?: Store;
}): Promise<DownloadAuthOk | DownloadAuthErr> {
  const token = opts.token ?? "";
  if (!token || !/^[a-f0-9]{64}$/i.test(token)) {
    return { ok: false, status: 400, error: "link inválido", reason: "invalid_token" };
  }
  const kind: ReleaseKind = isReleaseKind(opts.file) ? opts.file : "setup";
  const store = opts.store ?? (await getStore());
  const row = await store.getDownloadTokenByHash(
    hashToken(token, getDownloadSecret()),
  );
  if (!row) {
    return {
      ok: false,
      status: 404,
      error: "link inválido ou já expirado",
      reason: "not_found",
    };
  }
  const used = await store.totalDownloadsForOrder(row.orderId);
  const check = checkDownloadToken({
    expiresAt: new Date(row.expiresAt),
    downloadsUsed: Math.max(row.downloadsUsed, used),
    maxDownloads: Math.min(row.maxDownloads, getMaxDownloads()),
  });
  if (!check.ok) {
    const msg =
      check.reason === "expired"
        ? "Este link expirou. Abra a página de sucesso do pedido ou escreva para o suporte com o e-mail da compra."
        : "Este pedido já atingiu o limite de downloads.";
    return { ok: false, status: 410, error: msg, reason: check.reason };
  }

  const manifest = await getCurrentManifest(store);
  const file = manifest?.files[kind];
  if (!file) {
    if (kind === "apk") {
      return {
        ok: false,
        status: 503,
        error: "APK em breve",
        reason: "apk_coming_soon",
      };
    }
    return {
      ok: false,
      status: 503,
      error:
        "O arquivo de instalação ainda não foi publicado neste ambiente. Sua licença está reservada. Tente de novo mais tarde.",
      reason: "installer_missing",
    };
  }
  return { ok: true, file, tokenId: row.id, orderId: row.orderId };
}

export async function presignAuthorizedFile(
  file: ReleaseFile,
  operation: "get" | "head",
): Promise<{ url: string; expiresAt: string }> {
  return presignReleaseDownload({
    pathname: file.blobPathname,
    operation,
  });
}
