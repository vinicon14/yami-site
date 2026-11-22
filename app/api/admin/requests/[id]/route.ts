import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { transitionRequest } from "@/lib/feature-requests";
import { adminFromRequest, jsonError } from "../../../desktop/_shared";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await adminFromRequest(req);
  if (!admin) return jsonError("forbidden", 403);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return jsonError("invalid_request", 400); }
  try {
    const item = await transitionRequest(await getStore(), {
      id: (await ctx.params).id,
      actorUserId: admin.user.id,
      actorRole: "admin",
      toStatus: String(body.status) as never,
      note: body.note == null ? null : String(body.note),
      publishedVersion: body.publishedVersion == null ? null : String(body.publishedVersion),
    });
    return NextResponse.json({ ok: true, item });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "invalid_request", 400);
  }
}
