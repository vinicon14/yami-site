import { NextResponse } from "next/server";
import {
  clearSessionCookie,
  getSessionUser,
  isSecureRequest,
  readSessionCookie,
} from "@/lib/auth";
import { getStore } from "@/lib/db";
import { sameOrigin } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!sameOrigin(req)) {
    return NextResponse.json({ error: "origem inválida" }, { status: 403 });
  }
  const raw = readSessionCookie(req);
  const current = await getSessionUser(raw);
  if (current) {
    const store = await getStore();
    await store.deleteSession(current.session.id);
  }
  const res = NextResponse.json({ ok: true });
  res.headers.append("Set-Cookie", clearSessionCookie(isSecureRequest(req)));
  return res;
}
