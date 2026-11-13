import Link from "next/link";
import { ACCEPTED_PAYMENT_COPY } from "@/lib/mp-checkout";
import { formatPriceBrl, PRODUCT } from "@/lib/config";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Perguntas frequentes",
  description:
    "Perguntas sobre a YAMI: o que é, preço, Windows, painel remoto, Forage e download.",
};

export default function FaqPage() {
  const price = formatPriceBrl();
  const version = PRODUCT.version;
  const items = [
    {
      q: "O que é a YAMI?",
      a: "É um assistente de IA que roda no seu Windows. Conversas, arquivos e histórico ficam no seu computador. É a ferramenta principal do i-Tools.",
    },
    {
      q: "Em quais sistemas ela roda?",
      a: `Windows 10 ou 11 de 64 bits. A versão atual do instalador é a ${version}. Não há versão para macOS, Linux ou celular neste momento.`,
    },
    {
      q: "Quanto custa?",
      a: `${price}, pagamento único. ${ACCEPTED_PAYMENT_COPY} Não é assinatura.`,
    },
    {
      q: "Como recebo o instalador?",
      a: "Depois do pagamento aprovado, você vê a chave de licença e um link de download na página de sucesso. O link expira em 24 horas e tem um limite de usos. Dá para emitir outro pela sua conta, com o e-mail da compra, enquanto o limite não tiver acabado.",
    },
    {
      q: "O histórico sai do meu computador?",
      a: "O histórico e os arquivos ficam no PC onde a YAMI está instalada. De outro computador, o painel remoto só espelha essa interface — não passa a guardar a conversa neste site.",
    },
    {
      q: "Como funciona o painel remoto?",
      a: "Você abre /painel no navegador, depois de parear com o aplicativo. A tela é a da YAMI: chat com histórico, Forage e configurações. A conexão sai do seu PC. Aprovações de arquivo e comando ficam no computador de casa.",
    },
    {
      q: "E se o PC estiver desligado?",
      a: "O painel mostra que o dispositivo está off e avisa com clareza. Nada é processado enquanto a YAMI no PC de casa não estiver aberta.",
    },
    {
      q: "O que é o Forage?",
      a: "É o agente da YAMI que cria e publica conteúdo, com as contas e os limites que você configurar. A publicação sai do aplicativo no seu PC.",
    },
  ];
  return (
    <article className="mx-auto max-w-2xl px-5 py-12 md:px-8 md:py-16">
      <p className="kicker">Perguntas</p>
      <h1 className="mt-3 font-serif text-4xl font-medium tracking-tight">Perguntas frequentes</h1>
      <dl className="mt-10 space-y-8">
        {items.map((item) => (
          <div key={item.q}>
            <dt className="text-lg font-medium">{item.q}</dt>
            <dd className="mt-2 text-sm leading-relaxed text-muted">{item.a}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-12 text-sm">
        <Link href="/requisitos" className="text-rust underline underline-offset-2">
          Ver requisitos
        </Link>
        {" · "}
        <Link href="/termos" className="text-rust underline underline-offset-2">
          Termos
        </Link>
      </p>
    </article>
  );
}
