import Link from "next/link";
import { BuyButton } from "@/components/BuyButton";
import { IsoDownloader } from "@/components/IsoDownloader";
import { formatPriceBrl } from "@/lib/config";
import { ACCEPTED_PAYMENT_COPY } from "@/lib/mp-checkout";
import { YAMI_OS_FREE_ISO_FROM, YAMI_OS_NAME, yamiOsPromoCopy } from "@/lib/yamios/brand";
import { isVersionAtLeast, type IsoManifestSource } from "@/lib/yamios/iso-downloader";

export function YamiOsPromo({ source }: { source: IsoManifestSource }) {
  const copy = yamiOsPromoCopy(isVersionAtLeast(source.versao, YAMI_OS_FREE_ISO_FROM));
  const price = formatPriceBrl();

  return (
    <section className="os-promo" aria-labelledby="yami-os-promo">
      <div className="relative mx-auto grid max-w-6xl min-w-0 items-start gap-8 px-5 py-12 md:px-8 md:py-16 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="reveal min-w-0">
          <p className="kicker">{YAMI_OS_NAME}</p>
          <h2 id="yami-os-promo" className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            {copy.title}
          </h2>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted sm:text-base">
            {copy.windowsOffer} Pagamento único de {price}. {ACCEPTED_PAYMENT_COPY}
          </p>
          <div className="cta-row mt-6">
            <BuyButton />
            <Link data-magnetic href="/precos" className="btn-ghost">
              Ver o preço
            </Link>
          </div>
        </div>
        <div className="reveal min-w-0">
          <IsoDownloader source={source} />
        </div>
      </div>
    </section>
  );
}
