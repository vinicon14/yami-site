import { NextResponse } from "next/server";
import manifest from "@/lib/yamios/latest.json";
import { toPublicManifest } from "@/lib/yamios/public-manifest";

// Manifesto de atualização do YAMI OS, lido pelo app "Atualizações YAMI OS".
// A URL do pacote é derivada de `arquivo` em lib/yamios/latest.json.
// Fonte reserva: GitHub Releases (vinicon14/yamios-releases, arquivo latest.json).
export const dynamic = "force-static";
export const revalidate = 300;

export async function GET() {
  return NextResponse.json(toPublicManifest(manifest), {
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
