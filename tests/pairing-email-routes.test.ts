import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMemoryStore } from "../lib/db/memory";
import { createSessionForUser, hashPassword } from "../lib/auth";
import { resetStoreCache, setStoreForTests } from "../lib/db";
import { startPairingByEmail } from "../lib/pairing";
import { sendPairingEmail } from "../lib/email";
import { GET as confirmGet, POST as confirmPost } from "../app/api/pairing/confirm/route";

async function seed() {
  const store = createMemoryStore();
  setStoreForTests(store);
  const user = await store.createUser({ id: "u1", email: "u@example.com", passwordHash: await hashPassword("senha-forte-123") });
  await store.createOrder({ id: "o1", email: "u@example.com", amountBrl: 20 });
  await store.createLicense("o1", "YAMI-DEMO-KEY");
  const { raw } = await createSessionForUser(user);
  return { store, cookie: `yami_session=${raw}` };
}

function req(url: string, init?: RequestInit) {
  return new Request(`http://localhost:3000${url}`, init);
}

describe("pareamento por e-mail", () => {
  beforeEach(() => {
    delete process.env.VERCEL;
  });
  afterEach(() => resetStoreCache());

  it("confirma pelo link com token válido", async () => {
    const { store, cookie } = await seed();
    const started = await startPairingByEmail(store, "u@example.com", "PC de casa");
    const confirm = await confirmGet(req(`/api/pairing/confirm?token=${started.confirmToken}`, { headers: { cookie } }));
    expect(confirm.status).toBe(200);
    const getBody = await confirm.json();
    expect(getBody.ok).toBe(true);
    expect(getBody.pending).toBe(true);

    const post = await confirmPost(req("/api/pairing/confirm", { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ token: started.confirmToken }) }));
    expect(post.status).toBe(200);
    const postBody = await post.json();
    expect(postBody.device.name).toBe("PC de casa");
  });

  it("rejeita token inválido", async () => {
    const { cookie } = await seed();
    const confirm = await confirmGet(req("/api/pairing/confirm?token=token-invalido", { headers: { cookie } }));
    expect(confirm.status).toBe(400);
  });

  it("não envia e-mail quando o Resend não está configurado", async () => {
    await seed();
    expect(await sendPairingEmail("u@example.com", "abc")).toEqual({ sent: false, reason: "disabled" });
  });
});
