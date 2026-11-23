import Link from "next/link";
import { BuyButton } from "./BuyButton";
import { MobileMenu } from "./MobileMenu";
import { YamiWordmark } from "./YamiWordmark";

const links = [
  { href: "/#o-que-e", label: "O que é" },
  { href: "/precos", label: "Preços" },
  { href: "/instalar-yami-os", label: "Instalar" },
  { href: "/painel", label: "Painel remoto" },
  { href: "/requisitos", label: "Requisitos" },
  { href: "/faq", label: "Perguntas" },
];

export function SiteHeader() {
  return (
    <header className="site-header sticky top-0 z-40 border-b border-line/80 bg-canvas/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2 md:px-8">
        <YamiWordmark />

        <nav className="desktop-nav hidden items-center gap-4 text-[0.92rem] text-muted min-[1100px]:flex" aria-label="Principal">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-ink">
              {link.label}
            </Link>
          ))}
          <Link href="/entrar" className="hover:text-ink">
            Entrar
          </Link>
          <BuyButton />
        </nav>

        <MobileMenu links={links}>
          <BuyButton full />
        </MobileMenu>
      </div>
    </header>
  );
}
