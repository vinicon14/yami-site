import { NextResponse } from "next/server";
import { formatPriceBrl, getMpMode, getPriceBrl, getRelayProvider, salesOpen, PRODUCT } from "@/lib/config";
import { getCurrentManifest } from "@/lib/release-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const manifest = await getCurrentManifest();
  const files = {
    setup: Boolean(manifest?.files.setup),
    portable: Boolean(manifest?.files.portable),
    apk: Boolean(manifest?.files.apk),
  };
  const installerReady = files.setup || files.portable;
  const relayProvider = getRelayProvider();
  const relayReady = relayProvider === "ably" || relayProvider === "pusher";
  return NextResponse.json({
    product: PRODUCT.name,
    version: manifest?.version ?? PRODUCT.version,
    price: formatPriceBrl(),
    priceBrl: getPriceBrl(),
    salesOpen: salesOpen(),
    mpMode: getMpMode(),
    installerReady,
    files,
    apkComingSoon: !files.apk,
    relayReady,
    publishedAt: manifest?.publishedAt ?? null,
  });
}
