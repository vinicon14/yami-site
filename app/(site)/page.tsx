import { ScreenshotFrame } from "@/components/ScreenshotFrame";
import { BuyButton } from "@/components/BuyButton";
import { ACCEPTED_PAYMENT_COPY } from "@/lib/mp-checkout";
import { formatPriceBrl, getPriceBrl, PRODUCT, getItoolsUrl } from "@/lib/config";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const price = formatPriceBrl();
  const version = PRODUCT.version;
  const itools = getItoolsUrl();
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "YAMI — seu agente de IA",
    operatingSystem: "Windows 10, Windows 11",
    applicationCategory: "UtilitiesApplication",
    offers: {
      "@type": "Offer",
      price: getPriceBrl().toFixed(2),
      priceCurrency: "BRL",
    },
    description:
      "Assistente de IA que roda no Windows. Conversa, publica com o Forage e pode ser usado de outro computador pelo navegador.",
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <article>
        <header className="border-b border-line">
          <div className="mx-auto max-w-6xl px-5 pb-14 pt-12 md:px-8 md:pb-20 md:pt-16">
            <p className="kicker">
              Ferramenta principal do i-Tools · {PRODUCT.platform}
            </p>
            <h1 className="mt-5 max-w-3xl font-serif text-4xl font-medium leading-[1.1] tracking-tight sm:text-5xl md:text-6xl">
              YAMI — seu agente de IA
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
              Um assistente que roda no seu Windows, no seu computador. Conversas,
              arquivos e histórico ficam aí. O Forage cria e publica conteúdo. E de
              outro computador, pelo navegador, você vê a mesma interface — enquanto
              o programa continua no seu PC.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <BuyButton />
              <Link
                href="/painel"
                className="border border-line px-4 py-2 text-sm hover:border-ink"
              >
                Ver o painel remoto
              </Link>
              <p className="font-mono text-xs text-muted">
                Pagamento único · {ACCEPTED_PAYMENT_COPY} · versão {version}
              </p>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-6xl px-5 py-12 md:px-8 md:py-16">
          <ScreenshotFrame
            title={`YAMI ${version}`}
            caption="Espaço reservado para uma captura real da YAMI. O desenho abaixo é um esquema da interface, não uma fotografia."
          >
            <div className="grid min-h-56 grid-cols-[7rem_1fr] md:grid-cols-[11rem_1fr]">
              <div className="border-r border-white/10 p-3 font-mono text-[10px] leading-6 text-white/40">
                <p>Conversas</p>
                <p>Forage</p>
                <p>Configurações</p>
                <p className="mt-6">Reunião</p>
                <p>Artigo</p>
              </div>
              <div className="flex flex-col justify-end gap-2 p-4">
                <div className="ml-auto h-8 w-2/5 rounded-sm bg-white/10" />
                <div className="h-12 w-3/5 rounded-sm bg-white/15" />
                <div className="mt-2 h-8 w-full rounded-sm border border-white/15" />
              </div>
            </div>
          </ScreenshotFrame>
        </div>

        <section
          id="o-que-e"
          className="mx-auto max-w-6xl scroll-mt-24 px-5 pb-16 md:px-8"
          aria-labelledby="o-que-e-title"
        >
          <div className="grid gap-12 md:grid-cols-3">
            <div>
              <p className="kicker">01 — No seu PC</p>
              <h2 id="o-que-e-title" className="mt-3 font-serif text-2xl font-medium leading-tight">
                Local, no seu Windows
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                A YAMI instala no seu computador. Histórico, arquivos e configurações
                ficam lá. Não é um chat que mora só na nuvem: o programa é seu e roda
                onde você mandar.
              </p>
            </div>
            <div>
              <p className="kicker">02 — Forage</p>
              <h2 className="mt-3 font-serif text-2xl font-medium leading-tight">
                Cria e publica conteúdo
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                O Forage é o agente da YAMI para texto e publicação, com as contas e
                os limites que você configurar. A publicação sai do aplicativo no seu
                PC, não de um servidor solto.
              </p>
            </div>
            <div>
              <p className="kicker">03 — De outro PC</p>
              <h2 className="mt-3 font-serif text-2xl font-medium leading-tight">
                A mesma tela, no navegador
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                No painel remoto você conversa, vê o Forage e as configurações — a
                interface da YAMI, não um resumo. A conexão sai do seu PC. Se ele
                estiver desligado, o painel avisa. Arquivos e comandos continuam
                precisando de aprovação no computador de casa.
              </p>
            </div>
          </div>
        </section>

        <section className="border-t border-line bg-paper-2">
          <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-14 md:flex-row md:items-end md:justify-between md:px-8">
            <div>
              <p className="kicker">Preço</p>
              <h2 className="mt-3 font-serif text-3xl font-medium tracking-tight">
                {price}, uma vez.
              </h2>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
                Licença e instalador, pagamento único. {ACCEPTED_PAYMENT_COPY} Sem
                assinatura. Depois do pagamento aprovado, você recebe a chave e um
                link de download que vale 24 horas.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <BuyButton />
              <Link
                href="/precos"
                className="border border-line px-4 py-2 text-sm hover:border-ink"
              >
                Ver o que está incluso
              </Link>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-14 md:px-8">
          <p className="kicker">Também no i-Tools</p>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
            A YAMI é a ferramenta principal do{" "}
            <a href={itools} className="text-rust underline underline-offset-2">
              i-Tools
            </a>
            . As outras ferramentas do i-Tools continuam gratuitas. A compra, a
            conta e o painel remoto ficam neste site.
          </p>
        </section>
      </article>
    </>
  );
}
