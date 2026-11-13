#!/usr/bin/env node
/**
 * Simula um pedido aprovado (SEM pagamento no Mercado Pago):
 * cria pedido + licença + token no Postgres, testa HEAD/GET do download,
 * expiração e limite, depois apaga os dados de teste.
 *
 * Uso (no servidor/caixa, nunca imprime segredos):
 *   DATABASE_URL=... SITE_URL=https://yami-site-pi.vercel.app \
 *   DOWNLOAD_TOKEN_SECRET=... node scripts/e2e-fulfill-test.mjs
 */
import { createHash, randomBytes } from "node:crypto";
import postgres from "postgres";

const SITE = (process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
const SECRET = process.env.DOWNLOAD_TOKEN_SECRET;
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL ausente");
  process.exit(2);
}
if (!SECRET) {
  console.error("DOWNLOAD_TOKEN_SECRET ausente");
  process.exit(2);
}
if (!SITE) {
  console.error("SITE_URL ausente");
  process.exit(2);
}

function hashToken(token, secret) {
  return createHash("sha256").update(`${secret}:${token}`).digest("hex");
}

function nowIso(d = new Date()) {
  return d.toISOString();
}

async function main() {
  const ssl =
    process.env.DATABASE_SSL === "false"
      ? false
      : process.env.DATABASE_URL.includes("localhost")
        ? false
        : "require";
  const sql = postgres(process.env.DATABASE_URL, { ssl, max: 1, idle_timeout: 20 });
  const report = [];
  const ids = {
    order: `test-e2e-${randomBytes(6).toString("hex")}`,
    license: `lic-${randomBytes(6).toString("hex")}`,
    tokenRow: `tok-${randomBytes(6).toString("hex")}`,
    tokenRow2: `tok2-${randomBytes(6).toString("hex")}`,
    expiredRow: `tokx-${randomBytes(6).toString("hex")}`,
  };
  const liveToken = randomBytes(32).toString("hex");
  const limitedToken = randomBytes(32).toString("hex");
  const expiredToken = randomBytes(32).toString("hex");
  const email = `e2e-test-${ids.order.slice(-8)}@yami.test`;

  try {
    // migrate (idempotent)
    const schema = await import("node:fs").then((fs) =>
      fs.readFileSync(new URL("../lib/db/schema.sql", import.meta.url), "utf8"),
    );
    // schema may have multiple statements — run unsafe
    await sql.unsafe(schema);

    const createdAt = nowIso();
    await sql`
      INSERT INTO orders (id, email, name, amount_brl, currency, status, mp_payment_id, created_at, paid_at)
      VALUES (${ids.order}, ${email}, ${"E2E Test"}, ${20}, ${"BRL"}, ${"paid"}, ${"test-pay-"+ids.order}, ${createdAt}, ${createdAt})
    `;
    // persist check via a fresh query
    const rows = await sql`SELECT id, status, amount_brl FROM orders WHERE id = ${ids.order}`;
    if (!rows[0] || rows[0].status !== "paid") {
      throw new Error("pedido de teste não persistiu");
    }
    report.push(`persist: ok order=${ids.order} status=${rows[0].status} amount=${rows[0].amount_brl}`);

    const licenseKey = `YAMI-E2E-${randomBytes(4).toString("hex").toUpperCase()}`;
    await sql`
      INSERT INTO licenses (id, order_id, key, created_at)
      VALUES (${ids.license}, ${ids.order}, ${licenseKey}, ${createdAt})
    `;

    const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const alreadyExpired = new Date(Date.now() - 60 * 1000).toISOString();
    await sql`
      INSERT INTO download_tokens (id, order_id, license_id, token_hash, expires_at, downloads_used, max_downloads, created_at)
      VALUES
        (${ids.tokenRow}, ${ids.order}, ${ids.license}, ${hashToken(liveToken, SECRET)}, ${expires}, ${0}, ${5}, ${createdAt}),
        (${ids.tokenRow2}, ${ids.order}, ${ids.license}, ${hashToken(limitedToken, SECRET)}, ${expires}, ${5}, ${5}, ${createdAt}),
        (${ids.expiredRow}, ${ids.order}, ${ids.license}, ${hashToken(expiredToken, SECRET)}, ${alreadyExpired}, ${0}, ${5}, ${createdAt})
    `;
    report.push("license+tokens: ok");

    // HEAD (não consome)
    const headUrl = `${SITE}/api/download?token=${liveToken}&file=setup`;
    const head = await fetch(headUrl, { method: "HEAD", redirect: "manual" });
    const headLen = head.headers.get("content-length");
    const headSha = head.headers.get("x-checksum-sha256");
    report.push(`HEAD setup: http=${head.status} length=${headLen} sha=${headSha ? "yes" : "no"}`);

    // GET — deve 302 para URL assinada (não seguimos o Location para não baixar 300 MB aqui)
    const getRes = await fetch(headUrl, { method: "GET", redirect: "manual" });
    const location = getRes.headers.get("location") || "";
    const isSigned =
      /blob\.vercel-storage\.com/i.test(location) &&
      /vercel-blob-|X-Amz-|token=|signature=/i.test(location);
    // Não imprimir a URL completa (é um link de curta validade, mas ainda é um secret temporário).
    report.push(
      `GET setup: http=${getRes.status} signed_redirect=${isSigned} loc_host=${safeHost(location)}`,
    );

    // Range: segue um pedaço pequeno se 302 — apenas 1 KB, para confirmar Accept-Ranges
    if (isSigned && getRes.status >= 300 && getRes.status < 400) {
      const range = await fetch(location, {
        headers: { Range: "bytes=0-1023" },
        redirect: "manual",
      });
      const buf = Buffer.from(await range.arrayBuffer());
      report.push(
        `RANGE 0-1023: http=${range.status} bytes=${buf.length} accept=${range.headers.get("accept-ranges")}`,
      );
    }

    // portable + apk HEAD
    for (const kind of ["portable", "apk"]) {
      const r = await fetch(`${SITE}/api/download?token=${liveToken}&file=${kind}`, {
        method: "HEAD",
        redirect: "manual",
      });
      const body = r.status >= 400 ? await r.text().catch(() => "") : "";
      let reason = "";
      try {
        reason = JSON.parse(body).reason || JSON.parse(body).error || "";
      } catch {
        reason = body.slice(0, 80);
      }
      report.push(`HEAD ${kind}: http=${r.status} length=${r.headers.get("content-length") ?? "-"} ${reason}`);
    }

    // expired
    const exp = await fetch(`${SITE}/api/download?token=${expiredToken}&file=setup`, {
      method: "GET",
      redirect: "manual",
    });
    const expBody = await exp.text();
    report.push(`expired GET: http=${exp.status} body_has_expirou=${/expir/i.test(expBody)}`);

    // limit
    const lim = await fetch(`${SITE}/api/download?token=${limitedToken}&file=setup`, {
      method: "GET",
      redirect: "manual",
    });
    const limBody = await lim.text();
    report.push(`limit GET: http=${lim.status} body_has_limite=${/limite/i.test(limBody)}`);

    // invalid
    const inv = await fetch(`${SITE}/api/download?token=${"a".repeat(64)}&file=setup`);
    report.push(`invalid GET: http=${inv.status}`);
  } finally {
    try {
      await sql`DELETE FROM download_tokens WHERE order_id = ${ids.order}`;
      await sql`DELETE FROM licenses WHERE order_id = ${ids.order}`;
      await sql`DELETE FROM orders WHERE id = ${ids.order}`;
      const leftover = await sql`SELECT id FROM orders WHERE id = ${ids.order}`;
      report.push(`cleanup: ${leftover.length === 0 ? "ok" : "FAILED leftover"}`);
    } catch (err) {
      report.push(`cleanup_error: ${err instanceof Error ? err.message : err}`);
    }
    await sql.end({ timeout: 5 });
  }

  for (const line of report) console.log(line);
}

function safeHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return url ? "unparseable" : "empty";
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
