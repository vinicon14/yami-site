import { NextResponse } from "next/server";
import { getSessionUser, readSessionCookie } from "@/lib/auth";
import { getStore } from "@/lib/db";
import { issueDownloadToken } from "@/lib/fulfill";
import { jsonError, sameOrigin } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return jsonError("origem inválida", 403);
  const current = await getSessionUser(readSessionCookie(req));
  if (!current) return jsonError("entre na sua conta", 401);

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  const store = await getStore();
  const orders = (await store.getOrdersByEmail(current.user.email)).filter(
    (o) => o.status === "paid",
  );
  const wanted = typeof body.orderId === "string" ? body.orderId : orders[0]?.id;
  const order = orders.find((o) => o.id === wanted);
  if (!order) return jsonError("nenhuma compra encontrada para este e-mail", 404);
  const license = await store.getLicenseByOrderId(order.id);
  if (!license) return jsonError("licença ausente", 404);
  const issued = await issueDownloadToken(store, order, license);
  if (!issued.token) {
    return jsonError("este pedido já atingiu o limite de downloads", 410);
  }
  return NextResponse.json({
    ok: true,
    token: issued.token,
    expiresAt: issued.expiresAt,
    url: `/api/download?token=${issued.token}`,
  });
}
