import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { desktopSession, jsonError } from "@/app/api/desktop/_shared";
import { getSessionUser, readSessionCookie } from "@/lib/auth";
import { userHasPaidLicense } from "@/lib/license-gate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PARTS: Record<string, string> = {
  "1": "https://github.com/vinicon14/yamios-releases/releases/download/v1.0.0/yami-os-1.0.0.iso.parte01",
  "2": "https://github.com/vinicon14/yamios-releases/releases/download/v1.0.0/yami-os-1.0.0.iso.parte02",
};

export async function GET(req: Request, ctx: { params: Promise<{ part: string }> }) {
  const { part } = await ctx.params;
  const url = PARTS[part];
  if (!url) return jsonError("parte_invalida", 404);

  // Identificar o usuário (sessão web ou token de dispositivo do desktop)
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
