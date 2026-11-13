import { handleDevicePush } from "@/lib/relay/handlers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  return handleDevicePush(req);
}
