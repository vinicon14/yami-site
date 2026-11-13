import { NextResponse } from "next/server";
import { getCurrentManifest } from "@/lib/release-store";
import { toPublicManifest } from "@/lib/release";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const manifest = await getCurrentManifest();
  if (!manifest) {
    return NextResponse.json({
      version: null,
      publishedAt: null,
      files: {},
      apkComingSoon: true,
    });
  }
  const pub = toPublicManifest(manifest);
  return NextResponse.json({
    ...pub,
    apkComingSoon: !pub.files.apk,
  });
}
