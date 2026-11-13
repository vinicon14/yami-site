/** Constantes e regras compartilhadas do relé Postgres. */
export const RELAY_ONLINE_MS = 30_000;
export const RELAY_MAX_WAIT_MS = 25_000;
export const RELAY_DEFAULT_WAIT_MS = 20_000;
export const RELAY_POLL_SLICE_MS = 1_000;
export const RELAY_PAYLOAD_MAX_BYTES = 64 * 1024;
export const RELAY_MESSAGE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const RELAY_HISTORY_LIMIT = 100;

export const LOCAL_APPROVAL_KINDS = new Set([
  "file",
  "command",
  "shell",
  "approval_request",
]);

export type RelayDirection = "up" | "down";

export function isDeviceOnline(
  lastSeenAt: string | null | undefined,
  now = Date.now(),
): boolean {
  if (!lastSeenAt) return false;
  const t = new Date(lastSeenAt).getTime();
  if (!Number.isFinite(t)) return false;
  return now - t >= 0 && now - t < RELAY_ONLINE_MS;
}

export function clampWaitMs(raw: unknown, fallback = 0): number {
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(RELAY_MAX_WAIT_MS, Math.floor(n));
}

export function payloadBytes(payload: unknown): number {
  return Buffer.byteLength(JSON.stringify(payload ?? null), "utf8");
}

export class PayloadTooLargeError extends Error {
  status = 413;
  constructor() {
    super("mensagem grande demais");
    this.name = "PayloadTooLargeError";
  }
}

export function assertPayloadSize(payload: unknown): void {
  if (payloadBytes(payload) > RELAY_PAYLOAD_MAX_BYTES) {
    throw new PayloadTooLargeError();
  }
}

export function needsLocalApproval(
  kind: string,
  payload: unknown,
  flag?: boolean,
): boolean {
  if (flag) return true;
  if (LOCAL_APPROVAL_KINDS.has(kind)) return true;
  if (typeof payload === "object" && payload !== null && "action" in payload) {
    return LOCAL_APPROVAL_KINDS.has(
      String((payload as { action?: string }).action),
    );
  }
  return false;
}

export function parseJsonField(raw: unknown): unknown {
  if (raw == null) return {};
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return {};
  }
}

export function ttlCutoff(now = new Date()): string {
  return new Date(now.getTime() - RELAY_MESSAGE_TTL_MS).toISOString();
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("aborted", "AbortError"));
      return;
    }
    const t = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new DOMException("aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; message?: string };
  return e.name === "AbortError" || e.message === "abort" || e.message === "aborted";
}
