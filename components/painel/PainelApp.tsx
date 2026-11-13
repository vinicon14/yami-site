"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type Device = {
  id: string;
  name: string;
  online?: boolean;
  lastSeenAt?: string | null;
  revoked?: boolean;
  createdAt?: string;
};

type RelayMessage = {
  id: string;
  seq?: number;
  kind: string;
  payload: unknown;
  from?: "browser" | "desktop";
  needsLocalApproval?: boolean;
  createdAt?: string;
};

type ChatMsg = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  pendingApproval?: boolean;
};

type Tab = "conversas" | "forage" | "config";

function payloadText(payload: unknown, fallback = ""): string {
  if (typeof payload === "string") return payload;
  if (typeof payload === "object" && payload !== null) {
    const p = payload as Record<string, unknown>;
    for (const key of ["text", "line", "message", "summary", "log"]) {
      if (typeof p[key] === "string") return String(p[key]);
    }
  }
  return fallback;
}

function chatFromRelay(m: RelayMessage): ChatMsg | null {
  if (m.kind === "forage") return null;
  if (m.kind === "status" && !payloadText(m.payload)) return null;
  const text = payloadText(m.payload, `[${m.kind}]`);
  const role: ChatMsg["role"] =
    m.from === "browser" ? "user" : m.kind === "chat" ? "assistant" : "system";
  return {
    id: m.id,
    role,
    text,
    pendingApproval: Boolean(m.needsLocalApproval),
  };
}

function forageFromRelay(
  m: RelayMessage,
): { running?: boolean; line?: string } | null {
  if (m.kind !== "forage" && m.kind !== "status") return null;
  if (typeof m.payload !== "object" || m.payload === null) {
    return m.kind === "forage" ? { line: payloadText(m.payload) } : null;
  }
  const p = m.payload as Record<string, unknown>;
  const action = String(p.action ?? "");
  let running: boolean | undefined;
  if (typeof p.running === "boolean") running = p.running;
  else if (action === "started" || action === "start") running = true;
  else if (action === "stopped" || action === "stop") running = false;
  const line = payloadText(p, action && m.kind === "forage" ? action : "");
  if (running === undefined && !line) return null;
  return { running, line: line || undefined };
}

