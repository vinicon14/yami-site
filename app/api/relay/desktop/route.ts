import { handleDevicePull, handleDevicePush } from "@/lib/relay/handlers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

/** @deprecated Use GET /api/relay/device/pull */
export async function GET(req: Request) {
  return handleDevicePull(req);
}

/** @deprecated Use POST /api/relay/device/push */
export async function POST(req: Request) {
  return handleDevicePush(req);
}
