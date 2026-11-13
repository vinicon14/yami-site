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
  const fill = variant === "dark";
  return (
    <article
      className={
        fill
          ? "mx-auto flex min-h-full max-w-xl flex-col justify-center px-6 py-16"
          : "mx-auto max-w-xl px-5 py-12 md:px-8 md:py-16"
      }
    >
      <p className="kicker">Licença</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
        {LICENSE_MISSING_TITLE}
      </h1>
      <p className="mt-4 text-sm leading-relaxed text-muted">{LICENSE_MISSING_HINT}</p>
      <p className="mt-8">
        <Link href="/checkout" className="btn-primary">
          Comprar por R$ 20,00
        </Link>
      </p>
    </article>
  );
}
