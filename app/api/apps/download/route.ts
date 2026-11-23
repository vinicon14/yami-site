import { get } from "@vercel/blob";
import { jsonError } from "../../desktop/_shared";
import { getStore } from "@/lib/db";
import { verifyAppDownload } from "@/lib/store-apps";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function safeName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120);
  return cleaned || "app.bin";
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const versionId = url.searchParams.get("version") ?? "";
  const exp = Number(url.searchParams.get("exp"));
  const sig = url.searchParams.get("sig") ?? "";
  if (!versionId || !verifyAppDownload(versionId, exp, sig)) return jsonError("link_invalido", 403);
  const store = await getStore();
  const version = await store.getStoreAppVersion(versionId);
  if (!version?.fileBlobPathname) return jsonError("arquivo_indisponivel", 404);
  const app = await store.getStoreApp(version.appId);
  if (!app || app.visibility === "retirado") return jsonError("arquivo_indisponivel", 404);
  const owner = await store.getUserById(app.ownerUserId);
  if (owner?.status === "bloqueado") return jsonError("arquivo_indisponivel", 404);
  const blob = await get(version.fileBlobPathname, { access: "private" });
  if (!blob?.stream) return jsonError("arquivo_indisponivel", 404);
  const filename = safeName(version.fileName || "app.bin");
  return new Response(blob.stream, {
    headers: {
      "content-type": "application/octet-stream",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "private, no-store",
      "x-checksum-sha256": version.fileSha256,
    },
  });
}
