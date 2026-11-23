import { NextResponse } from "next/server";
import {
  createSessionForUser,
  isSecureRequest,
  sessionCookie,
  verifyPassword,
} from "@/lib/auth";
import { getStore } from "@/lib/db";
import { clientIp, isValidEmail, jsonError, sameOrigin } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return jsonError("origem inválida", 403);
  const limited = rateLimit(`login:${clientIp(req)}`, 10, 15 * 60 * 1000);
  if (!limited.ok) return jsonError("muitas tentativas, tente mais tarde", 429);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonError("pedido inválido", 400);
  }
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!isValidEmail(email) || !password) {
    return jsonError("e-mail ou senha inválidos", 401);
  }
  const store = await getStore();
  const user = await store.getUserByEmail(email);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return jsonError("e-mail ou senha inválidos", 401);
  }
  if (user.status === "bloqueado") return jsonError("conta bloqueada", 403);
  await store.addAudit({
    id: crypto.randomUUID(),
    userId: user.id,
    deviceId: null,
    action: "auth.login",
    ip: clientIp(req),
    meta: null,
  });
  const { raw } = await createSessionForUser(user, req.headers.get("user-agent"));
  const res = NextResponse.json({
    ok: true,
    user: { id: user.id, email: user.email, name: user.name },
  });
  res.headers.append("Set-Cookie", sessionCookie(raw, isSecureRequest(req)));
  return res;
}
