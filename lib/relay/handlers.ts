import { getSessionUser, readSessionCookie } from "../auth";
import { getStore } from "../db";
import { clientIp, jsonError, sameOrigin } from "../http";
import {
  LICENSE_MISSING_HINT,
  LICENSE_MISSING_TITLE,
  userHasPaidLicense,
} from "../license-gate";
import { deviceFromToken } from "../pairing";
import { rateLimit } from "../rate-limit";
import { getRelay, type RelayKind } from "./index";
import {
  PayloadTooLargeError,
  RELAY_DEFAULT_WAIT_MS,
  assertPayloadSize,
  clampWaitMs,
  needsLocalApproval,
} from "./protocol";
import { NextResponse } from "next/server";

function bearer(req: Request): string {
  const h = req.headers.get("authorization") ?? "";
  if (h.toLowerCase().startsWith("bearer ")) return h.slice(7).trim();
  const url = new URL(req.url);
  return url.searchParams.get("token") ?? "";
}

function rateLimited(key: string, limit: number, windowMs: number) {
  const r = rateLimit(key, limit, windowMs);
  if (r.ok) return null;
  const res = jsonError("muitas tentativas, tente mais tarde", 429);
  res.headers.set("Retry-After", String(r.retryAfterSec));
  return res;
}

async function requireLicensedDevice(req: Request) {
  const device = await deviceFromToken(bearer(req));
  if (!device) {
    return { error: jsonError("dispositivo não autorizado", 401) };
  }
  const store = await getStore();
  const user = await store.getUserById(device.userId);
  if (!user || !(await userHasPaidLicense(user.email, store))) {
    return {
      error: jsonError(`${LICENSE_MISSING_TITLE} ${LICENSE_MISSING_HINT}`, 403),
    };
  }
  return { device, store, user };
}

async function requireLicensedSession(req: Request, checkOrigin: boolean) {
  if (checkOrigin && !sameOrigin(req)) {
    return { error: jsonError("origem inválida", 403) };
  }
  const current = await getSessionUser(readSessionCookie(req));
  if (!current) return { error: jsonError("entre na sua conta", 401) };
  const store = await getStore();
  if (!(await userHasPaidLicense(current.user.email, store))) {
    return {
      error: jsonError(`${LICENSE_MISSING_TITLE} ${LICENSE_MISSING_HINT}`, 403),
    };
  }
  return { current, store };
}

async function ownedDevice(
  store: Awaited<ReturnType<typeof getStore>>,
  userId: string,
  deviceId: string,
) {
  if (!deviceId) return null;
  const device = await store.getDeviceById(deviceId);
  if (!device || device.userId !== userId || device.revokedAt) return null;
  return device;
}

async function deviceStatuses(
  store: Awaited<ReturnType<typeof getStore>>,
  userId: string,
) {
  const relay = getRelay();
  const devices = await store.listDevices(userId);
  return Promise.all(
    devices
      .filter((d) => !d.revokedAt)
      .map(async (d) => {
        const status = await relay.getStatus(d.id);
        return {
          id: d.id,
          name: d.name,
          online: status.online,
          lastSeenAt: status.lastSeenAt ?? d.lastSeenAt,
          createdAt: d.createdAt,
        };
      }),
  );
}

function parseBodyKind(body: Record<string, unknown>, fallback: RelayKind): RelayKind {
  const raw = String(body.kind ?? fallback);
  const allowed: RelayKind[] = [
    "chat",
    "forage",
    "config",
    "approval_request",
    "approval_result",
    "status",
    "event",
  ];
  return (allowed as string[]).includes(raw) ? (raw as RelayKind) : fallback;
}

/** GET /api/relay/device/pull — coleta (long-poll) com o token do aparelho. */
export async function handleDevicePull(req: Request): Promise<Response> {
  const limited = rateLimited(`relay-dev-pull:${clientIp(req)}`, 120, 60_000);
  if (limited) return limited;
  const auth = await requireLicensedDevice(req);
  if ("error" in auth && auth.error) return auth.error;
  const { device } = auth;
  const url = new URL(req.url);
  const afterSeq = Number(url.searchParams.get("afterSeq") ?? 0) || 0;
  const waitMs = clampWaitMs(
    url.searchParams.get("waitMs") ?? RELAY_DEFAULT_WAIT_MS,
    RELAY_DEFAULT_WAIT_MS,
  );
  const relay = getRelay();
  const result = await relay.pullForDevice(device!.id, {
    afterSeq,
    waitMs,
    signal: req.signal,
  });
  return NextResponse.json({
    ok: true,
    deviceId: device!.id,
    messages: result.messages,
    lastSeq: result.lastSeq,
    serverTime: new Date().toISOString(),
  });
}

