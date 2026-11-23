import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { transitionRequest } from "@/lib/feature-requests";
import { publishAppToGitHub } from "@/lib/github-apps";
import { adminFromRequest, jsonError } from "../../../desktop/_shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await adminFromRequest(req);
  if (!admin) return jsonError("forbidden", 403);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return jsonError("invalid_request", 400); }
  const store = await getStore();
  const id = (await ctx.params).id;
  const current = await store.getFeatureRequest(id);
  if (!current) return jsonError("not_found", 404);

  const publish = body.publish === true;
  const toStatus = String(body.status ?? current.status) as never;
  if (publish) {
    if (!current.fileBlobPathname || !current.fileSha256 || !current.fileSize || !current.fileName) {
      return jsonError("arquivo_ausente", 400);
    }
    const version = String(body.publishedVersion ?? "").trim();
    if (!/^\d+\.\d+\.\d+$/.test(version)) return jsonError("versao_publicacao_invalida", 400);
    try {
      const published = await publishAppToGitHub({
        requestId: current.id,
        fileName: current.fileName,
        blobPathname: current.fileBlobPathname,
        sha256: current.fileSha256,
        size: current.fileSize,
        version,
        title: current.title,
        description: current.description,
        category: current.category,
        icon: current.appIcon,
        platform: current.appPlatform,
      });
      const item = await transitionRequest(store, {
        id,
        actorUserId: admin.user.id,
        actorRole: "admin",
        toStatus: "publicada",
        note: body.note == null ? null : String(body.note),
        publishedVersion: version,
        publishedAssetUrl: published.assetUrl,
      });
      return NextResponse.json({ ok: true, item, published });
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : "falha_publicacao", 500);
    }
  }

  try {
    const item = await transitionRequest(store, {
      id,
      actorUserId: admin.user.id,
      actorRole: "admin",
      toStatus,
      note: body.note == null ? null : String(body.note),
      publishedVersion: body.publishedVersion == null ? null : String(body.publishedVersion),
    });
    return NextResponse.json({ ok: true, item });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "invalid_request", 400);
  }
}
