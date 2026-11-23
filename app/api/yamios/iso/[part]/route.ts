import { NextResponse } from "next/server";
import manifest from "@/lib/yamios/latest.json";
import { isoDownloadUrl } from "@/lib/yamios/public-manifest";
import { getStore } from "@/lib/db";
import { desktopSession, jsonError } from "@/app/api/desktop/_shared";
import { getSessionUser, readSessionCookie } from "@/lib/auth";
import { userHasPaidLicense } from "@/lib/license-gate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request, ctx: { params: Promise<{ part: string }> }) {
  const { part } = await ctx.params;
  const url = isoDownloadUrl(manifest, part);
  if (!url) return jsonError("parte_invalida", 404);

  let email: string | null = null;
  const ds = await desktopSession(req);
  if (ds) {
    email = ds.session.user.email;
  } else {
    const current = await getSessionUser(readSessionCookie(req));
    if (current) email = current.user.email;
  }
  if (!email) return jsonError("nao_autenticado", 401);

  const store = await getStore();
  if (!(await userHasPaidLicense(email, store))) return jsonError("licenca_necessaria", 403);

  return NextResponse.redirect(url, 302);
}
