import { afterEach, describe, expect, it } from "vitest";
import { createMemoryRelay } from "../lib/relay/memory";
import {
  RELAY_ONLINE_MS,
  RELAY_PAYLOAD_MAX_BYTES,
  assertPayloadSize,
  clampWaitMs,
  isDeviceOnline,
  needsLocalApproval,
  PayloadTooLargeError,
  ttlCutoff,
} from "../lib/relay/protocol";
import { isRelayReady, resetRelay, getRelay } from "../lib/relay";
import { getRelayProvider } from "../lib/config";
import {
  YamiDesktopClient,
  mapRelayToIpc,
  needsLocalApproval as clientNeedsApproval,
} from "../desktop-client/index";
import type { RelayMessage } from "../desktop-client/types";

describe("protocolo do relé", () => {
  it("considera ligado só com last_seen há menos de 30 s", () => {
    const now = Date.parse("2026-11-13T03:00:00.000Z");
    expect(isDeviceOnline(new Date(now - 29_000).toISOString(), now)).toBe(true);
    expect(isDeviceOnline(new Date(now - 30_000).toISOString(), now)).toBe(false);
    expect(isDeviceOnline(new Date(now - 31_000).toISOString(), now)).toBe(false);
    expect(isDeviceOnline(null, now)).toBe(false);
    expect(isDeviceOnline(undefined, now)).toBe(false);
  });

  it("marca arquivo e comando como aprovação local", () => {
    expect(needsLocalApproval("chat", { text: "oi" })).toBe(false);
    expect(needsLocalApproval("chat", { text: "apagar", action: "command" })).toBe(true);
    expect(needsLocalApproval("file", { path: "x" })).toBe(true);
    expect(needsLocalApproval("chat", { text: "x" }, true)).toBe(true);
    expect(needsLocalApproval("approval_request", {})).toBe(true);
  });

  it("rejeita payload acima de 64 KiB", () => {
    expect(() => assertPayloadSize({ text: "ok" })).not.toThrow();
    const big = "x".repeat(RELAY_PAYLOAD_MAX_BYTES);
    expect(() => assertPayloadSize({ text: big })).toThrow(PayloadTooLargeError);
  });

  it("limita waitMs a 25 s", () => {
    expect(clampWaitMs(0)).toBe(0);
    expect(clampWaitMs("2000")).toBe(2000);
    expect(clampWaitMs(90_000)).toBe(25_000);
    expect(clampWaitMs(undefined, 1000)).toBe(1000);
  });

  it("ttlCutoff é 7 dias atrás", () => {
    const now = new Date("2026-11-13T00:00:00.000Z");
    const cut = ttlCutoff(now);
    expect(new Date(cut).toISOString()).toBe("2026-11-06T00:00:00.000Z");
  });
});

describe("relé em memória", () => {
  it("entrega mensagem nos dois sentidos com seq crescente", async () => {
    const relay = createMemoryRelay();
    const down = await relay.pushToDevice("dev1", {
      kind: "chat",
      payload: { text: "oi do painel" },
      from: "browser",
    });
    expect(down.seq).toBe(1);
    expect(down.direction).toBe("down");
    const pulled = await relay.pullForDevice("dev1", { afterSeq: 0 });
    expect(pulled.messages).toHaveLength(1);
    expect(pulled.messages[0]?.payload).toEqual({ text: "oi do painel" });
    expect(pulled.lastSeq).toBe(1);

    const up = await relay.pushToPainel("dev1", {
      kind: "chat",
      payload: { text: "oi do pc" },
      from: "desktop",
    });
    expect(up.seq).toBe(2);
    const painel = await relay.pullForPainel("dev1", { afterSeq: 1 });
    expect(painel.messages).toHaveLength(1);
    expect(painel.messages[0]?.from).toBe("desktop");
    expect(painel.lastSeq).toBe(2);
  });

  it("histórico devolve os dois sentidos e afterSeq ignora o que já veio", async () => {
    const relay = createMemoryRelay();
    await relay.pushToDevice("dev1", { kind: "chat", payload: { text: "a" }, from: "browser" });
    await relay.pushToPainel("dev1", { kind: "chat", payload: { text: "b" }, from: "desktop" });
    const hist = await relay.pullForPainel("dev1", { history: true });
    expect(hist.messages.map((m) => (m.payload as { text: string }).text)).toEqual(["a", "b"]);
    const next = await relay.pullForPainel("dev1", { afterSeq: hist.lastSeq });
    expect(next.messages).toHaveLength(0);
  });

  it("long-poll acorda quando chega mensagem", async () => {
    const relay = createMemoryRelay();
    const started = Date.now();
    const pending = relay.pullForDevice("dev1", { afterSeq: 0, waitMs: 5000 });
    await new Promise((r) => setTimeout(r, 80));
    await relay.pushToDevice("dev1", {
      kind: "chat",
      payload: { text: "tarde" },
      from: "browser",
    });
    const result = await pending;
    expect(result.messages).toHaveLength(1);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("marca online só com last_seen recente", async () => {
    const relay = createMemoryRelay();
    expect(await relay.isDesktopOnline("dev1")).toBe(false);
    await relay.pullForDevice("dev1", { waitMs: 0 });
    expect(await relay.isDesktopOnline("dev1")).toBe(true);
    const status = await relay.getStatus("dev1");
    expect(status.online).toBe(true);
    expect(status.lastSeenAt).toBeTruthy();
    expect(RELAY_ONLINE_MS).toBe(30_000);
  });

  it("purge remove mensagens antigas", async () => {
    const relay = createMemoryRelay();
    await relay.pushToDevice("dev1", { kind: "chat", payload: { text: "x" }, from: "browser" });
    expect(await relay.purgeExpired(new Date(Date.now() - 8 * 24 * 60 * 60 * 1000))).toBe(0);
    expect(await relay.purgeExpired(new Date(Date.now() + 8 * 24 * 60 * 60 * 1000))).toBe(1);
    const left = await relay.pullForDevice("dev1", { afterSeq: 0, history: true });
    expect(left.messages).toHaveLength(0);
  });

  it("o aparelho só recebe direção down", async () => {
    const relay = createMemoryRelay();
    await relay.pushToPainel("dev1", { kind: "chat", payload: { text: "up" }, from: "desktop" });
    await relay.pushToDevice("dev1", { kind: "chat", payload: { text: "down" }, from: "browser" });
    const got = await relay.pullForDevice("dev1", { afterSeq: 0 });
    expect(got.messages).toHaveLength(1);
    expect((got.messages[0]?.payload as { text: string }).text).toBe("down");
  });
});

describe("RELAY_PROVIDER", () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env.RELAY_PROVIDER = prev.RELAY_PROVIDER;
    process.env.DATABASE_URL = prev.DATABASE_URL;
    process.env.VERCEL = prev.VERCEL;
    if (!prev.RELAY_PROVIDER) delete process.env.RELAY_PROVIDER;
    if (!prev.DATABASE_URL) delete process.env.DATABASE_URL;
    if (!prev.VERCEL) delete process.env.VERCEL;
    resetRelay();
  });

  it("reconhece postgres e exige DATABASE_URL para ficar pronto", () => {
    process.env.RELAY_PROVIDER = "postgres";
    process.env.DATABASE_URL = "postgres://local/neondb";
    delete process.env.VERCEL;
    expect(getRelayProvider()).toBe("postgres");
    expect(isRelayReady()).toBe(true);
    delete process.env.DATABASE_URL;
    expect(isRelayReady()).toBe(false);
  });

  it("memória não fica pronta na Vercel", () => {
    process.env.RELAY_PROVIDER = "memory";
    process.env.VERCEL = "1";
    expect(isRelayReady()).toBe(false);
    delete process.env.VERCEL;
    expect(isRelayReady()).toBe(true);
    expect(getRelay()).toBeTruthy();
  });
});

