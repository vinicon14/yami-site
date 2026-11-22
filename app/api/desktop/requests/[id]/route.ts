import { NextResponse } from "next/server";
import { transitionRequest, validateRequestInput } from "@/lib/feature-requests";
import { desktopSession, jsonError } from "../../_shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const auth = await desktopSession(req);
  if (!auth) return jsonError("device_revoked", 401);
  const item = await auth.store.getFeatureRequest((await ctx.params).id);
  if (!item || item.userId !== auth.session.user.id) return jsonError("not_found", 404);
  return NextResponse.json({ ok: true, item });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const auth = await desktopSession(req);
  if (!auth) return jsonError("device_revoked", 401);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return jsonError("invalid_request", 400); }
  const current = await auth.store.getFeatureRequest((await ctx.params).id);
  if (!current || current.userId !== auth.session.user.id) return jsonError("not_found", 404);
  if (current.status !== "pendente") return jsonError("forbidden", 403);
  const next = {
    title: String(body.title ?? current.title).trim(),
    description: String(body.description ?? current.description).trim(),
    category: String(body.category ?? current.category).trim(),
  };
  if (!validateRequestInput(next).ok) return jsonError("invalid_request", 400);
  const item = await auth.store.updateFeatureRequest({
    id: current.id,
    userId: auth.session.user.id,
    ...next,
  });
  return item ? NextResponse.json({ ok: true, item }) : jsonError("invalid_request", 400);
}

export async function DELETE(req: Request, ctx: Ctx) {
  const auth = await desktopSession(req);
  if (!auth) return jsonError("device_revoked", 401);
  const id = (await ctx.params).id;
  const current = await auth.store.getFeatureRequest(id);
  if (!current || current.userId !== auth.session.user.id) return jsonError("not_found", 404);
  try {
    const item = await transitionRequest(auth.store, {
      id,
      actorUserId: auth.session.user.id,
      actorRole: "user",
      toStatus: "retirada",
    });
    return NextResponse.json({ ok: true, item });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "invalid_request", 400);
  }
}
