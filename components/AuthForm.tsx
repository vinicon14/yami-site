"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AuthForm({ next = "/conta" }: { next?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(e.currentTarget);
    const body = {
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      name: String(form.get("name") ?? ""),
    };
    try {
      const res = await fetch(mode === "login" ? "/api/auth/login" : "/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "não foi possível entrar");
        setPending(false);
        return;
      }
      router.push(next);
      router.refresh();
    } catch {
      setError("falha de rede, tente de novo");
      setPending(false);
    }
  }

  return (
    <div className="mt-8">
      <div className="mb-6 flex gap-4 text-sm">
        <button
          type="button"
          onClick={() => setMode("login")}
          className={mode === "login" ? "underline underline-offset-4" : "text-muted"}
        >
          Entrar
        </button>
        <button
          type="button"
          onClick={() => setMode("register")}
          className={mode === "register" ? "underline underline-offset-4" : "text-muted"}
        >
          Criar conta
        </button>
      </div>
      <form onSubmit={onSubmit} className="space-y-4">
        {mode === "register" && (
          <div>
            <label htmlFor="name" className="block text-sm font-medium">
              Nome <span className="font-normal text-muted">(opcional)</span>
            </label>
            <input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              className="mt-1 w-full border border-line bg-paper px-3 py-2 text-sm"
            />
          </div>
        )}
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
            className="mt-1 w-full border border-line bg-paper px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium">
            Senha
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            className="mt-1 w-full border border-line bg-paper px-3 py-2 text-sm"
          />
          {mode === "register" && (
            <p className="mt-1 text-xs text-muted">Pelo menos 8 caracteres.</p>
          )}
        </div>
        {error && (
          <p className="border border-line bg-paper-2 px-3 py-2 text-sm text-danger" role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="w-full border border-ink bg-ink px-4 py-2.5 text-sm text-paper hover:bg-rust hover:border-rust disabled:opacity-60"
        >
          {pending ? "Aguarde…" : mode === "login" ? "Entrar" : "Criar conta"}
        </button>
      </form>
    </div>
  );
}