function formatSeen(lastSeenAt?: string | null): string {
  if (!lastSeenAt) return "";
  const t = new Date(lastSeenAt).getTime();
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 30) return "agora";
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  return new Date(lastSeenAt).toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });
}

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
  const [forageOn, setForageOn] = useState<boolean | null>(null);
  const [forageLog, setForageLog] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const afterSeq = useRef(0);
  const seenIds = useRef(new Set<string>(["welcome"]));

  const selected = devices.find((d) => d.id === deviceId && !d.revoked);
  const online = Boolean(selected?.online);

  const applyDevices = useCallback((list?: Device[]) => {
    if (!list) return;
    setDevices(list);
    setDeviceId((current) => current ?? list.find((d) => !d.revoked)?.id ?? null);
  }, []);

  const applyMessages = useCallback((incoming: RelayMessage[], replaceChat: boolean) => {
    if (replaceChat) {
      seenIds.current = new Set(["welcome"]);
    }
    const chats: ChatMsg[] = [];
    const logs: string[] = [];
    let forageRunning: boolean | undefined;
    for (const m of incoming) {
      if (seenIds.current.has(m.id)) continue;
      seenIds.current.add(m.id);
      const forage = forageFromRelay(m);
      if (forage) {
        if (forage.running !== undefined) forageRunning = forage.running;
        if (forage.line) {
          const ts = m.createdAt
            ? new Date(m.createdAt).toLocaleTimeString("pt-BR", {
                timeZone: "America/Sao_Paulo",
              })
            : new Date().toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" });
          logs.push(`${ts} — ${forage.line}`);
        }
      }
      const chat = chatFromRelay(m);
      if (chat) chats.push(chat);
    }
    if (forageRunning !== undefined) setForageOn(forageRunning);
    if (replaceChat) {
      setMessages((prev) => [prev[0]!, ...chats]);
      setForageLog(logs);
    } else {
      if (chats.length) setMessages((prev) => [...prev, ...chats]);
      if (logs.length) setForageLog((prev) => [...prev, ...logs]);
    }
  }, []);

  const loadHistory = useCallback(
    async (id: string, signal?: AbortSignal) => {
      const res = await fetch(`/api/relay/painel/pull?deviceId=${encodeURIComponent(id)}&history=1`, {
        cache: "no-store",
        signal,
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        devices?: Device[];
        messages?: RelayMessage[];
        lastSeq?: number;
        online?: boolean;
        lastSeenAt?: string | null;
      };
      applyDevices(data.devices);
      afterSeq.current = data.lastSeq ?? 0;
      applyMessages(data.messages ?? [], true);
    },
    [applyDevices, applyMessages],
  );

  useEffect(() => {
    if (!deviceId) {
      const ac = new AbortController();
      void (async () => {
        const res = await fetch("/api/relay/painel/pull", { cache: "no-store", signal: ac.signal }).catch(
          () => null,
        );
        if (!res || !res.ok) return;
        const data = (await res.json()) as { devices?: Device[] };
        applyDevices(data.devices);
      })();
      return () => ac.abort();
    }

    const ac = new AbortController();
    afterSeq.current = 0;
    void (async () => {
      try {
        await loadHistory(deviceId, ac.signal);
      } catch {
        if (ac.signal.aborted) return;
      }
      while (!ac.signal.aborted) {
        try {
          const url = `/api/relay/painel/pull?deviceId=${encodeURIComponent(deviceId)}&afterSeq=${afterSeq.current}&waitMs=20000`;
          const res = await fetch(url, { cache: "no-store", signal: ac.signal });
          if (res.status === 401) {
            window.location.href = "/entrar?next=/painel";
            return;
          }
          if (!res.ok) {
            await new Promise((r) => setTimeout(r, 2000));
            continue;
          }
          const data = (await res.json()) as {
            devices?: Device[];
            messages?: RelayMessage[];
            lastSeq?: number;
          };
          applyDevices(data.devices);
          if (typeof data.lastSeq === "number" && data.lastSeq > afterSeq.current) {
            afterSeq.current = data.lastSeq;
          }
          applyMessages(data.messages ?? [], false);
        } catch (err) {
          if (ac.signal.aborted) return;
          await new Promise((r) => setTimeout(r, 2000));
          void err;
        }
      }
    })();
    return () => ac.abort();
  }, [deviceId, applyDevices, applyMessages, loadHistory]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(kind: string, payload: unknown, needsLocalApproval = false) {
    setError(null);
    setQueued(false);
    if (!deviceId) {
      setError("Pareie um computador primeiro.");
      return false;
    }
    const res = await fetch("/api/relay/painel/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId, kind, payload, needsLocalApproval }),
    });
    const data = (await res.json()) as {
      error?: string;
      needsLocalApproval?: boolean;
      queued?: boolean;
      online?: boolean;
      message?: RelayMessage;
    };
    if (!res.ok) {
      setError(data.error ?? "não foi possível enviar");
      return false;
    }
    if (data.message) {
      seenIds.current.add(data.message.id);
      if (typeof data.message.seq === "number" && data.message.seq > afterSeq.current) {
        afterSeq.current = data.message.seq;
      }
    }
    if (data.queued) {
      setQueued(true);
    }
    return data;
  }

  async function onChat(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput("");
    const looksLikeCommand = /^(abrir|executar|rodar|apagar|deletar|salvar arquivo)\b/i.test(text);
    const localId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      { id: localId, role: "user", text },
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
    seenIds.current.add(localId);
    await send(
      "chat",
      { text, action: looksLikeCommand ? "command" : "chat" },
      looksLikeCommand,
    );
  }

  async function toggleForage() {
    const next = forageOn !== true;
    const result = await send("forage", { action: next ? "start" : "stop" });
    if (result) {
      const ts = new Date().toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" });
      setForageLog((log) => [
        ...log,
        `${ts} — pedido enviado para ${next ? "ligar" : "pausar"} o Forage no PC de casa`,
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
    const data = (await res.json()) as { error?: string; device?: { id: string } };
    if (!res.ok) {
      setError(data.error ?? "não foi possível parear");
      return;
    }
    setCode("");
    if (data.device?.id) setDeviceId(data.device.id);
  }

  const forageLabel =
    forageOn === true ? "ligado no PC" : forageOn === false ? "pausado no PC" : "status ainda não chegou";

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
            {selected?.lastSeenAt ? ` · visto ${formatSeen(selected.lastSeenAt)}` : ""}
          </span>
          <Link href="/conta" className="text-[#ece7db]/70 hover:text-[#ece7db]">
            {user.email}
          </Link>
        </div>
      </header>

      {!online && (
        <div className="border-b border-[#6f4a32] bg-[#2a1c14] px-4 py-2 text-sm text-[#e8d0c0]" role="status">
          {selected
            ? "O PC de casa está desligado ou a YAMI não está aberta (sem sinal há mais de 30 s). Pedidos ficam na fila até ela voltar."
            : "Pareie o aplicativo da YAMI no seu PC de casa para usar este painel. O código aparece no próprio programa."}
        </div>
      )}
      {queued && online === false && (
        <div className="border-b border-white/10 bg-[#1c1a17] px-4 py-2 text-sm text-[#c4a484]" role="status">
          Mensagem na fila: será entregue quando o PC voltar a coletar.
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
                    placeholder={online ? "Escreva para a YAMI…" : "A mensagem vai para a fila até o PC voltar"}
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
                O status e o registro ao vivo vêm de lá, depois da execução.
              </p>
              <p className="mt-4 font-mono text-xs uppercase tracking-wider text-[#c4a484]">
                Status: {forageLabel}
              </p>
              <button
                type="button"
                onClick={() => void toggleForage()}
                className="mt-6 border border-[#ece7db]/80 px-4 py-2 text-sm hover:bg-white/10"
              >
                {forageOn === true ? "Pausar o Forage" : "Ligar o Forage"}
              </button>
              <p className="mt-8 font-mono text-[10px] uppercase tracking-wider text-[#9a9384]">
                Registro ao vivo
              </p>
              <ul className="mt-2 space-y-1 font-mono text-xs text-[#9a9384]">
                {forageLog.length === 0 && <li>Nenhuma atividade recebida do PC ainda.</li>}
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
