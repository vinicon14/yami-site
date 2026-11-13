import { NextResponse } from "next/server";
import { authorizeDownload, presignAuthorizedFile } from "@/lib/download-serve";
import { getStore } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

async function handle(req: Request, increment: boolean) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  const file = url.searchParams.get("file");
  const store = await getStore();
  const auth = await authorizeDownload({ token, file, store });
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.error, reason: auth.reason },
      { status: auth.status },
    );
  }

  if (!increment) {
    const headers = new Headers();
    headers.set("Content-Type", auth.file.contentType);
    headers.set(
      "Content-Disposition",
      `attachment; filename="${auth.file.filename.replace(/"/g, "")}"`,
    );
    headers.set("Content-Length", String(auth.file.size));
    headers.set("Accept-Ranges", "bytes");
    headers.set("X-Checksum-SHA256", auth.file.sha256);
    headers.set("Cache-Control", "no-store");
    headers.set("X-Content-Type-Options", "nosniff");
    return new Response(null, { status: 200, headers });
  }

  try {
    const signed = await presignAuthorizedFile(auth.file, "get");
    await store.incrementDownload(auth.tokenId);
    const headers = new Headers();
    headers.set("Location", signed.url);
    headers.set("Cache-Control", "no-store");
    headers.set(
      "Content-Disposition",
      `attachment; filename="${auth.file.filename.replace(/"/g, "")}"`,
    );
    return new Response(null, { status: 302, headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : "download_failed";
    console.error("download_failed", message);
    return NextResponse.json(
      { error: "Não foi possível obter o instalador agora." },
      { status: 502 },
    );
  }
}

export async function GET(req: Request) {
  return handle(req, true);
}

export async function HEAD(req: Request) {
  return handle(req, false);
}
