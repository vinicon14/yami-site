import { NextResponse } from "next/server";
import { adminFromRequest, jsonError } from "../../desktop/_shared";
import { getStore } from "@/lib/db";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(req: Request) {
  const admin = await adminFromRequest(req);
  if (!admin) return jsonError("forbidden", 403);
  const items = await (await getStore()).listFeatureRequests();
  return NextResponse.json({ ok: true, items });
}
