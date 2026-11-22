import { NextResponse } from "next/server";
import { getSessionUser, readSessionCookie } from "@/lib/auth";
import { getStore } from "@/lib/db";
import { createRequest, toPublicFeatureRequest } from "@/lib/feature-requests";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const current = await getSessionUser(readSessionCookie(req));
  if (!current) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_request" }, { status: 400 }); }
  try {
    const item = await createRequest(await getStore(), current.user.id, {
      title: String(body.title ?? ""),
      description: String(body.description ?? ""),
      category: String(body.category ?? ""),
    });
    return NextResponse.json({ ok: true, item: toPublicFeatureRequest(item) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "invalid_request" }, { status: 400 });
  }
}
