import { getRelayProvider } from "../config";
import { createMemoryRelay } from "./memory";
import type { RelayAdapter } from "./types";

export type { RelayAdapter, RelayMessage, RelayKind, DesktopStatus } from "./types";

let cached: RelayAdapter | null = null;

export function getRelay(): RelayAdapter {
  if (cached) return cached;
  const provider = getRelayProvider();
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
