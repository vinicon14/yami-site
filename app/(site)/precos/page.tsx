import { BuyButton } from "@/components/BuyButton";
import { ACCEPTED_PAYMENT_COPY } from "@/lib/mp-checkout";
import { formatPriceBrl, PRODUCT } from "@/lib/config";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return {
    title: "Preço da YAMI",
    description: `Licença e instalador da YAMI por ${formatPriceBrl()}, pagamento único. ${ACCEPTED_PAYMENT_COPY}`,
  };
}

export default function PrecosPage() {
  const price = formatPriceBrl();
  return (
    <article className="mx-auto max-w-2xl px-5 py-12 md:px-8 md:py-16">
      <p className="kicker">Preço</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">Uma licença, um pagamento.</h1>
      <p className="mt-4 text-lg text-muted">
        Sem assinatura e sem plano escondido. Você paga uma vez, baixa o instalador e usa a
        YAMI no seu Windows.
      </p>

      <div className="card mt-10 p-8">
        <p className="kicker">YAMI {PRODUCT.version}</p>
        <p className="mt-3 text-5xl font-semibold tracking-tight">{price}</p>
        <p className="mt-2 text-sm text-muted">pagamento único, em real</p>
        <ul className="mt-6 space-y-2 text-sm leading-relaxed">
          <li>Instalador para Windows 10 ou 11 de 64 bits</li>
          <li>Chave de licença após o pagamento aprovado</li>
          <li>Link de download com prazo (24 horas) e limite de tentativas</li>
          <li>Painel remoto no navegador, ligado ao seu PC</li>
          <li>Agente Forage para criar e publicar conteúdo</li>
        </ul>
        <p className="mt-6 text-sm text-muted">{ACCEPTED_PAYMENT_COPY}</p>
        <div className="mt-8">
          <BuyButton />
        </div>
      </div>
    </article>
  );
}
