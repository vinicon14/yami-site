import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { bearerToken, getDesktopSession } from "@/lib/desktop-auth";
import { getSessionUser, readSessionCookie } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";

export function jsonError(code: string, status: number) {
  return NextResponse.json({ error: code }, { status });
}

export async function desktopSession(req: Request) {
  const token = bearerToken(req);
  if (!token) return null;
  const store = await getStore();
  const session = await getDesktopSession(store, token);
  if (!session) return null;
  return { store, session, token };
}

export async function adminFromRequest(req: Request) {
  const current = await getSessionUser(readSessionCookie(req));
  if (!current || !isAdminEmail(current.user.email)) return null;
  return current;
}
