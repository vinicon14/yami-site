"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type Device = {
  id: string;
  name: string;
  online?: boolean;
  lastSeenAt?: string | null;
  revoked?: boolean;
};

type ChatMsg = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  pendingApproval?: boolean;
};

type Tab = "conversas" | "forage" | "config";

export function PainelApp({
  user,
}: {
  user: { id: string; email: string; name: string | null };
}) {
  const [tab, setTab] = useState<Tab>("conversas");
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      id: "welcome",
      role: "system",
      text: "Este é o painel remoto da YAMI. As conversas e o Forage rodam no PC de casa. Arquivos e comandos só avançam depois da aprovação lá.",
    },
  ]);
  const [input, setInput] = useState("");
  const [forageOn, setForageOn] = useState(false);
  const [forageLog, setForageLog] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const selected = devices.find((d) => d.id === deviceId && !d.revoked);
  const online = Boolean(selected?.online);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/relay/browser", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as {
        devices?: Device[];
        messages?: Array<{ id: string; kind: string; payload: unknown }>;
      };
      if (data.devices) {
        setDevices(data.devices);
        setDeviceId((current) => current ?? data.devices!.find((d) => !d.revoked)?.id ?? null);
      }
      if (data.messages?.length) {
        setMessages((prev) => [
          ...prev,
          ...data.messages!.map((m) => ({
            id: m.id,
            role: "assistant" as const,
            text:
              typeof m.payload === "object" && m.payload && "text" in m.payload
                ? String((m.payload as { text: unknown }).text)
                : `[${m.kind}]`,
          })),
        ]);
      }
    } catch {
      /* ignore poll errors */
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 3000);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(kind: string, payload: unknown, needsLocalApproval = false) {
    setError(null);
    if (!deviceId) {
      setError("Pareie um computador primeiro.");
      return;
    }
    const res = await fetch("/api/relay/browser", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId, kind, payload, needsLocalApproval }),
    });
    const data = (await res.json()) as { error?: string; needsLocalApproval?: boolean };
    if (!res.ok) {
      setError(data.error ?? "não foi possível enviar");
      return false;
    }
    return data;
  }

  async function onChat(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput("");
    const looksLikeCommand = /^(abrir|executar|rodar|apagar|deletar|salvar arquivo)\b/i.test(text);
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", text },
      ...(looksLikeCommand
        ? [
            {
              id: crypto.randomUUID(),
              role: "system" as const,
              text: "Este pedido envolve arquivo ou comando. Ele só avança quando você aprovar no PC de casa.",
              pendingApproval: true,
            },
          ]
        : []),
    ]);
    const result = await send(
      "chat",
      { text, action: looksLikeCommand ? "command" : "chat" },
      looksLikeCommand,
    );
    if (result && !looksLikeCommand && !online) {
      /* send() already set the error if offline */
    }
  }

  async function toggleForage() {
    const next = !forageOn;
    const result = await send("forage", { action: next ? "start" : "stop" });
    if (result !== false) {
      setForageOn(next);
      setForageLog((log) => [
        ...log,
        `${new Date().toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" })} — ${next ? "pedido para ligar o Forage (no PC de casa)" : "pedido para pausar o Forage"}`,
      ]);
    }
  }

  async function confirmPair(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/pairing/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, deviceName: "PC de casa" }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(data.error ?? "não foi possível parear");
      return;
    }
    setCode("");
    void refresh();
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-2">
        <div className="flex items-center gap-3">
          <Link href="/" className="font-serif text-lg tracking-tight text-[#ece7db]">
            YAMI
          </Link>
          <span className="font-mono text-[10px] uppercase tracking-wider text-[#9a9384]">
            Painel remoto
          </span>
        </div>
        <div className="flex items-center gap-3 font-mono text-[11px]">
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${online ? "bg-[#7d9a78]" : "bg-[#9a6a4a]"}`}
            aria-hidden
          />
          <span className="text-[#9a9384]">
            {selected
              ? online
                ? `${selected.name} ligado`
                : `${selected.name} desligado`
              : "nenhum PC pareado"}
          </span>
          <Link href="/conta" className="text-[#ece7db]/70 hover:text-[#ece7db]">
            {user.email}
          </Link>
        </div>
      </header>

      {!online && (
        <div className="border-b border-[#6f4a32] bg-[#2a1c14] px-4 py-2 text-sm text-[#e8d0c0]" role="status">
          {selected
            ? "O PC de casa está desligado ou a YAMI não está aberta. Nada é processado até ela voltar."
            : "Pareie o aplicativo da YAMI no seu PC de casa para usar este painel. O código aparece no próprio programa."}
        </div>
      )}
      {error && (
        <div className="border-b border-white/10 bg-[#1c1a17] px-4 py-2 text-sm text-[#e8d0c0]" role="alert">
          {error}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <aside className="w-44 shrink-0 border-r border-white/10 bg-[#1c1a17] p-3 font-mono text-[11px] leading-7 text-[#9a9384] md:w-52">
          {(["conversas", "forage", "config"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`block w-full text-left ${tab === t ? "text-[#ece7db]" : "hover:text-[#ece7db]/80"}`}
            >
              {t === "conversas" ? "Conversas" : t === "forage" ? "Forage" : "Configurações"}
            </button>
          ))}
          <p className="mt-8 text-[10px] uppercase tracking-wider">Dispositivos</p>
          {devices.filter((d) => !d.revoked).length === 0 && (
            <p className="mt-1 leading-5">Nenhum PC pareado.</p>
          )}
          {devices
            .filter((d) => !d.revoked)
            .map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setDeviceId(d.id)}
                className={`block w-full truncate text-left ${deviceId === d.id ? "text-[#ece7db]" : ""}`}
              >
                {d.online ? "● " : "○ "}
                {d.name}
              </button>
            ))}
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          {tab === "conversas" && (
            <>
              <div className="flex-1 space-y-3 overflow-y-auto p-5">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={
                      m.role === "user"
                        ? "ml-auto max-w-[75%] bg-white/10 px-3 py-2 text-sm"
                        : m.pendingApproval
                          ? "max-w-[85%] border border-[#6f4a32] bg-[#2a1c14] px-3 py-2 text-sm text-[#e8d0c0]"
                          : "max-w-[75%] bg-white/[0.06] px-3 py-2 text-sm"
                    }
                  >
                    {m.text}
                  </div>
                ))}
                <div ref={bottom} />
              </div>
              <form onSubmit={onChat} className="border-t border-white/10 p-4">
                <div className="flex gap-2">
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={online ? "Escreva para a YAMI…" : "Ligue o PC de casa para conversar"}
                    className="flex-1 border border-white/15 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-[#9a9384]"
                  />
                  <button
                    type="submit"
                    className="border border-[#ece7db]/80 px-4 py-2 text-sm hover:bg-white/10"
                  >
                    Enviar
                  </button>
                </div>
              </form>
            </>
          )}

          {tab === "forage" && (
            <div className="flex-1 p-6">
              <h1 className="font-serif text-2xl">Forage</h1>
              <p className="mt-2 max-w-lg text-sm leading-relaxed text-[#9a9384]">
                Ligar ou pausar o Forage manda o pedido para o aplicativo no seu PC.
                A publicação sai de lá, com os limites que você já configurou.
              </p>
              <button
                type="button"
                onClick={() => void toggleForage()}
                className="mt-6 border border-[#ece7db]/80 px-4 py-2 text-sm hover:bg-white/10"
              >
                {forageOn ? "Pausar o Forage" : "Ligar o Forage"}
              </button>
              <ul className="mt-8 space-y-1 font-mono text-xs text-[#9a9384]">
                {forageLog.length === 0 && <li>Nenhuma atividade nesta sessão.</li>}
                {forageLog.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          )}

          {tab === "config" && (
            <div className="flex-1 p-6">
              <h1 className="font-serif text-2xl">Configurações</h1>
              <p className="mt-2 max-w-lg text-sm leading-relaxed text-[#9a9384]">
                As configurações da YAMI ficam no PC de casa. Aqui você pareia ou
                desconecta aparelhos. Mudanças de modelo e contas continuam no aplicativo.
              </p>
              <form onSubmit={confirmPair} className="mt-6 flex flex-wrap items-end gap-3">
                <div>
                  <label htmlFor="pair-code" className="block font-mono text-[10px] uppercase tracking-wider text-[#9a9384]">
                    Código do aplicativo
                  </label>
                  <input
                    id="pair-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    maxLength={8}
                    className="mt-1 w-40 border border-white/15 bg-transparent px-3 py-2 font-mono tracking-widest"
                  />
                </div>
                <button type="submit" className="border border-[#ece7db]/80 px-4 py-2 text-sm hover:bg-white/10">
                  Parear
                </button>
              </form>
              <p className="mt-8 text-sm">
                <Link href="/conta" className="underline underline-offset-2">
                  Gerenciar dispositivos e licença na conta
                </Link>
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
