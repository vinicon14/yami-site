import Link from "next/link";
import { BuyButton } from "./BuyButton";

const links = [
  { href: "/#o-que-e", label: "O que é" },
  { href: "/precos", label: "Preços" },
  { href: "/painel", label: "Painel remoto" },
  { href: "/requisitos", label: "Requisitos" },
  { href: "/faq", label: "Perguntas" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-paper/92 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3 md:px-8">
        <Link
          href="/"
          className="font-serif text-xl tracking-tight text-ink"
          aria-label="YAMI, página inicial"
        >
          YAMI
        </Link>

        <nav className="hidden items-center gap-6 text-[0.92rem] text-ink-soft md:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="hover:text-ink underline-offset-4 hover:underline"
            >
              {l.label}
            </Link>
          ))}
          <Link href="/entrar" className="hover:text-ink underline-offset-4 hover:underline">
            Entrar
          </Link>
          <BuyButton />
        </nav>

        <details className="relative md:hidden">
          <summary className="cursor-pointer list-none text-sm text-ink-soft after:content-none">
            Menu
          </summary>
          <div className="absolute right-0 mt-2 w-52 border border-line bg-paper p-3 shadow-sm">
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
