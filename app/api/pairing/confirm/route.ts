import { getSessionUser, readSessionCookie } from "@/lib/auth";
import { getStore } from "@/lib/db";
import { clientIp, jsonError, sameOrigin } from "@/lib/http";
import { confirmPairing, confirmPairingByEmail } from "@/lib/pairing";
import { LICENSE_MISSING_HINT, LICENSE_MISSING_TITLE, userHasPaidLicense } from "@/lib/license-gate";
import { rateLimit } from "@/lib/rate-limit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return jsonError("origem inválida", 403);
  const limited = rateLimit(`pair-confirm:${clientIp(req)}`, 10, 15 * 60 * 1000);
  if (!limited.ok) return jsonError("muitas tentativas, tente mais tarde", 429);
  const current = await getSessionUser(readSessionCookie(req));
  if (!current) return jsonError("entre na sua conta para parear", 401);
  const storeForLicense = await getStore();
  if (!(await userHasPaidLicense(current.user.email, storeForLicense))) {
    return jsonError(`${LICENSE_MISSING_TITLE} ${LICENSE_MISSING_HINT}`, 403);
  }


  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonError("pedido inválido", 400);
  }
  const code = String(body.code ?? "").replace(/\s+/g, "").toUpperCase();
  const deviceName = String(body.deviceName ?? "PC de casa");
  if (!/^[A-HJ-NP-Z2-9]{6,8}$/.test(code)) {
    return jsonError("informe o código de 6 caracteres que aparece no aplicativo", 400);
  }
  try {
    const device = await confirmPairing(code, current.user, deviceName);
    return NextResponse.json({
      ok: true,
      device: { id: device.id, name: device.name, createdAt: device.createdAt },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "falha no pareamento";
    const status = message.includes("inválido") || message.includes("expirado") || message.includes("usado") ? 400 : 500;
    return jsonError(message, status);
  }
}

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!token) return jsonError("token ausente", 400);
  const current = await getSessionUser(readSessionCookie(req));
  if (!current) {
    return NextResponse.redirect(new URL(`/entrar?next=/parear&token=${encodeURIComponent(token)}`, req.url));
  }
  const store = await getStore();
  try {
    const result = await confirmPairingByEmail(store, token, current.user.id);
    return NextResponse.json({ ok: true, device: { id: result.device.id, name: result.device.name } });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "token inválido", 400);
  }
}
