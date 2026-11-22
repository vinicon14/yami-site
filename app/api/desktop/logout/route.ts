import { NextResponse } from "next/server";
import { revokeDesktopDevice } from "@/lib/desktop-auth";
import { desktopSession, jsonError } from "../_shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const auth = await desktopSession(req);
  if (!auth) return jsonError("device_revoked", 401);
  await revokeDesktopDevice(auth.store, auth.session.device.id, auth.session.user.id);
  return NextResponse.json({ ok: true });
}
