import { createHmac, timingSafeEqual } from "node:crypto";

export type SignatureResult =
  | { ok: true; ts: string }
  | { ok: false; reason: string };

export function parseSignatureHeader(
  header: string | null | undefined,
): { ts: string; v1: string[] } | null {
  if (!header) return null;
  let ts = "";
  const v1: string[] = [];
  for (const part of header.split(",")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const k = trimmed.slice(0, eq).trim();
    const v = trimmed.slice(eq + 1).trim();
    if (k === "ts") ts = v;
    if (k === "v1") v1.push(v);
  }
  if (!ts || v1.length === 0) return null;
  return { ts, v1 };
}

/**
 * Manifesto oficial do Mercado Pago (webhooks com x-signature):
 *   id:{data.id};request-id:{x-request-id};ts:{ts};
 * Se data.id for alfanumérico, o id vai em minúsculas.
 */
export function buildManifest(
  dataId: string,
  requestId: string,
  ts: string,
): string {
  const id = /^[0-9]+$/.test(dataId) ? dataId : dataId.toLowerCase();
  return `id:${id};request-id:${requestId};ts:${ts};`;
}

export function computeSignatureHex(manifest: string, secret: string): string {
  return createHmac("sha256", secret).update(manifest).digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (ba.length === 0 || ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

export function verifyMercadoPagoSignature(opts: {
  xSignature: string | null | undefined;
  xRequestId: string | null | undefined;
  dataId: string;
  secret: string;
  /** 0 ou omitido desliga a checagem de idade do ts */
  maxAgeSec?: number;
  nowSec?: number;
}): SignatureResult {
  if (!opts.secret) return { ok: false, reason: "missing_secret" };
  if (!opts.xSignature) return { ok: false, reason: "missing_signature" };
  if (!opts.xRequestId) return { ok: false, reason: "missing_request_id" };
  if (!opts.dataId) return { ok: false, reason: "missing_data_id" };

  const parsed = parseSignatureHeader(opts.xSignature);
  if (!parsed) return { ok: false, reason: "malformed_signature" };

  const manifest = buildManifest(opts.dataId, opts.xRequestId, parsed.ts);
  const expected = computeSignatureHex(manifest, opts.secret);
  const match = parsed.v1.some((candidate) => safeEqualHex(candidate, expected));
  if (!match) return { ok: false, reason: "mismatch" };

  if (opts.maxAgeSec && opts.maxAgeSec > 0) {
    const ts = Number(parsed.ts);
    const now = opts.nowSec ?? Math.floor(Date.now() / 1000);
    if (!Number.isFinite(ts) || Math.abs(now - ts) > opts.maxAgeSec) {
      return { ok: false, reason: "expired_ts" };
    }
  }

  return { ok: true, ts: parsed.ts };
}
