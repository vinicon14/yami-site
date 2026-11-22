import { NextResponse } from "next/server";
import { desktopSession, jsonError } from "../_shared";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(req: Request) {
  const auth = await desktopSession(req);
  if (!auth) return jsonError("device_revoked", 401);
  const items = await auth.store.listUserNotifications(auth.session.user.id, 50);
  return NextResponse.json({ ok: true, items, unread: await auth.store.countUnreadNotifications(auth.session.user.id) });
}
