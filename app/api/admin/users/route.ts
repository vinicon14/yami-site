import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { adminFromRequest } from "../../desktop/_shared";
import { jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const admin = await adminFromRequest(req);
  if (!admin) return jsonError("sem permissão", 403);
  const users = await (await getStore()).listUsers();
  const safe = users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    status: u.status ?? "ativo",
    licenseId: u.licenseId ?? null,
    createdAt: u.createdAt,
  }));
  return NextResponse.json({ ok: true, users: safe });
}
