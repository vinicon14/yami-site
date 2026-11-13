import { NextResponse } from "next/server";
import { processMercadoPagoNotification } from "@/lib/mp-webhook";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  const url = new URL(req.url);
  const result = await processMercadoPagoNotification({
    body,
    url,
    headers: {
      signature: req.headers.get("x-signature"),
      requestId: req.headers.get("x-request-id"),
    },
  });
  if (!result.ok) {
    const message = result.error;
    if (result.status >= 500) console.error("webhook_failed", message);
    return NextResponse.json({ error: message }, { status: result.status });
  }
  return NextResponse.json({
    ok: true,
    skipped: result.skipped,
    fulfilled: result.fulfilled,
  });
}

export async function GET() {
  // Alguns painéis do MP testam o endpoint com GET.
  return NextResponse.json({ ok: true, service: "yami-mp-webhook" });
}
