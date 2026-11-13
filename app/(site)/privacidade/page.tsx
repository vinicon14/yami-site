import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacidade",
  description: "Rascunho da política de privacidade da YAMI, para revisão antes de publicar.",
};

export default function PrivacidadePage() {
  return (
    <article className="mx-auto max-w-2xl px-5 py-12 md:px-8 md:py-16">
      <p className="draft-banner">Rascunho, revisar antes de publicar.</p>
      <h1 className="font-serif text-4xl font-medium tracking-tight">Privacidade da YAMI</h1>
      <p className="mt-4 text-sm text-muted">
        Última atualização deste rascunho: 12 de novembro de 2026.
      </p>
      <div className="prose-yami mt-8 text-sm leading-relaxed">
        <p>
          Este texto descreve o que este site trata quando você compra ou usa a YAMI pela
          web. É um rascunho e precisa de revisão.
        </p>
        <h2>O que coletamos na compra</h2>
        <p>
          E-mail, nome se você informar, dados do pagamento processados pelo Mercado Pago,
          identificadores do pedido, a chave de licença e registros do download (quando o
          link é usado). Não guardamos o número completo do cartão — isso fica com o
          Mercado Pago.
        </p>
        <h2>Conta</h2>
        <p>
          Se você cria uma conta, o e-mail e a senha (esta, armazenada só como um hash)
          servem para mostrar suas licenças, dispositivos e o painel. O histórico das
          conversas da YAMI não é o conteúdo desta conta: ele fica no seu PC.
        </p>
        <h2>O que fica no seu PC</h2>
        <p>
          Conversas, arquivos e configurações da YAMI ficam no computador onde o
          aplicativo está instalado. O painel remoto espelha essa interface; não é o
          destino de armazenamento do histórico.
        </p>
        <h2>Pareamento e registro de acesso</h2>
        <p>
          Quando você pareia um computador, guardamos um identificador do aparelho, a
          data e um registro das ações feitas pelo painel (ligar, enviar mensagem,
          pedir aprovação). Você pode desconectar um aparelho a qualquer hora.
        </p>
        <h2>Compartilhamento</h2>
        <p>
          Usamos o Mercado Pago para cobrar, e podemos usar um serviço de e-mail para
          enviar a licença, se isso estiver ligado. Não vendemos os seus dados.
        </p>
        <h2>Contato</h2>
        <p>
          Para pedidos relacionados a estes dados, use os canais de contato do i-Tools
          ou o e-mail informado na compra.
        </p>
      </div>
    </article>
  );
}
