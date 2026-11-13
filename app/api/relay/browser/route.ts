import { handlePainelPull, handlePainelPush } from "@/lib/relay/handlers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

/** @deprecated Use GET /api/relay/painel/pull */
export async function GET(req: Request) {
  return handlePainelPull(req);
}

/** @deprecated Use POST /api/relay/painel/push */
export async function POST(req: Request) {
  return handlePainelPush(req);
}
