import { handleDevicePull } from "@/lib/relay/handlers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: Request) {
  return handleDevicePull(req);
}
