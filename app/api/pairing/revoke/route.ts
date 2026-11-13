import { getSessionUser, readSessionCookie } from "@/lib/auth";
import { getStore } from "@/lib/db";
import { clientIp, jsonError, sameOrigin } from "@/lib/http";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return jsonError("origem inválida", 403);
  const current = await getSessionUser(readSessionCookie(req));
  if (!current) return jsonError("entre na sua conta", 401);
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonError("pedido inválido", 400);
  }
  const deviceId = String(body.deviceId ?? "");
  if (!deviceId) return jsonError("dispositivo ausente", 400);
  const store = await getStore();
  const device = await store.revokeDevice(deviceId, current.user.id);
  if (!device) return jsonError("dispositivo não encontrado", 404);
  await store.addAudit({
    id: crypto.randomUUID(),
    userId: current.user.id,
    deviceId: device.id,
    action: "pairing.revoke",
    ip: clientIp(req),
    meta: device.name,
  });
  return NextResponse.json({ ok: true });
}
