import { jsonError } from "@/lib/http";
import { pollPairing } from "@/lib/pairing";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("pollToken") ?? "";
  if (!token || token.length < 16) return jsonError("token ausente", 400);
  const result = await pollPairing(token);
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  const token = String(body.pollToken ?? "");
  if (!token || token.length < 16) return jsonError("token ausente", 400);
  const result = await pollPairing(token);
  return NextResponse.json(result);
}
