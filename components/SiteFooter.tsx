import Link from "next/link";
import { getItoolsUrl } from "@/lib/config";

export function SiteFooter() {
  const itools = getItoolsUrl();
  return (
    <footer className="mt-auto border-t border-line bg-forest text-paper">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-12 md:grid-cols-3 md:px-8">
        <div>
          <p className="font-serif text-2xl tracking-tight">YAMI</p>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-paper/70">
            Seu agente de IA para Windows. Roda no seu computador. Também é a
            ferramenta principal do{" "}
            <a href={itools} className="underline underline-offset-2 hover:text-paper">
              i-Tools
            </a>
            .
          </p>
        </div>
        <div>
          <p className="kicker text-paper/50">Páginas</p>
          <ul className="mt-3 space-y-2 text-sm text-paper/80">
            <li>
              <Link href="/precos" className="hover:underline">
                Preços
              </Link>
            </li>
            <li>
              <Link href="/faq" className="hover:underline">
                Perguntas frequentes
              </Link>
            </li>
            <li>
              <Link href="/requisitos" className="hover:underline">
                Requisitos
              </Link>
            </li>
            <li>
              <Link href="/painel" className="hover:underline">
                Painel remoto
              </Link>
            </li>
            <li>
              <Link href="/termos" className="hover:underline">
                Termos de uso
              </Link>
            </li>
            <li>
              <Link href="/privacidade" className="hover:underline">
                Privacidade
              </Link>
            </li>
          </ul>
        </div>
        <div className="text-sm leading-relaxed text-paper/70">
          <p className="kicker text-paper/50">Contato</p>
          <p className="mt-3">
            Um produto de Vinicius Marques, também no{" "}
            <a href={itools} className="underline underline-offset-2 hover:text-paper">
              i-tools.shop
            </a>
            .
          </p>
          <p className="mt-3 text-xs text-paper/50">
            Textos legais em rascunho, sujeitos a revisão antes da venda em volume.
          </p>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4 text-xs text-paper/50 md:px-8">
          <p>© 2026 Vinicius Marques.</p>
        </div>
      </div>
    </footer>
  );
}
