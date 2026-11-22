"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export const dynamic = "force-dynamic";

function ParearContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    const res = await fetch("/api/pairing/confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(data.error ?? "Não foi possível confirmar.");
      setBusy(false);
      return;
    }
    setMessage("Computador ativado. Você já pode fechar esta página.");
    router.refresh();
  }

  return (
    <main className="mx-auto max-w-xl px-5 py-12 md:px-8 md:py-16">
      <p className="kicker">Pareamento</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">Ativar computador</h1>
      <p className="mt-4 text-sm leading-relaxed text-muted">
        Clique no botão abaixo para confirmar o pareamento deste computador com sua conta YAMI.
      </p>
      <button className="btn-primary mt-6" disabled={busy || !token} onClick={() => void confirm()}>
        {busy ? "Confirmando…" : "Confirmar pareamento"}
      </button>
      {message ? <p className="mt-4 text-sm" role="status">{message}</p> : null}
    </main>
  );
}

export default function ParearPage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-xl px-5 py-12">Carregando…</main>}>
      <ParearContent />
    </Suspense>
  );
}
