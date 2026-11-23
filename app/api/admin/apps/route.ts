import { NextResponse } from "next/server";
import { adminFromRequest, jsonError } from "../../desktop/_shared";
import { getStore } from "@/lib/db";
import { adminStoreOverview } from "@/lib/store-apps";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const admin = await adminFromRequest(req);
  if (!admin) return jsonError("sem permissão", 403);
  const overview = await adminStoreOverview(await getStore());
  return NextResponse.json({ ok: true, ...overview });
}
