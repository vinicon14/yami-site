import { NextResponse } from "next/server";
import { createRequest } from "@/lib/feature-requests";
import { desktopSession, jsonError } from "../_shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await desktopSession(req);
  if (!auth) return jsonError("device_revoked", 401);
  const items = await auth.store.listFeatureRequests(auth.session.user.id);
  return NextResponse.json({ ok: true, items });
}

export async function POST(req: Request) {
  const auth = await desktopSession(req);
  if (!auth) return jsonError("device_revoked", 401);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return jsonError("invalid_request", 400); }
  try {
    const item = await createRequest(auth.store, auth.session.user.id, {
      title: String(body.title ?? ""),
      description: String(body.description ?? ""),
      category: String(body.category ?? ""),
    });
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "invalid_request", 400);
  }
}
