import { NextResponse } from "next/server";
import { clientIp, jsonError } from "@/lib/http";
import { startPairing } from "@/lib/pairing";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Chamado pelo aplicativo no PC de casa. Devolve o código para a pessoa digitar no site. */
export async function POST(req: Request) {
  const limited = rateLimit(`pair-start:${clientIp(req)}`, 20, 15 * 60 * 1000);
  if (!limited.ok) return jsonError("muitas tentativas, tente mais tarde", 429);
  const started = await startPairing();
  return NextResponse.json({
    code: started.code,
    pollToken: started.pollToken,
    expiresAt: started.expiresAt,
  });
}