/** POST /api/relay/device/push — o PC envia um evento ao painel. */
export async function handleDevicePush(req: Request): Promise<Response> {
  const limited = rateLimited(`relay-dev-push:${clientIp(req)}`, 60, 60_000);
  if (limited) return limited;
  const auth = await requireLicensedDevice(req);
  if ("error" in auth && auth.error) return auth.error;
  const { device, store, user } = auth;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonError("pedido inválido", 400);
  }
  const kind = parseBodyKind(body, "event");
  const payload = body.payload ?? {};
  try {
    assertPayloadSize({ kind, payload });
  } catch (err) {
    if (err instanceof PayloadTooLargeError) return jsonError(err.message, 413);
    throw err;
  }
  const needs = needsLocalApproval(kind, payload, Boolean(body.needsLocalApproval));
  const relay = getRelay();
  const message = await relay.pushToPainel(device!.id, {
    kind,
    payload,
    from: "desktop",
    needsLocalApproval: needs,
  });
  await store!.addAudit({
    id: crypto.randomUUID(),
    userId: user!.id,
    deviceId: device!.id,
    action: `relay.up.${kind}`,
    ip: clientIp(req),
    meta: needs ? "needs_local_approval" : null,
  });
  return NextResponse.json({ ok: true, message });
}

/** GET /api/relay/painel/pull — coleta / histórico / status, sessão da pessoa. */
export async function handlePainelPull(req: Request): Promise<Response> {
  const limited = rateLimited(`relay-painel-pull:${clientIp(req)}`, 120, 60_000);
  if (limited) return limited;
  const auth = await requireLicensedSession(req, false);
  if ("error" in auth && auth.error) return auth.error;
  const { current, store } = auth;
  const url = new URL(req.url);
  const deviceId = url.searchParams.get("deviceId") ?? "";
  const afterSeq = Number(url.searchParams.get("afterSeq") ?? 0) || 0;
  const history =
    url.searchParams.get("history") === "1" ||
    url.searchParams.get("history") === "true";
  const waitMs = clampWaitMs(url.searchParams.get("waitMs"), history ? 0 : 0);
  // long-poll só quando o cliente pede waitMs explicitamente
  const wait = url.searchParams.has("waitMs")
    ? clampWaitMs(url.searchParams.get("waitMs"))
    : waitMs;
  const relay = getRelay();
  const devices = await deviceStatuses(store!, current!.user.id);
  if (!deviceId) {
    return NextResponse.json({
      ok: true,
      messages: [],
      lastSeq: 0,
      devices,
      serverTime: new Date().toISOString(),
    });
  }
  const device = await ownedDevice(store!, current!.user.id, deviceId);
  if (!device) return jsonError("dispositivo não encontrado", 404);
  const result = await relay.pullForPainel(device.id, {
    afterSeq,
    waitMs: wait,
    history,
    signal: req.signal,
  });
  const status = await relay.getStatus(device.id);
  return NextResponse.json({
    ok: true,
    deviceId: device.id,
    messages: result.messages,
    lastSeq: result.lastSeq,
    devices,
    online: status.online,
    lastSeenAt: status.lastSeenAt,
    serverTime: new Date().toISOString(),
  });
}

/** POST /api/relay/painel/push — o painel envia um pedido ao PC. */
export async function handlePainelPush(req: Request): Promise<Response> {
  const limited = rateLimited(`relay-painel-push:${clientIp(req)}`, 60, 60_000);
  if (limited) return limited;
  const auth = await requireLicensedSession(req, true);
  if ("error" in auth && auth.error) return auth.error;
  const { current, store } = auth;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonError("pedido inválido", 400);
  }
  const deviceId = String(body.deviceId ?? "");
  const device = await ownedDevice(store!, current!.user.id, deviceId);
  if (!device) return jsonError("escolha um dispositivo", deviceId ? 404 : 400);
  const kind = parseBodyKind(body, "chat");
  const payload = body.payload ?? {};
  try {
    assertPayloadSize({ kind, payload });
  } catch (err) {
    if (err instanceof PayloadTooLargeError) return jsonError(err.message, 413);
    throw err;
  }
  const needs = needsLocalApproval(kind, payload, Boolean(body.needsLocalApproval));
  const relay = getRelay();
  const status = await relay.getStatus(device.id);
  const message = await relay.pushToDevice(device.id, {
    kind,
    payload,
    from: "browser",
    needsLocalApproval: needs,
  });
  await store!.addAudit({
    id: crypto.randomUUID(),
    userId: current!.user.id,
    deviceId: device.id,
    action: `relay.down.${kind}`,
    ip: clientIp(req),
    meta: needs ? "needs_local_approval" : status.online ? null : "queued_offline",
  });
  return NextResponse.json({
    ok: true,
    message,
    needsLocalApproval: needs,
    online: status.online,
    queued: !status.online,
  });
}
