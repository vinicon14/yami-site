import { ScreenshotFrame } from "@/components/ScreenshotFrame";
import { BuyButton } from "@/components/BuyButton";
import { YamiOsPromo } from "@/components/YamiOsPromo";
import { ACCEPTED_PAYMENT_COPY } from "@/lib/mp-checkout";
import { formatPriceBrl, getPriceBrl, PRODUCT } from "@/lib/config";
import { serializeJsonLd } from "@/lib/json-ld";
import { YAMI_OS_NAME } from "@/lib/yamios/brand";
import yamiOsManifest from "@/lib/yamios/latest.json";
import Link from "next/link";

export const dynamic = "force-dynamic";

const features = [
  {
    id: "recurso-pc",
    kicker: "01 — No seu PC",
    title: "Local, no seu Windows",
    body: "A YAMI instala no seu computador. Histórico, arquivos e configurações ficam lá. Não é um chat que mora só na nuvem: o programa é seu e roda onde você mandar.",
  },
  {
    id: "recurso-forage",
    kicker: "02 — Forage",
    title: "Cria e publica conteúdo",
    body: "O Forage é o agente da YAMI para texto e publicação, com as contas e os limites que você configurar. A publicação sai do aplicativo no seu PC, não de um servidor solto.",
  },
  {
    id: "recurso-remoto",
    kicker: "03 — De outro PC",
    title: "A mesma tela, no navegador",
    body: "No painel remoto você conversa, vê o Forage e as configurações — a interface da YAMI, não um resumo. A conexão sai do seu PC. Se ele estiver desligado, o painel avisa. Arquivos e comandos continuam precisando de aprovação no computador de casa.",
  },
] as const;

export default function HomePage() {
  const price = formatPriceBrl();
  const version = PRODUCT.version;
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
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <article>
        <header className="hero">
          <div className="hero-bg" aria-hidden="true">
            <div className="hero-grid" />
            <div className="hero-orb hero-orb-a" />
            <div className="hero-orb hero-orb-b" />
            <svg className="hero-mark" viewBox="0 0 240 240">
              <polyline className="chevron" points="52 100 78 118 52 136" />
              <polyline className="chevron chevron-b" points="188 100 162 118 188 136" />
            </svg>
          </div>
          <div className="relative mx-auto max-w-6xl px-5 pb-14 pt-12 md:px-8 md:pb-20 md:pt-16">
            <p className="kicker enter">{PRODUCT.platform}</p>
            <h1 className="enter enter-2 mt-5 max-w-3xl text-4xl font-semibold leading-[1.1] tracking-tight text-balance sm:text-5xl md:text-6xl">
              <span className="text-gradient">YAMI</span> — seu agente de IA
            </h1>
            <p className="enter enter-3 mt-6 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
              Um assistente que roda no seu Windows, no seu computador. Conversas,
              arquivos e histórico ficam aí. O Forage cria e publica conteúdo. E de
              outro computador, pelo navegador, você vê a mesma interface — enquanto
              o programa continua no seu PC.
            </p>
            <div className="cta-row enter enter-4 mt-8">
              <BuyButton />
              <Link data-magnetic href="/painel" className="btn-ghost">
                Ver o painel remoto
              </Link>
              <Link data-magnetic href="/instalar-yami-os" className="btn-ghost">
                Instalar o {YAMI_OS_NAME}
              </Link>
            </div>
            <p className="mt-4 font-mono text-xs leading-relaxed text-muted">
              Pagamento único · {ACCEPTED_PAYMENT_COPY} · versão {version}
            </p>
          </div>
        </header>

        <YamiOsPromo source={yamiOsManifest} />

        <div className="home-stage mx-auto max-w-6xl px-5 py-12 md:px-8 md:py-16">
          <div className="tilt-stage" data-parallax="0.035">
            <ScreenshotFrame
              tilt
              title={`YAMI ${version}`}
              caption="Espaço reservado para uma captura real da YAMI. O desenho abaixo é um esquema da interface, não uma fotografia."
            >
              <div className="mock-shell">
                <div className="border-r border-line bg-canvas p-3 text-[12px] leading-7 text-muted">
                  <p className="nav-conversas text-accent-text font-medium">Conversas</p>
                  <p className="nav-forage">Forage</p>
                  <p className="nav-config">Configurações</p>
                  <p className="mt-6 text-[10px] uppercase tracking-wider text-muted/80">Recentes</p>
                  <p className="rounded-lg bg-surface-raised px-2 text-ink-soft">Reunião</p>
                  <p className="px-2">Artigo</p>
                </div>
                <div className="flex min-w-0 flex-col justify-end gap-2 bg-canvas p-4">
                  <p className="mock-remote-note">A mesma tela, no navegador</p>
                  <div className="mock-bubble chat-bubble chat-bubble-user w-full max-w-[16rem] sm:w-2/5">
                    Agendar a publicação
                  </div>
                  <div className="mock-bubble mock-bubble-late chat-bubble chat-bubble-assistant w-full max-w-sm sm:w-3/5">
                    Posso deixar isso com o Forage no seu PC. A aprovação continua aí.
                  </div>
                  <div className="mt-2 h-10 w-full rounded-[22px] border border-line bg-surface" />
                </div>
              </div>
            </ScreenshotFrame>
          </div>

          <section
            id="o-que-e"
            className="scroll-mt-24 pt-12 md:pt-16"
            aria-labelledby="o-que-e-title"
          >
            <fieldset className="min-w-0 border-0 p-0">
              <legend className="sr-only">O que é</legend>
              <div className="grid gap-4 md:grid-cols-3 md:gap-5">
                {features.map((feature, index) => (
                  <div key={feature.id} className="feature-slot reveal" style={{ transitionDelay: `${index * 70}ms` }}>
                    <input
                      id={feature.id}
                      className="feature-radio"
                      type="radio"
                      name="recurso"
                      defaultChecked={index === 0}
                    />
                    <label htmlFor={feature.id} className="feature-card">
                      <span className="kicker">{feature.kicker}</span>
                      <span
                        className="feature-title"
                        role="heading"
                        aria-level={2}
                        id={index === 0 ? "o-que-e-title" : undefined}
                      >
                        {feature.title}
                      </span>
                      <span className="feature-body">{feature.body}</span>
                    </label>
                  </div>
                ))}
              </div>
            </fieldset>
          </section>
        </div>

        <section className="relative overflow-hidden border-t border-line bg-surface">
          <div className="hero-orb hero-orb-price" aria-hidden="true" />
          <div className="relative mx-auto flex max-w-6xl flex-col gap-8 px-5 py-14 md:flex-row md:items-end md:justify-between md:px-8">
            <div className="reveal min-w-0">
              <p className="kicker">Preço</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-balance">
                {price}, uma vez.
              </h2>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
                Licença e instalador, pagamento único. {ACCEPTED_PAYMENT_COPY} Sem
                assinatura. Depois do pagamento aprovado, você recebe a chave e um
                link de download que vale 24 horas.
              </p>
            </div>
            <div className="cta-row reveal">
              <BuyButton />
              <Link data-magnetic href="/precos" className="btn-ghost">
                Ver o que está incluso
              </Link>
              <Link data-magnetic href="/instalar-yami-os" className="btn-ghost">
                Instalar o {YAMI_OS_NAME}
              </Link>
            </div>
          </div>
        </section>
      </article>
    </>
  );
}
