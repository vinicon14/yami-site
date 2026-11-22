import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { getSessionUser, hashPassword, readSessionCookie } from "@/lib/auth";
import { jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(req: Request) {
  const current = await getSessionUser(readSessionCookie(req));
  if (!current) return jsonError("não autenticado", 401);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return jsonError("invalid_request", 400); }
  const store = await getStore();
  const name = String(body.name ?? current.user.name).trim().slice(0, 80);
  const password = String(body.password ?? "");
  if (password && (password.length < 8 || password.length > 128)) return jsonError("senha_invalida", 400);
  await store.updateUser(current.user.id, {
    name,
    passwordHash: password ? await hashPassword(password) : current.user.passwordHash,
  });
  return NextResponse.json({ ok: true });
}
