import { getSessionUser, readSessionCookie } from "@/lib/auth";
import { getStore } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { getRelay } from "@/lib/relay";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const current = await getSessionUser(readSessionCookie(req));
  if (!current) return jsonError("entre na sua conta", 401);
  const store = await getStore();
  const relay = getRelay();
  const devices = await store.listDevices(current.user.id);
  const list = await Promise.all(
    devices.map(async (d) => {
      const status = await relay.getStatus(d.id);
      return {
        id: d.id,
        name: d.name,
        createdAt: d.createdAt,
        lastSeenAt: d.lastSeenAt ?? status.lastSeenAt,
        revoked: Boolean(d.revokedAt),
        online: !d.revokedAt && status.online,
      };
    }),
  );
  return NextResponse.json({ devices: list });
}
