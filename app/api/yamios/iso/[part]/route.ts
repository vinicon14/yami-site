import { NextResponse } from "next/server";
import manifest from "@/lib/yamios/latest.json";
import { toPublicManifest } from "@/lib/yamios/public-manifest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Compatibilidade com clientes antigos: a ISO do YAMI OS é pública e gratuita.
 * O destino vem do manifesto versionado e validado, nunca de uma URL do usuário.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ part: string }> }) {
  const { part } = await ctx.params;
  if (!/^[1-9]\\d*$/.test(part)) {
    return NextResponse.json({ error: "parte_invalida" }, { status: 404 });
  }

  const target = toPublicManifest(manifest).iso.partes[Number(part) - 1]?.url;
  if (!target) {
    return NextResponse.json({ error: "parte_indisponivel" }, { status: 404 });
  }

  return NextResponse.redirect(target, 302);
}
