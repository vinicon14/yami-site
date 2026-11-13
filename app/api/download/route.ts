import { NextResponse } from "next/server";
import { getDownloadSecret, getMaxDownloads } from "@/lib/config";
import { getStore } from "@/lib/db";
import { checkDownloadToken, hashToken } from "@/lib/download-token";
import { getInstallerSource, openInstallerStream } from "@/lib/installer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  if (!token || !/^[a-f0-9]{64}$/i.test(token)) {
    return NextResponse.json({ error: "link inválido" }, { status: 400 });
  }

  const store = await getStore();
  const row = await store.getDownloadTokenByHash(
    hashToken(token, getDownloadSecret()),
  );
  if (!row) {
    return NextResponse.json({ error: "link inválido ou já expirado" }, { status: 404 });
  }

  const used = await store.totalDownloadsForOrder(row.orderId);
  const check = checkDownloadToken({
    expiresAt: new Date(row.expiresAt),
    downloadsUsed: Math.max(row.downloadsUsed, used),
    maxDownloads: Math.min(row.maxDownloads, getMaxDownloads()),
  });
  if (!check.ok) {
    const msg =
      check.reason === "expired"
        ? "Este link expirou. Abra a página de sucesso do pedido ou escreva para o suporte com o e-mail da compra."
        : "Este pedido já atingiu o limite de downloads.";
    return NextResponse.json({ error: msg, reason: check.reason }, { status: 410 });
  }

  const source = getInstallerSource();
  if (!source.ok) {
    return NextResponse.json(
      {
        error:
          "O arquivo de instalação ainda não foi publicado neste ambiente. Sua licença está reservada. Tente de novo mais tarde.",
        reason: "installer_missing",
      },
      { status: 503 },
    );
  }

  try {
    await store.incrementDownload(row.id);
    const file = await openInstallerStream();
    const headers = new Headers();
    headers.set("Content-Type", file.contentType);
    headers.set(
      "Content-Disposition",
      `attachment; filename="${file.filename.replace(/"/g, "")}"`,
    );
    headers.set("Cache-Control", "no-store");
    headers.set("X-Content-Type-Options", "nosniff");
    if (file.contentLength) {
      headers.set("Content-Length", String(file.contentLength));
    }
    return new Response(file.stream, { status: 200, headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : "download_failed";
    console.error("download_failed", message);
    return NextResponse.json(
      { error: "Não foi possível obter o instalador agora." },
      { status: 502 },
    );
  }
}
