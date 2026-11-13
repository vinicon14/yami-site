type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** Limitador em memória, por processo. Suficiente para um único servidor; no serverless é por instância. */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): { ok: true } | { ok: false; retryAfterSec: number } {
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }
  if (current.count >= limit) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
  }
  current.count += 1;
  return { ok: true };
}

/** Só para testes. */
export function resetRateLimits(): void {
  buckets.clear();
}
