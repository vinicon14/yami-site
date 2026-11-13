import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { getAdminFromRequest } from "@/lib/admin";
import {
  allowedContentTypes,
  assertUploadPathname,
  MAX_RELEASE_BYTES,
  parseClientUploadPayload,
  validateUploadMeta,
} from "@/lib/admin-release";
import { clientIp, jsonError, sameOrigin } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const admin = await getAdminFromRequest(req);
  if (!admin.ok) return jsonError(admin.error, admin.status);
  if (!sameOrigin(req)) return jsonError("origem inválida", 403);

  const limited = rateLimit(`admin-upload:${admin.user.id}`, 30, 60 * 60 * 1000);
  if (!limited.ok) return jsonError("muitas tentativas, tente mais tarde", 429);

  let body: HandleUploadBody;
  try {
    body = (await req.json()) as HandleUploadBody;
  } catch {
    return jsonError("pedido inválido", 400);
  }

  try {
    const result = await handleUpload({
      request: req,
      body,
      onBeforeGenerateToken: async (pathname, clientPayload, multipart) => {
        if (!multipart) {
          throw new Error("o envio precisa ser multipart");
        }
        const raw = parseClientUploadPayload(clientPayload);
        const meta = validateUploadMeta({
          kind: raw.kind ?? "",
          filename: raw.filename ?? "",
          version: raw.version ?? "",
          size: raw.size ?? 0,
          sha256: raw.sha256,
        });
        if (!meta.ok) throw new Error(meta.error);
        const pathError = assertUploadPathname(pathname, meta);
        if (pathError) throw new Error(pathError);
        return {
          allowedContentTypes: allowedContentTypes(meta.kind),
          maximumSizeInBytes: MAX_RELEASE_BYTES,
          addRandomSuffix: false,
          allowOverwrite: false,
          cacheControlMaxAge: 31536000,
          validUntil: Date.now() + 2 * 60 * 60 * 1000,
          tokenPayload: JSON.stringify({
            userId: admin.user.id,
            email: admin.user.email,
            kind: meta.kind,
            ip: clientIp(req),
          }),
        };
      },
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "não foi possível autorizar o envio";
    return jsonError(message, 400);
  }
}
