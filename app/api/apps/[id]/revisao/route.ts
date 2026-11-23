import { NextResponse } from "next/server";
import { jsonError } from "../../../desktop/_shared";
import { requestPublication } from "@/lib/store-apps";
import { accountFromRequest, originOk } from "@/lib/store-app-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const account = await accountFromRequest(req);
  if (!account) return jsonError("não autenticado", 401);
  if ("blocked" in account) return jsonError("conta_bloqueada", 403);
  if (!originOk(req)) return jsonError("origem inválida", 403);
  try {
    const app = await requestPublication(account.store, account.user, (await ctx.params).id);
    return NextResponse.json({ ok: true, app });
  } catch (error) {
    const code = error instanceof Error ? error.message : "pedido_invalido";
    return jsonError(code, code === "nao_encontrado" ? 404 : 400);
  }
}
