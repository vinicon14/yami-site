import { describe, expect, it } from "vitest";
import { createMemoryStore } from "../lib/db/memory";
import { hashPassword, hashSecret } from "../lib/auth";
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
    const started = await startPairingByEmail(store, "u1", "PC de casa");
    expect(started.confirmToken).toMatch(/^[a-f0-9]{64}$/);
    expect(started.code).toBeUndefined();
  });

  it("confirma com token válido e devolve token de dispositivo", async () => {
    const store = createMemoryStore();
    await seed(store);
    const started = await startPairingByEmail(store, "u1", "PC de casa");
    const confirmed = await confirmPairingByEmail(store, started.confirmToken, "u1");
    expect(confirmed.deviceToken).toMatch(/^[a-f0-9]{64}$/);
    expect(await store.getDeviceByTokenHash(hashSecret(confirmed.deviceToken)).then((d) => d?.name)).toBe("PC de casa");
  });

  it("rejeita token usado duas vezes", async () => {
    const store = createMemoryStore();
    await seed(store);
    const started = await startPairingByEmail(store, "u1", "PC de casa");
    await confirmPairingByEmail(store, started.confirmToken, "u1");
    await expect(confirmPairingByEmail(store, started.confirmToken, "u1")).rejects.toThrow("token já usado");
  });
});
