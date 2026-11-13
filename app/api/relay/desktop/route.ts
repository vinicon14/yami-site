import { deviceFromToken } from "@/lib/pairing";
import { jsonError } from "@/lib/http";
import { getRelay, type RelayKind } from "@/lib/relay";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function bearer(req: Request): string {
  const h = req.headers.get("authorization") ?? "";
  if (h.toLowerCase().startsWith("bearer ")) return h.slice(7).trim();
  return "";
}

export async function GET(req: Request) {
  const device = await deviceFromToken(bearer(req));
  if (!device) return jsonError("dispositivo não autorizado", 401);
  const relay = getRelay();
  await relay.setDesktopOnline(device.id, true);
  const messages = await relay.pullForDesktop(device.id);
  return NextResponse.json({
    ok: true,
    deviceId: device.id,
    messages,
  });
}

export async function POST(req: Request) {
  const device = await deviceFromToken(bearer(req));
  if (!device) return jsonError("dispositivo não autorizado", 401);
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonError("pedido inválido", 400);
  }
  const kind = String(body.kind ?? "event") as RelayKind;
  const relay = getRelay();
  await relay.setDesktopOnline(device.id, true);
  const message = await relay.pushToBrowser(device.userId, {
    kind,
    payload: body.payload ?? {},
    from: "desktop",
    needsLocalApproval: Boolean(body.needsLocalApproval),
  });
  return NextResponse.json({ ok: true, message });
}
