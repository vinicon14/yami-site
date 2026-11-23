import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { desktopSession, jsonError } from "../desktop/_shared";
import { getSessionUser, readSessionCookie } from "@/lib/auth";
import { userHasPaidLicense } from "@/lib/license-gate";
import { toCatalogApps } from "@/lib/apps-catalog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function currentUser(req: Request) {
  const tokenSession = await desktopSession(req);
  if (tokenSession) return tokenSession.session.user;
  const current = await getSessionUser(readSessionCookie(req));
  return current?.user ?? null;
}

export async function GET(req: Request) {
  const user = await currentUser(req);
  if (!user) return jsonError("não autenticado", 401);
  const store = await getStore();
  if (!(await userHasPaidLicense(user.email, store))) return jsonError("licença necessária", 403);
  const items = await store.listFeatureRequests();
  return NextResponse.json({ ok: true, apps: toCatalogApps(items) });
}
