import { describe, expect, it, vi } from "vitest";
import { createMemoryStore } from "../lib/db/memory";
import { hashPassword } from "../lib/auth";
import { hashSecret } from "../lib/auth";
import { startPairingByEmail, confirmPairingByEmail } from "../lib/pairing";

async function seed(store) {
  await store.createUser({ id: "u1", email: "u@example.com", passwordHash: await hashPassword("senha-forte-123") });
  await store.createOrder({ id: "o1", email: "u@example.com", amountBrl: 20 });
  await store.createLicense("o1", "YAMI-DEMO-KEY");
}

describe("pareamento por e-mail", () => {
  it("devolve token de confirmação em claro (apenas uma vez)", async () => {
    const store = createMemoryStore();
    await seed(store);
    const started = await startPairingByEmail(store, "u@example.com", "PC de casa");
    expect(started.confirmToken).toMatch(/^[a-f0-9]{64}$/);
    expect(started.code).toBeUndefined();
  });

  it("confirma com token válido e devolve token de dispositivo", async () => {
    const store = createMemoryStore();
    await seed(store);
    const started = await startPairingByEmail(store, "u@example.com", "PC de casa");
    const confirmed = await confirmPairingByEmail(store, started.confirmToken, "u1");
    expect(confirmed.deviceToken).toMatch(/^[a-f0-9]{64}$/);
    expect(await store.getDeviceByTokenHash(hashSecret(confirmed.deviceToken)).then((d) => d?.name)).toBe("PC de casa");
  });

  it("rejeita token expirado depois de 10 minutos", async () => {
    vi.useFakeTimers();
    try {
      const store = createMemoryStore();
      await seed(store);
      const started = await startPairingByEmail(store, "u@example.com", "PC de casa");
      vi.setSystemTime(Date.now() + 11 * 60 * 1000);
      await expect(confirmPairingByEmail(store, started.confirmToken, "u1")).rejects.toThrow("token expirado");
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejeita token usado duas vezes", async () => {
    const store = createMemoryStore();
    await seed(store);
    const started = await startPairingByEmail(store, "u@example.com", "PC de casa");
    await confirmPairingByEmail(store, started.confirmToken, "u1");
    await expect(confirmPairingByEmail(store, started.confirmToken, "u1")).rejects.toThrow("token já usado");
  });

  it("grava o token de dispositivo como pendente para o polling entregar", async () => {
    const store = createMemoryStore();
    await seed(store);
    const started = await startPairingByEmail(store, "u@example.com", "PC de casa");
    const confirmed = await confirmPairingByEmail(store, started.confirmToken, "u1");
    const row = await store.getPairingByConfirmHash(hashSecret(started.confirmToken));
    expect(row?.pendingDeviceToken).toBe(confirmed.deviceToken);
  });

  it("exige licença paga na confirmação", async () => {
    const store = createMemoryStore();
    await seed(store);
    await store.createUser({ id: "u2", email: "semlicenca@example.com", passwordHash: await hashPassword("senha-forte-123") });
    const confirmToken = "a".repeat(64);
    await store.createPairing({
      id: "p2",
      codeHash: hashSecret("code-p2"),
      pollTokenHash: hashSecret("poll-p2"),
      userId: "u2",
      deviceId: null,
      deviceName: "PC de casa",
      pendingDeviceToken: null,
      confirmTokenHash: hashSecret(confirmToken),
      emailSentAt: null,
      confirmedAt: null,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      consumedAt: null,
      createdAt: new Date().toISOString(),
    });
    await expect(confirmPairingByEmail(store, confirmToken, "u2")).rejects.toThrow("licença necessária");
  });
});
