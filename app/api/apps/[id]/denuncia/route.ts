import { jsonError } from "../../../desktop/_shared";
import { NextResponse } from "next/server";
import { reportStoreApp } from "@/lib/store-apps";
import { accountFromRequest, originOk } from "@/lib/store-app-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const account = await accountFromRequest(req);
  if (!account) return jsonError("não autenticado", 401);
  if ("blocked" in account) return jsonError("conta_bloqueada", 403);
  if (!originOk(req)) return jsonError("origem inválida", 403);
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonError("pedido_invalido", 400);
  }
  try {
    const report = await reportStoreApp(account.store, account.user, (await ctx.params).id, String(body.reason ?? ""));
    return NextResponse.json({ ok: true, report }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "pedido_invalido";
    const status = code === "limite_excedido" ? 429 : code === "app_nao_publico" ? 404 : 400;
    return jsonError(code, status);
  }
}
