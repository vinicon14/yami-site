import { formatPriceBrl, PRODUCT } from "@/lib/config";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Termos de uso",
  description: "Rascunho dos termos de uso da YAMI, para revisão antes de publicar.",
};

export default function TermosPage() {
  const price = formatPriceBrl();
  return (
    <article className="mx-auto max-w-2xl px-5 py-12 md:px-8 md:py-16">
      <p className="draft-banner">Rascunho, revisar antes de publicar.</p>
      <h1 className="font-serif text-4xl font-medium tracking-tight">Termos de uso da YAMI</h1>
      <p className="mt-4 text-sm text-muted">
        Última atualização deste rascunho: 12 de novembro de 2026.
      </p>
      <div className="prose-yami mt-8 text-sm leading-relaxed">
        <p>
          Estes termos valem para a compra e o uso da YAMI, assistente de IA para Windows.
          O responsável pelo produto é Vinicius Marques. A YAMI também aparece como
          ferramenta principal no i-Tools (i-tools.shop). Este texto ainda é um rascunho
          e precisa de revisão jurídica.
        </p>
        <h2>A compra</h2>
        <p>
          O preço é {price}, em real, pagamento único, pela licença de uso e pelo download
          do instalador da versão {PRODUCT.version}. O pagamento é processado pelo Mercado
          Pago (Pix ou cartão). A licença e o link de download só são liberados depois que
          o pagamento estiver aprovado.
        </p>
        <h2>A licença</h2>
        <p>
          A licença é pessoal e intransferível, para instalação no computador do comprador.
          Não inclui atualizações futuras a menos que isso seja dito de forma expressa numa
          versão revista destes termos. O link de download tem prazo e limite de usos.
        </p>
        <h2>O painel remoto</h2>
        <p>
          O painel no navegador serve para usar a YAMI que está no seu PC de casa. Ele não
          substitui o aplicativo e não funciona se esse computador estiver desligado. Você
          é responsável pelo pareamento, pelas aprovações e pelo que for feito a partir da
          sua sessão. Ações de arquivo e comando precisam de aprovação no próprio PC.
        </p>
        <h2>Uso aceitável</h2>
        <p>
          Você se compromete a usar a YAMI de acordo com a lei. Publicações feitas pelo
          Forage e comandos rodados no seu PC são de sua responsabilidade.
        </p>
        <h2>Isenção</h2>
        <p>
          A YAMI é oferecida no estado em que se encontra, sem garantia de resultado
          específico. Na medida permitida pela lei, a responsabilidade por falhas de
          software é limitada ao valor pago nesta compra.
        </p>
      </div>
    </article>
  );
}
