import { NextResponse } from "next/server";
import { processMercadoPagoNotification } from "@/lib/mp-webhook";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Caminho legado; o canônico é /api/mp/webhook. */
export async function POST(req: Request) {
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  const url = new URL(req.url);
  // Trata como se tivesse chegado no caminho canônico, para a lógica ser a mesma.
  const result = await processMercadoPagoNotification({
    body,
    url,
    headers: {
      signature: req.headers.get("x-signature"),
      requestId: req.headers.get("x-request-id"),
    },
  });
  if (!result.ok) {
    if (result.status >= 500) console.error("webhook_failed", result.error);
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({
    ok: true,
    skipped: result.skipped,
    fulfilled: result.fulfilled,
  });
}

export async function GET() {
  return NextResponse.json({ ok: true, service: "yami-mp-webhook" });
}
