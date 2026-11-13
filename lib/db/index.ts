import { getDatabaseUrl, getSqlitePath } from "../config";
import type { Store } from "./types";
import { getSqliteStore } from "./sqlite";

export type {
  Store,
  Order,
  License,
  DownloadTokenRow,
  User,
  Session,
  Device,
  PairingRow,
  AuditEntry,
} from "./types";

let cached: Promise<Store> | null = null;

export function getStore(): Promise<Store> {
  if (!cached) cached = openStore();
  return cached;
}

async function openStore(): Promise<Store> {
  const url = getDatabaseUrl();
  if (url) {
    const { getPostgresStore } = await import("./postgres");
    return getPostgresStore(url);
  }
  // No Vercel, o sistema de arquivos é efêmero; sem DATABASE_URL
  // usamos memória e avisamos. Páginas de marketing funcionam;
  // pedidos não sobrevivem a um cold start — configure um Postgres
  // antes de deixar a venda no ar de verdade.
  if (process.env.VERCEL) {
    const { createMemoryStore } = await import("./memory");
    console.warn("yami_store_memory_fallback");
    return createMemoryStore();
  }
  return getSqliteStore(getSqlitePath());
}

/** Só para testes: descarta o cache do singleton. */
export function resetStoreCache(): void {
  cached = null;
}

/** Só para testes: injeta uma Store (em geral, a de memória). */
export function setStoreForTests(store: Store): void {
  cached = Promise.resolve(store);
}
