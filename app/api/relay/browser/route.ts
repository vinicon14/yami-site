import { getSessionUser, readSessionCookie } from "@/lib/auth";
import { getStore } from "@/lib/db";
import { jsonError, sameOrigin } from "@/lib/http";
import { getRelay, type RelayKind } from "@/lib/relay";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LOCAL_APPROVAL_KINDS = new Set(["file", "command", "shell", "approval_request"]);

export async function GET(req: Request) {
  const current = await getSessionUser(readSessionCookie(req));
  if (!current) return jsonError("entre na sua conta", 401);
  const relay = getRelay();
  const messages = await relay.pullForBrowser(current.user.id);
  const store = await getStore();
  const devices = await store.listDevices(current.user.id);
  const statuses = await Promise.all(
    devices
      .filter((d) => !d.revokedAt)
      .map(async (d) => ({
        id: d.id,
        name: d.name,
        ...(await relay.getStatus(d.id)),
      })),
  );
  return NextResponse.json({ ok: true, messages, devices: statuses });
}

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
  if (!deviceId) return jsonError("escolha um dispositivo", 400);
  const store = await getStore();
  const device = await store.getDeviceById(deviceId);
  if (!device || device.userId !== current.user.id || device.revokedAt) {
    return jsonError("dispositivo não encontrado", 404);
  }
  const kind = String(body.kind ?? "chat") as RelayKind;
  const payload = body.payload ?? {};
  const needsLocalApproval =
    Boolean(body.needsLocalApproval) ||
    LOCAL_APPROVAL_KINDS.has(kind) ||
    (typeof payload === "object" &&
      payload !== null &&
      "action" in payload &&
      LOCAL_APPROVAL_KINDS.has(String((payload as { action?: string }).action)));
  const relay = getRelay();
  const online = await relay.isDesktopOnline(device.id);
  if (!online) {
    return jsonError(
      "O PC de casa está desligado ou a YAMI não está aberta. Nada é processado até ela voltar.",
      409,
    );
  }
  const message = await relay.pushToDesktop(device.id, {
    kind,
    payload,
    from: "browser",
    needsLocalApproval,
  });
  await store.addAudit({
    id: crypto.randomUUID(),
    userId: current.user.id,
    deviceId: device.id,
    action: `relay.${kind}`,
    ip: null,
    meta: needsLocalApproval ? "needs_local_approval" : null,
  });
  return NextResponse.json({ ok: true, message, needsLocalApproval });
}
