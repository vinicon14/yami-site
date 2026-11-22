import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { adminFromRequest } from "../../../desktop/_shared";
import { jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const admin = await adminFromRequest(req);
  if (!admin) return jsonError("sem permissão", 403);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return jsonError("invalid_request", 400); }
  const status = body.status === undefined ? undefined : String(body.status);
  if (status !== undefined && status !== "ativo" && status !== "bloqueado") return jsonError("invalid_request", 400);
  const password = String(body.password ?? "");
  if (password && (password.length < 8 || password.length > 128)) return jsonError("senha_invalida", 400);
  const store = await getStore();
  const target = await store.getUserById((await ctx.params).id);
  if (!target) return jsonError("not_found", 404);
  await store.updateUser(target.id, {
    status: status as "ativo" | "bloqueado" | undefined,
    passwordHash: password ? await hashPassword(password) : undefined,
  });
  await store.addAudit({
    id: crypto.randomUUID(),
    userId: admin.user.id,
    deviceId: null,
    action: "admin.user.update",
    ip: null,
    meta: target.email,
  });
  return NextResponse.json({ ok: true });
}
