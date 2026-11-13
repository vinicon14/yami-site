import Link from "next/link";

export function PainelEmBreve({ email }: { email: string }) {
  return (
    <article className="mx-auto flex min-h-full max-w-xl flex-col justify-center px-6 py-16 text-[#ece7db]">
      <p className="text-xs uppercase tracking-[0.18em] text-[#c4a484]">Painel remoto</p>
      <h1 className="mt-3 font-serif text-3xl font-medium tracking-tight">
        Acesso remoto em breve
      </h1>
      <p className="mt-4 text-sm leading-relaxed text-[#b6b0a3]">
        O painel remoto precisa de um relé gerenciado (Ably, Pusher ou um servidor
        pequeno na Fly ou Railway) para funcionar neste site na Vercel. Isso ainda
        não foi ligado — nada quebra, e você não precisa configurar agora.
      </p>
      <p className="mt-4 text-sm leading-relaxed text-[#b6b0a3]">
        Quando o relé estiver escolhido, você vai parear o PC de casa com um código
        de 6 caracteres, pela conta {email}.
      </p>
      <p className="mt-8 flex flex-wrap gap-3 text-sm">
        <Link
          href="/conta"
          className="inline-flex border border-[#ece7db] px-4 py-2 hover:border-[#c4a484] hover:text-[#c4a484]"
        >
          Ir para a conta
        </Link>
        <Link
          href="/"
          className="inline-flex px-4 py-2 text-[#b6b0a3] underline underline-offset-2"
        >
          Voltar ao início
        </Link>
      </p>
    </article>
  );
}
