import Link from "next/link";
import { BuyUnavailable } from "@/components/BuyUnavailable";
import { ACCEPTED_PAYMENT_COPY } from "@/lib/mp-checkout";
import { formatPriceBrl, getMpMode, salesOpen, PRODUCT } from "@/lib/config";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Comprar a YAMI",
  description: `Finalize a compra da YAMI por ${formatPriceBrl()}. ${ACCEPTED_PAYMENT_COPY}`,
  robots: { index: false, follow: false },
};

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; demo?: string; pedido?: string }>;
}) {
  const search = await searchParams;
  const price = formatPriceBrl();
  const open = salesOpen();
  const mode = getMpMode();

  return (
    <article className="mx-auto max-w-xl px-5 py-12 md:px-8 md:py-16">
      <p className="kicker">Checkout</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">Comprar a YAMI</h1>
      <p className="mt-4 text-muted">
        {price}, pagamento único. {ACCEPTED_PAYMENT_COPY}
      </p>

      {search.status === "falhou" && (
        <p className="card mt-6 px-4 py-3 text-sm" role="alert">
          O pagamento não foi concluído. Você pode tentar de novo.
        </p>
      )}
      {search.status === "pendente" && (
        <p className="card mt-6 px-4 py-3 text-sm" role="status">
          O pagamento ainda está em processamento. Se você pagou com Pix, aguarde a
          confirmação — a página de sucesso sai quando o Mercado Pago confirmar.
        </p>
      )}
      {search.demo && (
        <p className="card mt-6 px-4 py-3 text-sm" role="status">
          Este ambiente está em modo de teste e não cobra de verdade.
        </p>
      )}

      <div className="card mt-8 p-6">
        <p className="kicker">Resumo</p>
        <p className="mt-2 font-medium">YAMI {PRODUCT.version} — licença e instalador</p>
        <p className="mt-1 text-sm text-muted">Windows 10/11 x64 · {price}</p>
      </div>

      {!open ? (
        <BuyUnavailable />
      ) : (
        <form method="post" action="/api/checkout" className="mt-8 space-y-5">
          <div>
            <label htmlFor="email" className="block text-sm font-medium">
              E-mail
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="field mt-1"
            />
            <p className="mt-1 text-xs text-muted">
              Usamos este e-mail para a chave de licença e o link de download.
            </p>
          </div>
          <div>
            <label htmlFor="name" className="block text-sm font-medium">
              Nome <span className="font-normal text-muted">(opcional)</span>
            </label>
            <input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              className="field mt-1"
            />
          </div>
          <label className="flex items-start gap-2 text-sm leading-relaxed">
            <input type="checkbox" name="accepted" className="mt-1" required />
            <span>
              Li e aceito os{" "}
              <Link href="/termos" className="text-accent-text underline underline-offset-2 hover:text-accent-hover">
                termos da YAMI
              </Link>{" "}
              e a{" "}
              <Link href="/privacidade" className="text-accent-text underline underline-offset-2 hover:text-accent-hover">
                política de privacidade
              </Link>{" "}
              <span className="text-muted">(rascunhos, sujeitos a revisão)</span>.
            </span>
          </label>
          <button
            type="submit"
            className="btn-primary w-full py-2.5"
          >
            Pagar {price} com Mercado Pago
          </button>
          {mode === "production" && (
            <p className="text-xs text-muted">
              Você será levado ao Mercado Pago. Este é um pagamento real de {price}.
            </p>
          )}
        </form>
      )}

      <p className="mt-8 text-sm text-muted">
        Já comprou?{" "}
        <Link href="/entrar" className="text-accent-text underline underline-offset-2 hover:text-accent-hover">
          Entre na sua conta
        </Link>{" "}
        para ver a licença e o download.
      </p>
    </article>
  );
}
