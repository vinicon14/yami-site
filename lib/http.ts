import { NextResponse } from "next/server";
import { getSiteUrl } from "./config";

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 200;
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim().slice(0, 80);
  return req.headers.get("x-real-ip") ?? "unknown";
}

export function sameOrigin(req: Request, extraOrigins: string[] = []): boolean {
  const allowed = new Set<string>();
  try {
    allowed.add(new URL(getSiteUrl()).origin);
  } catch {
    /* ignore */
  }
  for (const raw of extraOrigins) {
    try {
      allowed.add(new URL(raw).origin);
    } catch {
      /* ignore */
    }
  }
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      return allowed.has(new URL(origin).origin);
    } catch {
      return false;
    }
  }
  const referer = req.headers.get("referer");
  if (!referer) return false;
  try {
    return allowed.has(new URL(referer).origin);
  } catch {
    return false;
  }
}

export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}
