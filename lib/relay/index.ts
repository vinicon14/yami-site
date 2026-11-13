import { getDatabaseUrl, getRelayProvider } from "../config";
import { createMemoryRelay } from "./memory";
import { createPostgresRelay } from "./postgres";
import type { RelayAdapter } from "./types";

export type {
  RelayAdapter,
  RelayMessage,
  RelayKind,
  RelayPushInput,
  DesktopStatus,
  PullOptions,
  PullResult,
} from "./types";
export {
  RELAY_ONLINE_MS,
  RELAY_MAX_WAIT_MS,
  RELAY_DEFAULT_WAIT_MS,
  RELAY_PAYLOAD_MAX_BYTES,
  RELAY_MESSAGE_TTL_MS,
  RELAY_HISTORY_LIMIT,
  isDeviceOnline,
  needsLocalApproval,
  assertPayloadSize,
  PayloadTooLargeError,
  clampWaitMs,
} from "./protocol";

let cached: RelayAdapter | null = null;

export function getRelay(): RelayAdapter {
  if (cached) return cached;
  const provider = getRelayProvider();
  if (provider === "postgres") {
    if (!getDatabaseUrl()) {
      throw new Error("RELAY_PROVIDER=postgres exige DATABASE_URL");
    }
    cached = createPostgresRelay();
    return cached;
  }
  if (provider !== "memory") {
    console.warn("yami_relay_fallback_memory", provider);
  }
  cached = createMemoryRelay();
  return cached;
}

/** Só para testes. */
export function resetRelay(): void {
  cached = null;
}

/** Só para testes: injeta um adaptador. */
export function setRelayForTests(relay: RelayAdapter): void {
  cached = relay;
}

/** O painel remoto está pronto para uso nesta implantação. */
export function isRelayReady(): boolean {
  const provider = getRelayProvider();
  if (provider === "postgres") return Boolean(getDatabaseUrl());
  if (provider === "ably" || provider === "pusher") return false;
  // memória só funciona neste processo (dev local, não na Vercel)
  return !process.env.VERCEL;
}
