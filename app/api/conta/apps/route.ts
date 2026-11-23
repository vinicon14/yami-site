import { NextResponse } from "next/server";
import { jsonError } from "../../desktop/_shared";
import { getSiteUrl } from "@/lib/config";
import { accountFromRequest } from "@/lib/store-app-http";
import { catalogForShowcase, listOwnApps } from "@/lib/store-apps";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const account = await accountFromRequest(req);
  if (!account) return jsonError("não autenticado", 401);
  if ("blocked" in account) return jsonError("conta_bloqueada", 403);
  const baseUrl = getSiteUrl();
  const [mine, store] = await Promise.all([
    listOwnApps(account.store, account.user, { baseUrl }),
    catalogForShowcase(account.store, account.user, { baseUrl }),
  ]);
  return NextResponse.json({ ok: true, verifySha256BeforeInstall: true, mine, store });
}
