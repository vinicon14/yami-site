#!/usr/bin/env node
/**
 * Simula um aplicativo de desktop contra a produção (SEM pagamento real):
 * cria conta licenciada de teste, pareia, mede ida e volta no relé,
 * confirma que a revogação devolve 401, e apaga os dados.
 *
 *   DATABASE_URL=... SITE_URL=https://yami-site-pi.vercel.app \
 *     node scripts/fake-device.mjs
 *
 * Nunca imprime tokens, cookies, senhas ou a URL do banco.
 */
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

const SITE = (process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL ausente");
  process.exit(2);
}
if (!SITE) {
  console.error("SITE_URL ausente");
  process.exit(2);
}

function redact(s) {
  return String(s)
    .replace(/postgres(ql)?:\/\/[^\s'"]+/g, "postgres://<redacted>")
    .replace(/yami_session=[^;\s]+/gi, "yami_session=<redacted>")
    .replace(/Bearer\s+[A-Za-z0-9+/=._-]+/gi, "Bearer <redacted>")
    .replace(/ep-[a-z0-9-]+\.[a-z0-9.-]+/gi, "<neon-host>");
}

function tag() {
  return randomBytes(6).toString("hex");
}

function parseCookie(res) {
  const raw = res.headers.getSetCookie?.() ?? [];
  const all = raw.length ? raw : [res.headers.get("set-cookie") || ""];
  for (const c of all) {
    const m = /(?:^|, )yami_session=([^;]+)/.exec(c);
    if (m) return m[1];
  }
  return null;
}

async function openSql() {
  const url = process.env.DATABASE_URL;
  try {
    const { neon } = await import("@neondatabase/serverless");
    const raw = neon(url);
    const sql = (strings, ...values) => raw(strings, ...values);
    sql.unsafe = async (query) => {
      const parts = String(query)
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s && !s.startsWith("--") && !s.toUpperCase().startsWith("DO $$"));
      let last = [];
      for (const part of parts) {
        last = await raw.query(part, []);
      }
      return last;
    };
    sql.end = async () => {};
    return { sql, kind: "neon-http" };
  } catch {
    const postgres = (await import("postgres")).default;
    const sql = postgres(url, {
      ssl: url.includes("localhost") ? false : "require",
      max: 1,
      connect_timeout: 15,
      prepare: false,
    });
    return { sql, kind: "postgres-tcp" };
  }
}

const headersJson = () => ({
  "content-type": "application/json",
  origin: SITE,
  referer: `${SITE}/painel`,
});

const report = [];
let failed = false;
const pass = (msg) => report.push(msg);
const fail = (msg) => {
  failed = true;
  report.push(`FAIL: ${msg}`);
};

async function main() {
  const { sql, kind } = await openSql();
  pass(`db driver: ${kind}`);
  const ids = {
    userId: null,
    orderId: `test-relay-ord-${tag()}`,
    licenseId: `test-relay-lic-${tag()}`,
    deviceId: null,
  };
  const email = `e2e-relay-${tag()}@yami.test`;
  const password = randomBytes(12).toString("base64url") + "Aa1";
  let cookie = null;
  let deviceToken = null;

  async function cleanup() {
    try {
      if (ids.deviceId) {
        await sql`DELETE FROM remote_messages WHERE device_id = ${ids.deviceId}`;
        await sql`DELETE FROM remote_seq WHERE device_id = ${ids.deviceId}`;
      }
      await sql`DELETE FROM remote_messages WHERE device_id IN (SELECT id FROM devices WHERE user_id IN (SELECT id FROM users WHERE email LIKE ${"%@yami.test"}))`;
      if (ids.userId) {
        await sql`DELETE FROM audit_log WHERE user_id = ${ids.userId}`;
        await sql`DELETE FROM sessions WHERE user_id = ${ids.userId}`;
        await sql`DELETE FROM pairings WHERE user_id = ${ids.userId}`;
        await sql`DELETE FROM devices WHERE user_id = ${ids.userId}`;
      }
      await sql`DELETE FROM download_tokens WHERE order_id = ${ids.orderId}`;
      await sql`DELETE FROM licenses WHERE id = ${ids.licenseId} OR order_id = ${ids.orderId}`;
      await sql`DELETE FROM orders WHERE id = ${ids.orderId}`;
      if (ids.userId) {
        await sql`DELETE FROM users WHERE id = ${ids.userId}`;
      }
      const leftoverU = await sql`SELECT id FROM users WHERE email = ${email}`;
      const leftoverO = await sql`SELECT id FROM orders WHERE id = ${ids.orderId}`;
      pass(
        `cleanup: leftover_user=${leftoverU.length} leftover_order=${leftoverO.length} ${leftoverU.length === 0 && leftoverO.length === 0 ? "PASS" : "FAIL"}`,
      );
      if (leftoverU.length || leftoverO.length) failed = true;
    } catch (err) {
      fail(`cleanup_error: ${redact(err instanceof Error ? err.message : err)}`);
    }
    await sql.end?.({ timeout: 5 });
  }

  try {
    // Garante as tabelas do relé (IF NOT EXISTS). O ensureSchema da produção
    // também corre no primeiro getStore depois do deploy.
    try {
      const schema = readFileSync(new URL("../lib/db/schema.sql", import.meta.url), "utf8");
      await sql.unsafe(schema);
      pass("schema apply: PASS");
    } catch (err) {
      pass(`schema apply skipped/warn: ${redact(err instanceof Error ? err.message : err)}`);
    }

    const tables = await sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('remote_messages', 'remote_seq')
      ORDER BY table_name
    `;
    const names = tables.map((r) => r.table_name);
    const schemaOk = names.includes("remote_messages") && names.includes("remote_seq");
    pass(`schema tables: ${names.join(",") || "(none)"} ${schemaOk ? "PASS" : "FAIL"}`);
    if (!schemaOk) fail("tabelas do relé ausentes");

    // 1. registra conta de teste
    const reg = await fetch(`${SITE}/api/auth/register`, {
      method: "POST",
      headers: headersJson(),
      body: JSON.stringify({ email, password, name: "E2E Relé" }),
    });
    const regJson = await reg.json().catch(() => ({}));
    cookie = parseCookie(reg);
    const regOk = reg.status === 200 && regJson.ok === true && !!cookie;
    pass(`register: http=${reg.status} cookie=${!!cookie} ${regOk ? "PASS" : "FAIL"}`);
    if (!regOk) {
      fail(`register error=${redact(regJson.error || "unknown")}`);
      return;
    }
    ids.userId = regJson.user.id;

    // 2. licença simulada (sem pagamento MP)
    const now = new Date().toISOString();
    await sql`
      INSERT INTO orders (id, email, name, amount_brl, currency, status, mp_payment_id, created_at, paid_at)
      VALUES (${ids.orderId}, ${email}, ${"E2E Relé"}, ${20}, ${"BRL"}, ${"paid"}, ${"test-pay-"+ids.orderId}, ${now}, ${now})
    `;
    await sql`
      INSERT INTO licenses (id, order_id, key, created_at)
      VALUES (${ids.licenseId}, ${ids.orderId}, ${"YAMI-E2E-RELAY-"+tag().toUpperCase()}, ${now})
    `;
    const me = await fetch(`${SITE}/api/auth/me`, {
      headers: { cookie: `yami_session=${cookie}`, origin: SITE },
    });
    const meJson = await me.json().catch(() => ({}));
    const licensed = me.status === 200 && meJson.hasLicense === true;
    pass(`licensed account: http=${me.status} hasLicense=${meJson.hasLicense} ${licensed ? "PASS" : "FAIL"}`);
    if (!licensed) fail("conta de teste não aparece licenciada em /api/auth/me");

    // 3. pareamento: start (app) → confirm (painel) → poll (app)
    const started = await fetch(`${SITE}/api/pairing/start`, { method: "POST" });
    const startJson = await started.json().catch(() => ({}));
    const startOk = started.status === 200 && startJson.code && startJson.pollToken;
    pass(`pairing start: http=${started.status} code_len=${(startJson.code || "").length} ${startOk ? "PASS" : "FAIL"}`);
    if (!startOk) {
      fail("não iniciou pareamento");
      return;
    }

    const confirm = await fetch(`${SITE}/api/pairing/confirm`, {
      method: "POST",
      headers: { ...headersJson(), cookie: `yami_session=${cookie}` },
      body: JSON.stringify({ code: startJson.code, deviceName: "Fake Device E2E" }),
    });
    const confirmJson = await confirm.json().catch(() => ({}));
    const confirmOk = confirm.status === 200 && confirmJson.ok === true;
    pass(`pairing confirm: http=${confirm.status} ${confirmOk ? "PASS" : "FAIL"}`);
    if (!confirmOk) fail(`confirm error=${redact(confirmJson.error || "")}`);

    const poll = await fetch(
      `${SITE}/api/pairing/poll?pollToken=${encodeURIComponent(startJson.pollToken)}`,
    );
    const pollJson = await poll.json().catch(() => ({}));
    const pollOk = poll.status === 200 && pollJson.status === "ready" && pollJson.deviceToken;
    pass(`pairing poll: http=${poll.status} status=${pollJson.status} token=${!!pollJson.deviceToken} ${pollOk ? "PASS" : "FAIL"}`);
    if (!pollOk) {
      fail("poll não entregou deviceToken");
      return;
    }
    deviceToken = pollJson.deviceToken;
    ids.deviceId = pollJson.deviceId;

    const auth = { Authorization: `Bearer ${deviceToken}` };

    // 4. pull inicial (marca last_seen — online)
    const firstPull = await fetch(`${SITE}/api/relay/device/pull?afterSeq=0&waitMs=0`, {
      headers: auth,
    });
    const firstJson = await firstPull.json().catch(() => ({}));
    const firstOk = firstPull.status === 200 && firstJson.ok === true && firstJson.deviceId === ids.deviceId;
    pass(`device pull inicial: http=${firstPull.status} ${firstOk ? "PASS" : "FAIL"}`);
    let afterSeq = Number(firstJson.lastSeq ?? 0) || 0;

    const status = await fetch(`${SITE}/api/relay/painel/pull?deviceId=${ids.deviceId}`, {
      headers: { cookie: `yami_session=${cookie}`, origin: SITE },
    });
    const statusJson = await status.json().catch(() => ({}));
    const online = statusJson.online === true || statusJson.devices?.some((d) => d.id === ids.deviceId && d.online);
    pass(`device online (<30s): online=${!!online} ${online ? "PASS" : "FAIL"}`);
    if (!online) failed = true;
    let painelAfter = Number(statusJson.lastSeq ?? 0) || 0;

    // 5. ida: painel → dispositivo (mede latência, inclusive long-poll)
    const pingId = `ping-${tag()}`;
    const tDown0 = Date.now();
    const waiting = fetch(`${SITE}/api/relay/device/pull?afterSeq=${afterSeq}&waitMs=20000`, {
      headers: auth,
    });
    // dá um instante para o long-poll sentar
    await new Promise((r) => setTimeout(r, 200));
    const downPush = await fetch(`${SITE}/api/relay/painel/push`, {
      method: "POST",
      headers: { ...headersJson(), cookie: `yami_session=${cookie}` },
      body: JSON.stringify({
        deviceId: ids.deviceId,
        kind: "chat",
        payload: { text: "ping-down", pingId, t0: tDown0, action: "chat" },
      }),
    });
    const downPushJson = await downPush.json().catch(() => ({}));
    const downPushOk = downPush.status === 200 && downPushJson.ok === true;
    pass(`painel push chat: http=${downPush.status} queued=${!!downPushJson.queued} ${downPushOk ? "PASS" : "FAIL"}`);
    if (!downPushOk) fail(`painel push error=${redact(downPushJson.error || "")}`);

    const downRes = await waiting;
    const tDown1 = Date.now();
    const downJson = await downRes.json().catch(() => ({}));
    const gotDown = (downJson.messages || []).some(
      (m) => m.kind === "chat" && m.payload && m.payload.pingId === pingId,
    );
    const latencyDown = tDown1 - tDown0;
    pass(
      `round-trip down (painel→PC): http=${downRes.status} got=${gotDown} latency_ms=${latencyDown} ${gotDown ? "PASS" : "FAIL"}`,
    );
    if (!gotDown) failed = true;
    if (typeof downJson.lastSeq === "number") afterSeq = downJson.lastSeq;

    // 6. volta: dispositivo → painel
    const pongId = `pong-${tag()}`;
    const tUp0 = Date.now();
    // Avança o cursor do painel para depois da mensagem down, senão o
    // próximo pull devolve o ping e não espera o pong.
    if (downPushJson.message && typeof downPushJson.message.seq === "number") {
      painelAfter = Math.max(painelAfter, downPushJson.message.seq);
    }
    const upPush = await fetch(`${SITE}/api/relay/device/push`, {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({
        kind: "chat",
        payload: { text: "pong-up", pongId },
      }),
    });
    const upPushJson = await upPush.json().catch(() => ({}));
    const upPushOk = upPush.status === 200 && upPushJson.ok === true;
    pass(`device push chat: http=${upPush.status} ${upPushOk ? "PASS" : "FAIL"}`);

    let gotUp = false;
    let upStatus = 0;
    let tUp1 = Date.now();
    const upDeadline = Date.now() + 20_000;
    while (Date.now() < upDeadline && !gotUp) {
      const remain = Math.max(0, upDeadline - Date.now());
      const upRes = await fetch(
        `${SITE}/api/relay/painel/pull?deviceId=${ids.deviceId}&afterSeq=${painelAfter}&waitMs=${Math.min(8000, remain)}`,
        { headers: { cookie: `yami_session=${cookie}`, origin: SITE } },
      );
      upStatus = upRes.status;
      const upJson = await upRes.json().catch(() => ({}));
      if (typeof upJson.lastSeq === "number") painelAfter = Math.max(painelAfter, upJson.lastSeq);
      gotUp = (upJson.messages || []).some(
        (m) => m.kind === "chat" && m.payload && m.payload.pongId === pongId,
      );
      if (gotUp) tUp1 = Date.now();
    }
    const latencyUp = tUp1 - tUp0;
    pass(
      `round-trip up (PC→painel): http=${upStatus} got=${gotUp} latency_ms=${latencyUp} ${gotUp ? "PASS" : "FAIL"}`,
    );
    if (!gotUp) failed = true;

    // 7. forage: pedido + log/status entregues pelo "dispositivo"
    const foragePush = await fetch(`${SITE}/api/relay/painel/push`, {
      method: "POST",
      headers: { ...headersJson(), cookie: `yami_session=${cookie}` },
      body: JSON.stringify({
        deviceId: ids.deviceId,
        kind: "forage",
        payload: { action: "start" },
      }),
    });
    pass(`painel forage start: http=${foragePush.status} ${foragePush.status === 200 ? "PASS" : "FAIL"}`);
    if (foragePush.status !== 200) failed = true;

    // o dispositivo "executa" e devolve status + log
    const forageLog = await fetch(`${SITE}/api/relay/device/push`, {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({
        kind: "forage",
        payload: { action: "started", running: true, text: "Forage ligado (fake-device)", line: "Forage ligado (fake-device)" },
      }),
    });
    const forageSeen = await fetch(
      `${SITE}/api/relay/painel/pull?deviceId=${ids.deviceId}&history=1`,
      { headers: { cookie: `yami_session=${cookie}`, origin: SITE } },
    );
    const forageJson = await forageSeen.json().catch(() => ({}));
    const forageOk =
      forageLog.status === 200 &&
      (forageJson.messages || []).some(
        (m) =>
          m.kind === "forage" &&
          m.from === "desktop" &&
          m.payload &&
          (m.payload.running === true || m.payload.action === "started"),
      );
    pass(`forage status do dispositivo no histórico: ${forageOk ? "PASS" : "FAIL"}`);
    if (!forageOk) failed = true;

    // 8. teto de tamanho
    const tooBig = await fetch(`${SITE}/api/relay/device/push`, {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ kind: "chat", payload: { text: "x".repeat(70 * 1024) } }),
    });
    pass(`payload cap 413: http=${tooBig.status} ${tooBig.status === 413 ? "PASS" : "FAIL"}`);
    if (tooBig.status !== 413) failed = true;

    // 9. revoga e o próximo pull é 401
    const revoke = await fetch(`${SITE}/api/pairing/revoke`, {
      method: "POST",
      headers: { ...headersJson(), cookie: `yami_session=${cookie}` },
      body: JSON.stringify({ deviceId: ids.deviceId }),
    });
    const revokeOk = revoke.status === 200;
    pass(`revoke: http=${revoke.status} ${revokeOk ? "PASS" : "FAIL"}`);
    const afterRevoke = await fetch(`${SITE}/api/relay/device/pull?waitMs=0`, { headers: auth });
    pass(`pull after revoke: http=${afterRevoke.status} ${afterRevoke.status === 401 ? "PASS" : "FAIL"}`);
    if (afterRevoke.status !== 401) failed = true;

    // 10. painel /painel contém o app (não "em breve") — sessão licenciada
    const painelPage = await fetch(`${SITE}/painel`, {
      headers: { cookie: `yami_session=${cookie}`, origin: SITE },
      redirect: "manual",
    });
    const painelBody = await painelPage.text();
    const emBreve = /Acesso remoto em breve/.test(painelBody);
    const painelLive = painelPage.status === 200 && !emBreve;
    pass(`painel ao vivo (não 'em breve'): http=${painelPage.status} emBreve=${emBreve} ${painelLive ? "PASS" : "FAIL"}`);
    if (!painelLive) failed = true;

    // relatório de latência
    pass(`LATENCY_DOWN_MS=${latencyDown}`);
    pass(`LATENCY_UP_MS=${latencyUp}`);
  } catch (err) {
    fail(redact(err instanceof Error ? err.stack || err.message : err));
  } finally {
    await cleanup();
  }

  for (const line of report) console.log(line);
  if (failed) {
    console.error("FAKE_DEVICE=FAIL");
    process.exit(1);
  }
  console.log("FAKE_DEVICE=PASS");
}

main().catch((err) => {
  console.error(redact(err instanceof Error ? err.message : err));
  console.error("FAKE_DEVICE=FAIL");
  process.exit(1);
});
