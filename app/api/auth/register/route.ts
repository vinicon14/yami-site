import { NextResponse } from "next/server";
import {
  createSessionForUser,
  hashPassword,
  isSecureRequest,
  passwordIssues,
  sessionCookie,
} from "@/lib/auth";
import { getStore } from "@/lib/db";
import { clientIp, isValidEmail, jsonError, sameOrigin } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return jsonError("origem inválida", 403);
  const limited = rateLimit(`register:${clientIp(req)}`, 5, 15 * 60 * 1000);
  if (!limited.ok) return jsonError("muitas tentativas, tente mais tarde", 429);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonError("pedido inválido", 400);
  }
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const name = String(body.name ?? "").trim().slice(0, 80);
  if (!isValidEmail(email)) return jsonError("informe um e-mail válido", 400);
  const issue = passwordIssues(password);
  if (issue) return jsonError(issue, 400);

  const store = await getStore();
  if (await store.getUserByEmail(email)) {
    return jsonError("já existe uma conta com este e-mail", 409);
  }
  const user = await store.createUser({
    id: crypto.randomUUID(),
    email,
    name: name || null,
    passwordHash: await hashPassword(password),
  });
  await store.addAudit({
    id: crypto.randomUUID(),
    userId: user.id,
    deviceId: null,
    action: "auth.register",
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
