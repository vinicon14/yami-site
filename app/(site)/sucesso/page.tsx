import { CopyButton } from "@/components/CopyButton";
import { DownloadButtons } from "@/components/DownloadButtons";
import { reconcileFromReturn } from "@/lib/fulfill";
import { getCurrentManifest } from "@/lib/release-store";
import { toPublicManifest } from "@/lib/release";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Compra concluída",
  robots: { index: false, follow: false },
};

export default async function SucessoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const q = await searchParams;
  const pick = (k: string) => {
    const v = q[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const orderId = pick("external_reference") ?? pick("pedido");
  const paymentId = pick("payment_id") ?? pick("collection_id") ?? pick("paymentId");

  const result = await reconcileFromReturn({
    orderId,
    paymentId,
  });

  if ("error" in result) {
    return (
      <article className="mx-auto max-w-xl px-5 py-12 md:px-8 md:py-16">
        <p className="kicker">Pagamento</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">
          {result.pending ? "Aguardando confirmação" : "Não foi possível liberar"}
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-muted">{result.error}.</p>
        <p className="mt-6 text-sm">
          Se você já pagou, aguarde uns instantes e atualize esta página. O Mercado
          Pago avisa o site quando o pagamento é aprovado. Se o problema continuar,
          escreva para nós com o e-mail da compra.
        </p>
        <p className="mt-8 text-sm">
          <Link href="/checkout" className="text-accent-text underline underline-offset-2 hover:text-accent-hover">
            Voltar ao checkout
          </Link>
        </p>
      </article>
    );
  }

  const manifest = await getCurrentManifest();
  const publicManifest = manifest ? toPublicManifest(manifest) : null;

  return (
    <article className="mx-auto max-w-xl px-5 py-12 md:px-8 md:py-16">
      <p className="kicker">Pagamento aprovado</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">
        Sua YAMI está pronta
      </h1>
      <p className="mt-4 text-sm leading-relaxed text-muted">
        Guarde a chave de licença. O link de download vale 24 horas e tem um
        limite de usos. Depois, dá para emitir outro pela{" "}
        <Link href="/conta" className="text-accent-text underline underline-offset-2 hover:text-accent-hover">
          sua conta
        </Link>
        , com o mesmo e-mail da compra.
      </p>

      <div className="card mt-8 p-5">
        <p className="kicker">Chave de licença</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <code className="font-mono text-sm tracking-wide">{result.license.key}</code>
          <CopyButton value={result.license.key} />
        </div>
      </div>

      {result.downloadToken ? (
        <DownloadButtons
          token={result.downloadToken}
          manifest={publicManifest}
          expiresAt={result.expiresAt}
        />
      ) : (
        <p className="card mt-6 px-4 py-3 text-sm">
          O limite de downloads deste pedido foi atingido, ou o instalador ainda
          não foi publicado neste ambiente. Sua licença está reservada. Entre na
          conta ou tente mais tarde.
        </p>
      )}

      <p className="mt-8 text-sm text-muted">
        Crie uma conta com o e-mail {result.order.email} para ver a licença de novo
        e parear o painel remoto.
      </p>
      <p className="mt-3 text-sm">
        <Link href="/entrar" className="text-accent-text underline underline-offset-2 hover:text-accent-hover">
          Criar conta ou entrar
        </Link>
      </p>
    </article>
  );
}
