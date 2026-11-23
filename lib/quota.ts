import { getSignupIpDailyMax, getUploadQuotaDailyBytes, getUploadQuotaDailyMax } from "./config";
import type { Store } from "./db/types";

export function utcDay(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** Consome 1 envio e `bytes` na cota diária do usuário. A store faz isso numa escrita só. */
export function takeUploadQuota(store: Store, userId: string, bytes: number, now = Date.now()) {
  return store.consumeUploadQuota({
    userId,
    day: utcDay(now),
    bytes,
    maxCount: getUploadQuotaDailyMax(),
    maxBytes: getUploadQuotaDailyBytes(),
  });
}

/** Consome 1 conta nova para este IP no dia UTC. */
export function takeSignupIpQuota(store: Store, ip: string, now = Date.now()) {
  return store.consumeSignupIpQuota({
    ip: ip.slice(0, 80),
    day: utcDay(now),
    maxCount: getSignupIpDailyMax(),
  });
}
