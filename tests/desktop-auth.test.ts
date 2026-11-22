import { describe, expect, it } from "vitest";
import { createMemoryStore } from "../lib/db/memory";
import { hashPassword } from "../lib/auth";
import { desktopLogin, getDesktopSession, revokeDesktopDevice } from "../lib/desktop-auth";

async function seed() {
  const store = createMemoryStore();
  await store.createUser({
    id: "u1",
    email: "user@example.com",
    passwordHash: await hashPassword("senha-forte-123"),
  });
  return store;
}

describe("desktop-auth", () => {
  it("troca senha por token e devolve sessão com licença", async () => {
    const store = await seed();
    const login = await desktopLogin(store, "user@example.com", "senha-forte-123", "YAMI OS 0.8.0");
    expect(login.deviceToken).toMatch(/^[a-f0-9]{64}$/);
    const session = await getDesktopSession(store, login.deviceToken);
    expect(session?.user.email).toBe("user@example.com");
    expect(session?.hasLicense).toBe(false);
  });

  it("rejeita senha errada e token revogado", async () => {
    const store = await seed();
    await expect(desktopLogin(store, "user@example.com", "errada", "PC")).rejects.toThrow("invalid_credentials");
    const login = await desktopLogin(store, "user@example.com", "senha-forte-123", "PC");
    await revokeDesktopDevice(store, login.device.id);
    expect(await getDesktopSession(store, login.deviceToken)).toBeNull();
  });

  it("limita a cinco dispositivos ativos", async () => {
    const store = await seed();
    for (let i = 0; i < 6; i++) {
      await desktopLogin(store, "user@example.com", "senha-forte-123", `PC ${i}`);
    }
    const devices = await store.listDevices("u1");
    expect(devices.filter((d) => !d.revokedAt).length).toBe(5);
  });
});
