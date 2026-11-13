import { NextResponse } from "next/server";
import { getSessionUser, readSessionCookie } from "@/lib/auth";
import { getStore } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const current = await getSessionUser(readSessionCookie(req));
  if (!current) {
    return NextResponse.json({ user: null }, { status: 401 });
  }
  const store = await getStore();
  const licenses = await store.getLicensesByEmail(current.user.email);
  const orders = (await store.getOrdersByEmail(current.user.email)).map((o) => ({
    id: o.id,
    status: o.status,
    amountBrl: o.amountBrl,
    paidAt: o.paidAt,
    createdAt: o.createdAt,
  }));
  const devices = (await store.listDevices(current.user.id)).map((d) => ({
    id: d.id,
    name: d.name,
    createdAt: d.createdAt,
    lastSeenAt: d.lastSeenAt,
    revoked: Boolean(d.revokedAt),
  }));
  return NextResponse.json({
    user: { id: current.user.id, email: current.user.email, name: current.user.name },
    licenses: licenses.map((l) => ({
      id: l.id,
      key: l.key,
      orderId: l.orderId,
      createdAt: l.createdAt,
    })),
    orders,
    devices,
  });
}
