import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  hashPassword,
  verifyPassword,
  passwordIssues,
  hashSecret,
  generateToken,
  getSessionUser,
  createSessionForUser,
} from "../lib/auth";
import { createMemoryStore } from "../lib/db/memory";
import { resetStoreCache, setStoreForTests } from "../lib/db";
import {
  confirmPairing,
  generatePairingCode,
  isPairingExpired,
  pairingExpiry,
  pollPairing,
  startPairing,
  deviceFromToken,
  PAIRING_TTL_MS,
} from "../lib/pairing";
import { checkDownloadToken, tokenExpiry } from "../lib/download-token";
import { resetRateLimits, rateLimit } from "../lib/rate-limit";

describe("senha e sessão", () => {
  beforeEach(() => {
    delete process.env.VERCEL;
    // NODE_ENV já é test no vitest
    setStoreForTests(createMemoryStore());
  });
  afterEach(() => resetStoreCache());

  it("hash é verificável e distinto por senha", async () => {
    const hash = await hashPassword("segredo-forte");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("segredo-forte", hash)).toBe(true);
    expect(await verifyPassword("outra", hash)).toBe(false);
    expect(await verifyPassword("segredo-forte", "lixo")).toBe(false);
  });

  it("rejeita senha curta", () => {
    expect(passwordIssues("1234567")).toBeTruthy();
    expect(passwordIssues("12345678")).toBeNull();
  });

  it("sessão válida devolve o usuário; token errado ou expirado, não", async () => {
    const store = createMemoryStore();
    setStoreForTests(store);
    const user = await store.createUser({
      id: crypto.randomUUID(),
      email: "a@example.com",
      passwordHash: await hashPassword("12345678"),
    });
    const { raw } = await createSessionForUser(user);
    const found = await getSessionUser(raw);
    expect(found?.user.email).toBe("a@example.com");
    expect(await getSessionUser("token-invalido")).toBeNull();
    expect(await getSessionUser(undefined)).toBeNull();
  });
});

describe("pareamento", () => {
  beforeEach(() => {
    delete process.env.VERCEL;
    // NODE_ENV já é test no vitest
    setStoreForTests(createMemoryStore());
  });
  afterEach(() => resetStoreCache());

  it("gera código de 6 caracteres do alfabeto sem ambíguos", () => {
    for (let i = 0; i < 20; i++) {
      const code = generatePairingCode();
      expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
    }
  });

  it("fluxo completo: start, confirm, poll entrega o token uma vez", async () => {
    const store = createMemoryStore();
    setStoreForTests(store);
    const user = await store.createUser({
      id: crypto.randomUUID(),
      email: "dona@example.com",
      passwordHash: "x",
    });
    const started = await startPairing();
    expect(started.code).toHaveLength(6);

    const pending = await pollPairing(started.pollToken);
    expect(pending.status).toBe("pending");

    const device = await confirmPairing(started.code, user, "Escritório");
    expect(device.name).toBe("Escritório");
    expect(device.userId).toBe(user.id);

    const ready = await pollPairing(started.pollToken);
    expect(ready.status).toBe("ready");
    if (ready.status !== "ready") throw new Error("expected ready");
    expect(ready.deviceToken).toMatch(/^[a-f0-9]{64}$/);
    expect(ready.deviceId).toBe(device.id);

    const again = await pollPairing(started.pollToken);
    expect(again.status).toBe("consumed");

    const fromToken = await deviceFromToken(ready.deviceToken);
    expect(fromToken?.id).toBe(device.id);

    await store.revokeDevice(device.id, user.id);
    expect(await deviceFromToken(ready.deviceToken)).toBeNull();
  });

  it("rejeita código inválido, expirado ou já usado", async () => {
    const store = createMemoryStore();
    setStoreForTests(store);
    const user = await store.createUser({
      id: crypto.randomUUID(),
      email: "b@example.com",
      passwordHash: "x",
    });
    await expect(confirmPairing("ABCDEF", user, "PC")).rejects.toThrow(/inválido/);

    const started = await startPairing();
    await confirmPairing(started.code, user, "PC");
    await expect(confirmPairing(started.code, user, "PC")).rejects.toThrow(/usado/);
  });

  it("expira depois do prazo", () => {
    const expired = { expiresAt: new Date(Date.now() - 1000).toISOString() } as { expiresAt: string };
    expect(isPairingExpired(expired as never)).toBe(true);
    const future = { expiresAt: pairingExpiry() } as { expiresAt: string };
    expect(isPairingExpired(future as never)).toBe(false);
    expect(new Date(pairingExpiry()).getTime()).toBeGreaterThan(Date.now() + PAIRING_TTL_MS - 1000);
  });
});

describe("token de download (expiração)", () => {
  it("expira no instante limite e respeita o limite de usos", () => {
    const now = new Date("2026-11-12T22:00:00-03:00");
    expect(
      checkDownloadToken(
        { expiresAt: new Date("2026-11-12T21:59:59-03:00"), downloadsUsed: 0, maxDownloads: 5 },
        now,
      ),
    ).toEqual({ ok: false, reason: "expired" });
    expect(
      checkDownloadToken(
        { expiresAt: new Date("2026-11-13T22:00:00-03:00"), downloadsUsed: 5, maxDownloads: 5 },
        now,
      ),
    ).toEqual({ ok: false, reason: "limit" });
    const expires = tokenExpiry(24, now);
    expect(expires.getTime() - now.getTime()).toBe(24 * 60 * 60 * 1000);
  });
});

describe("rate limit", () => {
  afterEach(() => resetRateLimits());
  it("bloqueia depois do limite e libera após a janela", () => {
    const t0 = 1_000_000;
    expect(rateLimit("k", 2, 1000, t0).ok).toBe(true);
    expect(rateLimit("k", 2, 1000, t0 + 10).ok).toBe(true);
    const blocked = rateLimit("k", 2, 1000, t0 + 20);
    expect(blocked.ok).toBe(false);
    expect(rateLimit("k", 2, 1000, t0 + 1001).ok).toBe(true);
  });
});

describe("hashSecret é estável", () => {
  it("mesmo valor e segredo produzem o mesmo hash", () => {
    process.env.SESSION_SECRET = "abc";
    const a = hashSecret("token", "abc");
    const b = hashSecret("token", "abc");
    expect(a).toBe(b);
    expect(a).not.toBe(hashSecret("token", "outro"));
    expect(generateToken(8)).toHaveLength(16);
  });
});
