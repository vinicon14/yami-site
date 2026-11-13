import { NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/admin";
import { rollbackReleaseFile } from "@/lib/admin-publish";
import { publicHistoryItem } from "@/lib/admin-release";
import { getStore } from "@/lib/db";
import { clientIp, jsonError, sameOrigin } from "@/lib/http";
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
  const historyId = String(body.historyId ?? "").trim();
  if (!historyId) return jsonError("informe a versão anterior", 400);

  try {
    const store = await getStore();
    const manifest = await rollbackReleaseFile({
      historyId,
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
    const message = err instanceof Error ? err.message : "não foi possível voltar a versão";
    return jsonError(message, 400);
  }
}
