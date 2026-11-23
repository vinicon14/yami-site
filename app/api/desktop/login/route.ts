import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { desktopLogin } from "@/lib/desktop-auth";
import { clientIp, isValidEmail } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { jsonError } from "../_shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  if (origin !== null) {
    let originMatches = false;
    try {
      originMatches = new URL(origin).origin === new URL(req.url).origin;
    } catch {
      originMatches = false;
    }
    if (!originMatches) return jsonError("invalid_request", 403);
  }
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return jsonError("invalid_request", 400); }
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const deviceName = String(body.deviceName ?? "YAMI OS");
  const ip = req.headers.get("x-real-ip") ?? clientIp(req);
  const byIp = rateLimit(`desktop-login:${ip}`, 10, 15 * 60 * 1000);
  const byEmail = rateLimit(`desktop-login-email:${email}`, 10, 15 * 60 * 1000);
  if (!byIp.ok || !byEmail.ok) return jsonError("rate_limited", 429);
  if (!isValidEmail(email) || !password) return jsonError("invalid_credentials", 401);
  try {
    const result = await desktopLogin(await getStore(), email, password, deviceName);
    return NextResponse.json({
      deviceToken: result.deviceToken,
      device: { id: result.device.id, name: result.device.name },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "invalid_credentials";
    if (code === "conta_bloqueada") return jsonError(code, 403);
    return jsonError(code === "invalid_credentials" ? code : "invalid_request", 401);
  }
}
