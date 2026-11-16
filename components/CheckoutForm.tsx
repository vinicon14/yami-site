"use client";

import Link from "next/link";
import { useState } from "react";
import { SAME_COLLECTOR_WARNING } from "@/lib/mp-checkout";

type Props = {
  price: string;
  production: boolean;
  defaultEmail?: string;
  defaultName?: string;
};

export function CheckoutForm({ price, production, defaultEmail, defaultName }: Props) {
  const [submitting, setSubmitting] = useState(false);

  return (
    <form
      method="post"
      action="/api/checkout"
      className="mt-8 space-y-5"
      onSubmit={(event) => {
        if (submitting) {
          event.preventDefault();
          return;
        }
        setSubmitting(true);
      }}
    >
      <div>
        <label htmlFor="email" className="block text-sm font-medium">
          E-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          defaultValue={defaultEmail}
          className="field mt-1"
        />
        <p className="mt-1 text-xs text-muted">
          Usamos este e-mail para a chave de licença e o link de download.
        </p>
      </div>
      <div>
        <label htmlFor="name" className="block text-sm font-medium">
          Nome <span className="font-normal text-muted">(opcional)</span>
        </label>
        <input
          id="name"
          name="name"
          type="text"
          autoComplete="name"
          defaultValue={defaultName}
          className="field mt-1"
        />
      </div>
      <label className="flex items-start gap-2 text-sm leading-relaxed">
        <input type="checkbox" name="accepted" className="mt-1" required />
        <span>
          Li e aceito os{" "}
          <Link href="/termos" className="text-accent-text underline underline-offset-2 hover:text-accent-hover">
            termos da YAMI
          </Link>{" "}
          e a{" "}
          <Link href="/privacidade" className="text-accent-text underline underline-offset-2 hover:text-accent-hover">
            política de privacidade
          </Link>{" "}
          <span className="text-muted">(rascunhos, sujeitos a revisão)</span>.
        </span>
      </label>
      <button type="submit" className="btn-primary w-full py-2.5" disabled={submitting}>
        {submitting ? "Redirecionando ao Mercado Pago…" : `Pagar ${price} com Mercado Pago`}
      </button>
      {production && (
        <p className="text-xs text-muted">
          Você será levado ao Mercado Pago. Este é um pagamento real de {price}.
        </p>
      )}
      <p className="text-xs text-muted">{SAME_COLLECTOR_WARNING}</p>
    </form>
  );
}
