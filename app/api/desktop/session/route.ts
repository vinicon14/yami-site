import { NextResponse } from "next/server";
import { desktopSession, jsonError } from "../_shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await desktopSession(req);
  if (!auth) return jsonError("device_revoked", 401);
  return NextResponse.json({ ok: true, ...auth.session });
}
