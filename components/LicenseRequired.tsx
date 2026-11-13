"use client";

import Link from "next/link";
import {
  LICENSE_MISSING_HINT,
  LICENSE_MISSING_TITLE,
} from "@/lib/license-messages";

export function LicenseRequired({
  variant = "light",
}: {
  variant?: "light" | "dark";
}) {
  const dark = variant === "dark";
  return (
    <article
      className={
        dark
          ? "mx-auto flex min-h-full max-w-xl flex-col justify-center px-6 py-16 text-[#ece7db]"
          : "mx-auto max-w-xl px-5 py-12 md:px-8 md:py-16"
      }
    >
      <p className={dark ? "text-xs uppercase tracking-[0.18em] text-[#c4a484]" : "kicker"}>
        Licença
      </p>
      <h1
        className={
          dark
            ? "mt-3 font-serif text-3xl font-medium tracking-tight"
            : "mt-3 font-serif text-4xl font-medium tracking-tight"
        }
      >
        {LICENSE_MISSING_TITLE}
      </h1>
      <p
        className={
          dark
            ? "mt-4 text-sm leading-relaxed text-[#b6b0a3]"
            : "mt-4 text-sm leading-relaxed text-muted"
        }
      >
        {LICENSE_MISSING_HINT}
      </p>
      <p className="mt-8">
        <Link
          href="/checkout"
          className={
            dark
              ? "inline-flex border border-[#ece7db] bg-[#ece7db] px-4 py-2 text-sm text-[#141210] hover:bg-[#c4a484] hover:border-[#c4a484]"
              : "inline-flex border border-ink bg-ink px-4 py-2 text-sm text-paper hover:bg-rust hover:border-rust"
          }
        >
          Comprar por R$ 20,00
        </Link>
      </p>
    </article>
  );
}
