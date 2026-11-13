import { NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/admin";
import { registerPublishedFile } from "@/lib/admin-publish";
import {
  assertUploadPathname,
  publicHistoryItem,
  validateUploadMeta,
} from "@/lib/admin-release";
import { clientIp, jsonError, sameOrigin } from "@/lib/http";
import { getStore } from "@/lib/db";
import { toPublicManifest } from "@/lib/release";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const admin = await getAdminFromRequest(req);
  if (!admin.ok) return jsonError(admin.error, admin.status);
  if (!sameOrigin(req)) return jsonError("origem inválida", 403);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonError("pedido inválido", 400);
  }

  const meta = validateUploadMeta({
    kind: String(body.kind ?? ""),
    filename: String(body.filename ?? ""),
    version: String(body.version ?? ""),
    size: Number(body.size),
    sha256: String(body.sha256 ?? ""),
  });
  if (!meta.ok) return jsonError(meta.error, 400);
  if (!meta.sha256) return jsonError("SHA256 inválido", 400);
  const pathname = String(body.pathname ?? "").trim();
  const pathError = assertUploadPathname(pathname, meta);
  if (pathError) return jsonError(pathError, 400);

  try {
    const store = await getStore();
    const manifest = await registerPublishedFile({
      kind: meta.kind,
      filename: meta.filename,
      version: meta.version,
      size: meta.size,
      sha256: meta.sha256,
      blobPathname: pathname,
      actor: { userId: admin.user.id, email: admin.user.email },
      ip: clientIp(req),
      store,
    });
    const history = await store.listReleaseHistory(undefined, 40);
    return NextResponse.json({
      ok: true,
      manifest: toPublicManifest(manifest),
      history: history.map(publicHistoryItem),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "não foi possível registrar o arquivo";
    return jsonError(message, 400);
  }
}
