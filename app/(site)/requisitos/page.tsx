import { BuyButton } from "@/components/BuyButton";
import { PRODUCT } from "@/lib/config";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Requisitos",
  description:
    "A YAMI roda em Windows 10 ou 11 de 64 bits. Veja o que você precisa para instalar e usar o painel remoto.",
};

export default function RequisitosPage() {
  return (
    <article className="mx-auto max-w-2xl px-5 py-12 md:px-8 md:py-16">
      <p className="kicker">Requisitos</p>
      <h1 className="mt-3 font-serif text-4xl font-medium tracking-tight">O que você precisa</h1>
      <ul className="mt-8 list-disc space-y-3 pl-5 text-sm leading-relaxed">
        <li>
          <strong className="font-medium">Sistema:</strong> Windows 10 ou Windows 11, versão de
          64 bits (x64). A YAMI {PRODUCT.version} não instala em 32 bits, em ARM, nem em
          macOS ou Linux.
        </li>
        <li>
          <strong className="font-medium">Computador próprio:</strong> o aplicativo fica neste
          PC. É dele que sai o painel remoto e o Forage.
        </li>
        <li>
          <strong className="font-medium">Internet:</strong> necessária para o pagamento, o
          download, o pareamento do painel e, se você escolher, para APIs de modelo. Um modelo
          local pode funcionar sem rede, depois de baixado, conforme a configuração.
        </li>
        <li>
          <strong className="font-medium">Outro computador:</strong> qualquer um com navegador
          atual, só para o painel remoto — desde que o PC de casa esteja ligado, com a YAMI
          aberta e pareada.
        </li>
      </ul>
      <p className="mt-8 text-sm text-muted">
        Não informamos números de memória ou disco que não tenhamos medido. Se uma versão
        futura exigir algo a mais, isso entra nesta página.
      </p>
      <div className="mt-8">
        <BuyButton />
      </div>
    </article>
  );
}
