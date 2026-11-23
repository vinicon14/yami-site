import { NextResponse } from "next/server";
import { jsonError } from "../desktop/_shared";
import { getSiteUrl } from "@/lib/config";
import { catalogForInstall, submitStoreApp } from "@/lib/store-apps";
import { accountFromRequest, originOk } from "@/lib/store-app-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function fail(error: unknown) {
  const code = error instanceof Error ? error.message : "pedido_invalido";
  const status =
    code === "conta_bloqueada" ? 403 :
    code === "limite_excedido" ? 429 :
    code === "nao_encontrado" ? 404 :
    400;
  return jsonError(code, status);
}

export async function GET(req: Request) {
  const account = await accountFromRequest(req);
  if (!account) return jsonError("não autenticado", 401);
  if ("blocked" in account) return jsonError("conta_bloqueada", 403);
  const apps = await catalogForInstall(account.store, account.user, { baseUrl: getSiteUrl() });
  return NextResponse.json({
    ok: true,
    verifySha256BeforeInstall: true,
    apps,
  });
}

export async function POST(req: Request) {
  const account = await accountFromRequest(req);
  if (!account) return jsonError("não autenticado", 401);
  if ("blocked" in account) return jsonError("conta_bloqueada", 403);
  if (!originOk(req)) return jsonError("origem inválida", 403);
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonError("pedido_invalido", 400);
  }
  try {
    const app = await submitStoreApp(account.store, account.user, {
      name: String(body.name ?? body.title ?? ""),
      description: String(body.description ?? ""),
      category: String(body.category ?? ""),
      version: String(body.version ?? body.appVersion ?? ""),
      platform: body.platform ?? body.appPlatform,
      icon: typeof body.icon === "string" ? body.icon : typeof body.appIcon === "string" ? body.appIcon : null,
      fileName: typeof body.fileName === "string" ? body.fileName : null,
      fileBlobPathname: typeof body.fileBlobPathname === "string" ? body.fileBlobPathname : null,
      externalUrl: typeof body.externalUrl === "string" ? body.externalUrl : null,
      size: typeof body.size === "number" ? body.size : typeof body.fileSize === "number" ? body.fileSize : null,
      sha256: typeof body.sha256 === "string" ? body.sha256 : typeof body.fileSha256 === "string" ? body.fileSha256 : null,
    });
    return NextResponse.json({ ok: true, app }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
