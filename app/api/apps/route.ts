import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { desktopSession, jsonError } from "../desktop/_shared";
import { getSessionUser, readSessionCookie } from "@/lib/auth";
import { userHasPaidLicense } from "@/lib/license-gate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function currentUser(req: Request) {
  const tokenSession = await desktopSession(req);
  if (tokenSession) return tokenSession.session.user;
  const current = await getSessionUser(readSessionCookie(req));
  return current?.user ?? null;
}

export async function GET(req: Request) {
  const user = await currentUser(req);
  if (!user) return jsonError("não autenticado", 401);
  const store = await getStore();
  if (!(await userHasPaidLicense(user.email, store))) return jsonError("licença necessária", 403);
  const items = await store.listFeatureRequests();
  const apps = items
    .filter((item) => item.status === "publicada" && item.fileBlobPathname && item.publishedAssetUrl)
    .map((item) => ({
      id: item.id,
      name: item.title,
      description: item.description,
      category: item.category,
      version: item.appVersion ?? item.publishedVersion ?? "1.0.0",
      icon: item.appIcon,
      platform: "linux",
      sha256: item.fileSha256,
      size: item.fileSize,
      downloadUrl: item.publishedAssetUrl,
      publishedAt: item.publishedAt,
    }));
  return NextResponse.json({ ok: true, apps });
}
