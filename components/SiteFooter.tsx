import Link from "next/link";
import { YAMI_OS_NAME } from "@/lib/yamios/brand";
import { YamiWordmark } from "./YamiWordmark";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line bg-frame text-ink">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-12 md:grid-cols-3 md:px-8">
        <div>
          <YamiWordmark href="/" size={32} />
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted">
            Seu agente de IA para Windows. Roda no seu computador.
          </p>
        </div>
        <div>
          <p className="kicker">Páginas</p>
          <ul className="mt-3 space-y-1 text-sm text-ink-soft">
            <li>
              <Link href="/precos" className="footer-link">
                Preços
              </Link>
            </li>
            <li>
              <Link href="/instalar-yami-os" className="footer-link">
                Instalar o {YAMI_OS_NAME}
              </Link>
            </li>
            <li>
              <Link href="/faq" className="footer-link">
                Perguntas frequentes
              </Link>
            </li>
            <li>
              <Link href="/requisitos" className="footer-link">
                Requisitos
              </Link>
            </li>
            <li>
              <Link href="/painel" className="footer-link">
                Painel remoto
              </Link>
            </li>
            <li>
              <Link href="/termos" className="footer-link">
                Termos de uso
              </Link>
            </li>
            <li>
              <Link href="/privacidade" className="footer-link">
                Privacidade
              </Link>
            </li>
          </ul>
        </div>
        <div className="text-sm leading-relaxed text-muted">
          <p className="kicker">Contato</p>
          <p className="mt-3">Um produto de Vinicius Marques.</p>
          <p className="mt-3 text-xs text-muted/80">
            Textos legais em rascunho, sujeitos a revisão antes da venda em volume.
          </p>
        </div>
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4 text-xs text-muted md:px-8">
          <p>© 2026 Vinicius Marques.</p>
        </div>
      </div>
    </footer>
  );
}
