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

  // Vercel tem filesystem efêmero e memória por instância. Não permitir
  // fallback silencioso: isso fazia contas sumirem após cold starts.
  if (process.env.VERCEL) {
    throw new Error(
      "DATABASE_URL ausente: configure o PostgreSQL exclusivo do YAMI nas variáveis da Vercel.",
    );
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
