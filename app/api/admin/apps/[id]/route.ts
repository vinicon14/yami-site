import { NextResponse } from "next/server";
import { adminFromRequest, jsonError } from "../../../desktop/_shared";
import { getStore } from "@/lib/db";
import { sameOrigin } from "@/lib/http";
import {
  approveStoreApp,
  banPublisher,
  rejectStoreApp,
  restoreStoreApp,
  unpublishStoreApp,
  verifyStoreApp,
} from "@/lib/store-apps";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await adminFromRequest(req);
  if (!admin) return jsonError("sem permissão", 403);
  if (!sameOrigin(req)) return jsonError("origem inválida", 403);
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonError("pedido_invalido", 400);
  }
  const action = String(body.action ?? "");
  const note = body.note == null ? "" : String(body.note);
  const id = (await ctx.params).id;
  const store = await getStore();
  try {
    if (action === "aprovar") {
      const app = await approveStoreApp(store, { appId: id, adminUserId: admin.user.id, note });
      return NextResponse.json({ ok: true, app });
    }
    if (action === "rejeitar") {
      const app = await rejectStoreApp(store, { appId: id, adminUserId: admin.user.id, note });
      return NextResponse.json({ ok: true, app });
    }
    if (action === "retirar") {
      const result = await unpublishStoreApp(store, id, admin.user.id);
      return NextResponse.json({ ok: true, ...result });
    }
    if (action === "verificar") {
      const app = await verifyStoreApp(store, id, admin.user.id);
      return NextResponse.json({ ok: true, app });
    }
    if (action === "restaurar") {
      const app = await restoreStoreApp(store, id, admin.user.id);
      return NextResponse.json({ ok: true, app });
    }
    if (action === "banir") {
      const app = await store.getStoreApp(id);
      if (!app) return jsonError("nao_encontrado", 404);
      const result = await banPublisher(store, app.ownerUserId, admin.user.id);
      return NextResponse.json({ ok: true, ...result });
    }
    return jsonError("acao_invalida", 400);
  } catch (error) {
    const code = error instanceof Error ? error.message : "pedido_invalido";
    const status = code === "nao_encontrado" ? 404 : 400;
    return jsonError(code, status);
  }
}
