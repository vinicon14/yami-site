import { NextResponse } from "next/server";
import { desktopSession, jsonError } from "../../_shared";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await desktopSession(req);
  if (!auth) return jsonError("device_revoked", 401);
  const ok = await auth.store.markNotificationRead((await ctx.params).id, auth.session.user.id);
  return ok ? NextResponse.json({ ok: true }) : jsonError("not_found", 404);
}
