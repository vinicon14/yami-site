"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function authError(error: string): string {
  if (error === "limite_ip_cadastro") {
    return "Muitas contas criadas a partir desta rede hoje. Tente amanhã.";
  }
  return error;
}

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
        setError(authError(data.error ?? "não foi possível entrar"));
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
      <div className="mb-6 flex gap-2 text-sm">
        <button
          type="button"
          onClick={() => setMode("login")}
          className={`inline-flex min-h-11 items-center px-3 ${mode === "login" ? "text-ink font-medium underline underline-offset-4 decoration-accent" : "text-muted hover:text-ink"}`}
        >
          Entrar
        </button>
        <button
          type="button"
          onClick={() => setMode("register")}
          className={`inline-flex min-h-11 items-center px-3 ${mode === "register" ? "text-ink font-medium underline underline-offset-4 decoration-accent" : "text-muted hover:text-ink"}`}
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
              className="field mt-1"
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
            className="field mt-1"
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
            className="field mt-1"
          />
          {mode === "register" && (
            <p className="mt-1 text-xs text-muted">Pelo menos 8 caracteres.</p>
          )}
        </div>
        {error && (
          <p className="rounded-lg border border-danger/40 bg-[rgba(253,47,59,0.16)] px-3 py-2 text-sm text-danger" role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="btn-primary w-full py-2.5 disabled:opacity-60"
        >
          {pending ? "Aguarde…" : mode === "login" ? "Entrar" : "Criar conta"}
        </button>
      </form>
    </div>
  );
}