function sampleMessage(over: Partial<RelayMessage> = {}): RelayMessage {
  return {
    id: "m1",
    seq: 1,
    deviceId: "d1",
    direction: "down",
    kind: "chat",
    payload: { text: "oi" },
    from: "browser",
    createdAt: new Date().toISOString(),
    ...over,
  };
}

describe("YamiDesktopClient", () => {
  it("chama as rotas canônicas com Bearer e afterSeq", async () => {
    const calls: Array<{ url: string; method: string; auth?: string | null; body?: string }> = [];
    const fetchFn: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      const headers = new Headers(init?.headers);
      calls.push({
        url,
        method,
        auth: headers.get("authorization"),
        body: typeof init?.body === "string" ? init.body : undefined,
      });
      if (url.includes("/api/pairing/start")) {
        return new Response(
          JSON.stringify({ code: "AB3K7P", pollToken: "p".repeat(32), expiresAt: "t" }),
          { status: 200 },
        );
      }
      if (url.includes("/api/relay/device/pull")) {
        return new Response(
          JSON.stringify({ ok: true, deviceId: "d1", messages: [], lastSeq: 4 }),
          { status: 200 },
        );
      }
      if (url.includes("/api/relay/device/push")) {
        return new Response(
          JSON.stringify({
            ok: true,
            message: sampleMessage({ seq: 5, direction: "up", from: "desktop" }),
          }),
          { status: 200 },
        );
      }
      return new Response("no", { status: 404 });
    };
    const client = new YamiDesktopClient({
      baseUrl: "https://yami-site-pi.vercel.app",
      fetchFn,
      waitMs: 15000,
    });
    await client.startPairing();
    await client.pull("tokensecret", { afterSeq: 3, waitMs: 15000 });
    await client.push("tokensecret", { kind: "chat", payload: { text: "pong" } });
    expect(calls[0]?.url).toBe("https://yami-site-pi.vercel.app/api/pairing/start");
    expect(calls[1]?.url).toContain("/api/relay/device/pull");
    expect(calls[1]?.url).toContain("afterSeq=3");
    expect(calls[1]?.url).toContain("waitMs=15000");
    expect(calls[1]?.auth).toBe("Bearer tokensecret");
    expect(calls[2]?.url).toBe("https://yami-site-pi.vercel.app/api/relay/device/push");
    expect(calls[2]?.auth).toBe("Bearer tokensecret");
    expect(calls[2]?.body).toContain("pong");
  });

  it("mapeia mensagens para os canais de IPC e exige aprovação local", () => {
    expect(mapRelayToIpc(sampleMessage()).channel).toBe("yami:chat:inbound");
    expect(mapRelayToIpc(sampleMessage({ kind: "forage" })).channel).toBe("yami:forage:inbound");
    expect(
      mapRelayToIpc(sampleMessage({ kind: "chat", needsLocalApproval: true })).channel,
    ).toBe("yami:approval:needed");
    expect(clientNeedsApproval(sampleMessage({ kind: "command" as never }))).toBe(true);
  });

  it("401 no pull é tratado como desconectado", async () => {
    const fetchFn: typeof fetch = async () => new Response(JSON.stringify({ error: "no" }), { status: 401 });
    const client = new YamiDesktopClient({ baseUrl: "https://example.com", fetchFn });
    await expect(client.pull("x")).rejects.toThrow(/desconectado/);
  });
});

