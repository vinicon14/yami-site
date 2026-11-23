import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getStore } from "@/lib/db";
import { getSessionUser, readSessionCookie } from "@/lib/auth";
import { desktopSession } from "@/app/api/desktop/_shared";
import { clientIp, jsonError, sameOrigin } from "@/lib/http";
import { takeUploadQuota } from "@/lib/quota";
import { validateAppFile } from "@/lib/app-submissions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function currentUser(req: Request) {
  const current = await getSessionUser(readSessionCookie(req));
  if (current) return { userId: current.user.id, email: current.user.email };
  const auth = await desktopSession(req);
  if (!auth) return null;
  return { userId: auth.session.user.id, email: auth.session.user.email };
}

export async function POST(req: Request) {
  const current = await currentUser(req);
  if (!current) return jsonError("não autenticado", 401);
  if (!sameOrigin(req)) return jsonError("origem inválida", 403);
  const store = await getStore();
  const account = await store.getUserById(current.userId);
  if (account?.status === "bloqueado") return jsonError("conta bloqueada", 403);

  let body: HandleUploadBody;
  try { body = (await req.json()) as HandleUploadBody; } catch { return jsonError("pedido inválido", 400); }

  try {
    const result = await handleUpload({
      request: req,
      body,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const raw = JSON.parse(clientPayload ?? "{}");
        const check = validateAppFile({
          name: raw.filename,
          size: raw.size,
          sha256: raw.sha256,
          platform: raw.platform === "windows" ? "windows" : "linux",
        });
        if (!check.ok) throw new Error(check.reason);
        const size = Number(raw.size);
        if (!Number.isSafeInteger(size)) throw new Error("tamanho_invalido");
        const quota = await takeUploadQuota(store, current.userId, size);
        if (!quota.ok) throw new Error(quota.code);
        return {
          allowedContentTypes: ["application/octet-stream", "application/x-executable"],
          maximumSizeInBytes: size,
          addRandomSuffix: false,
          allowOverwrite: false,
          cacheControlMaxAge: 31536000,
          tokenPayload: JSON.stringify({ userId: current.userId, email: current.email, ip: clientIp(req) }),
        };
      },
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "não foi possível autorizar o envio";
    if (message === "cota_diaria_excedida") return jsonError(message, 429);
    return jsonError(message, 400);
  }
}
