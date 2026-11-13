import Link from "next/link";
import { BuyButton } from "./BuyButton";
import { YamiWordmark } from "./YamiWordmark";

const links = [
  { href: "/#o-que-e", label: "O que é" },
  { href: "/precos", label: "Preços" },
  { href: "/painel", label: "Painel remoto" },
  { href: "/requisitos", label: "Requisitos" },
  { href: "/faq", label: "Perguntas" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-canvas/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3 md:px-8">
        <YamiWordmark />

        <nav className="hidden items-center gap-6 text-[0.92rem] text-muted md:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="hover:text-ink transition-colors"
            >
              {l.label}
            </Link>
          ))}
          <Link href="/entrar" className="hover:text-ink transition-colors">
            Entrar
          </Link>
          <BuyButton />
        </nav>

        <details className="relative md:hidden">
          <summary className="cursor-pointer list-none text-sm text-muted after:content-none">
            Menu
          </summary>
          <div className="absolute right-0 mt-2 w-52 rounded-[14px] border border-line bg-surface p-3 shadow-[0_12px_32px_rgba(0,0,0,0.48)]">
            <nav className="flex flex-col gap-2 text-sm">
              {links.map((l) => (
                <Link key={l.href} href={l.href} className="py-1">
                  {l.label}
                </Link>
              ))}
              <Link href="/entrar" className="py-1">
                Entrar
              </Link>
              <BuyButton full className="mt-1" />
            </nav>
          </div>
        </details>
      </div>
    </header>
  );
}
