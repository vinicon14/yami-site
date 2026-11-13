import { NextResponse } from "next/server";
import { formatPriceBrl, getMpMode, getPriceBrl, salesOpen, PRODUCT } from "@/lib/config";
import { getInstallerSource } from "@/lib/installer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const source = getInstallerSource();
  return NextResponse.json({
    product: PRODUCT.name,
    version: PRODUCT.version,
    price: formatPriceBrl(),
    priceBrl: getPriceBrl(),
    salesOpen: salesOpen(),
    mpMode: getMpMode(),
    installerReady: source.ok,
  });
}
