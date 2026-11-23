"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string };

export function MobileMenu({ links, children }: { links: Item[]; children: React.ReactNode }) {
  const pathname = usePathname();
  const [openPath, setOpenPath] = useState<string | null>(null);
  const open = openPath === pathname;
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenPath(null);
    };
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpenPath(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative min-[1100px]:hidden">
      <button
        type="button"
        className="menu-button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpenPath(open ? null : pathname)}
      >
        <span className="menu-glyph" data-open={open ? "true" : "false"} aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        {open ? "Fechar" : "Menu"}
      </button>
      {open ? (
        <nav id={panelId} className="mobile-panel" aria-label="Menu">
          {links.map((link) => (
            <Link key={link.href} href={link.href} onClick={() => setOpenPath(null)}>
              {link.label}
            </Link>
          ))}
          <Link href="/entrar" onClick={() => setOpenPath(null)}>
            Entrar
          </Link>
          <div className="pt-1" onClick={() => setOpenPath(null)}>
            {children}
          </div>
        </nav>
      ) : null}
    </div>
  );
}
