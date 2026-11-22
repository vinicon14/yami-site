import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { startPairingByEmail } from "@/lib/pairing";
import { sendPairingEmail } from "@/lib/email";
import { getSessionUser, readSessionCookie } from "@/lib/auth";
import { clientIp, isValidEmail, jsonError } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { body = {}; }
  const current = await getSessionUser(readSessionCookie(req));
  const email = String(body.email ?? current?.user.email ?? "").trim().toLowerCase();
  const deviceName = String(body.deviceName ?? "PC de casa");
  if (!isValidEmail(email)) return jsonError("invalid_request", 400);

  const limitedIp = rateLimit(`pair-email-ip:${clientIp(req)}`, 10, 15 * 60 * 1000);
  const limitedEmail = rateLimit(`pair-email:${email}`, 3, 60 * 60 * 1000);
  if (!limitedIp.ok || !limitedEmail.ok) return jsonError("rate_limited", 429);

  const store = await getStore();
  try {
    const started = await startPairingByEmail(store, email, deviceName);
    await sendPairingEmail(started.email, started.confirmToken);
    return NextResponse.json({ ok: true, pollToken: started.pollToken, expiresAt: started.expiresAt });
  } catch {
    // Resposta genérica para não revelar quais contas têm licença.
    return NextResponse.json({ ok: true, pollToken: crypto.randomUUID(), expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString() });
  }
}
