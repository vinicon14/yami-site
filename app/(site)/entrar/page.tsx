import { AuthForm } from "@/components/AuthForm";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Entrar",
  description: "Entre ou crie sua conta da YAMI para ver a licença, o download e o painel remoto.",
  robots: { index: false, follow: false },
};

export default async function EntrarPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <article className="mx-auto max-w-md px-5 py-12 md:px-8 md:py-16">
      <p className="kicker">Conta</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">
        Entrar na YAMI
      </h1>
      <p className="mt-4 text-sm leading-relaxed text-muted">
        Use o mesmo e-mail da compra para ver a licença e o download. Depois de
        entrar, você pode parear o aplicativo do PC de casa e abrir o painel remoto.
      </p>
      <AuthForm next={next && next.startsWith("/") ? next : "/conta"} />
    </article>
  );
}
