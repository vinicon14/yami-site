import { NextResponse } from "next/server";
import manifest from "@/lib/yamios/latest.json";

// Manifesto de atualização do YAMI OS, lido pelo app "Atualizações YAMI OS".
// Fonte reserva: GitHub Releases (vinicon14/yamios-releases, arquivo latest.json).
export const dynamic = "force-static";
export const revalidate = 300;

export async function GET() {
  return NextResponse.json(manifest, {
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
