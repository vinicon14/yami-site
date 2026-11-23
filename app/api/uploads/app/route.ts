import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getStore } from "@/lib/db";
import { getSessionUser, readSessionCookie } from "@/lib/auth";
import { desktopSession } from "@/app/api/desktop/_shared";
import { userHasPaidLicense } from "@/lib/license-gate";
import { clientIp, jsonError, sameOrigin } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
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
  if (!(await userHasPaidLicense(current.email, store))) return jsonError("licença necessária", 403);
  const limited = rateLimit(`app-upload:${current.userId}`, 20, 60 * 60 * 1000);
  if (!limited.ok) return jsonError("muitas tentativas", 429);

  let body: HandleUploadBody;
  try { body = (await req.json()) as HandleUploadBody; } catch { return jsonError("pedido inválido", 400); }

  try {
    const result = await handleUpload({
      request: req,
      body,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const raw = JSON.parse(clientPayload ?? "{}");
        const check = validateAppFile({ name: raw.filename, size: raw.size, sha256: raw.sha256 });
        if (!check.ok) throw new Error(check.reason);
        return {
          allowedContentTypes: ["application/octet-stream", "application/x-executable"],
          maximumSizeInBytes: 500 * 1024 * 1024,
          addRandomSuffix: false,
          allowOverwrite: false,
          cacheControlMaxAge: 31536000,
          tokenPayload: JSON.stringify({ userId: current.userId, email: current.email, ip: clientIp(req) }),
        };
      },
    });
    return NextResponse.json(result);
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "não foi possível autorizar o envio", 400);
  }
}
