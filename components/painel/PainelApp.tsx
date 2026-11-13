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
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <header className="flex items-center justify-between border-b border-line bg-frame/80 px-4 py-2 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <Link href="/" className="inline-flex items-center gap-2 text-ink" aria-label="YAMI, página inicial">
            <img src="/yami-logo.svg" alt="" width={22} height={22} style={{ borderRadius: "20%" }} />
            <span className="text-[1.05rem] font-semibold tracking-tight">YAMI</span>
          </Link>
          <span className="kicker">Painel remoto</span>
        </div>
        <div className="flex items-center gap-3 text-[11px]">
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${online ? "bg-success" : "bg-warning"}`}
            aria-hidden
          />
          <span className="text-muted">
            {selected
              ? online
                ? `${selected.name} ligado`
                : `${selected.name} desligado`
              : "nenhum PC pareado"}
            {selected?.lastSeenAt ? ` · visto ${formatSeen(selected.lastSeenAt)}` : ""}
          </span>
          <Link href="/conta" className="text-ink-soft hover:text-ink">
            {user.email}
          </Link>
        </div>
      </header>

      {!online && (
        <div className="border-b border-warning/40 bg-[rgba(255,148,18,0.12)] px-4 py-2 text-sm text-warning" role="status">
          {selected
            ? "O PC de casa está desligado ou a YAMI não está aberta (sem sinal há mais de 30 s). Pedidos ficam na fila até ela voltar."
            : "Pareie o aplicativo da YAMI no seu PC de casa para usar este painel. O código aparece no próprio programa."}
        </div>
      )}
      {queued && online === false && (
        <div className="border-b border-line bg-surface px-4 py-2 text-sm text-accent-text" role="status">
          Mensagem na fila: será entregue quando o PC voltar a coletar.
        </div>
      )}
      {error && (
        <div className="border-b border-danger/40 bg-[rgba(253,47,59,0.16)] px-4 py-2 text-sm text-danger" role="alert">
          {error}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <aside className="w-44 shrink-0 border-r border-line bg-canvas p-3 text-[13px] leading-7 text-muted md:w-[16.5rem]">
          {(["conversas", "forage", "config"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`block w-full rounded-lg px-2 text-left ${
                tab === t
                  ? "bg-surface-raised font-medium text-accent-text"
                  : "hover:bg-control-hover hover:text-ink"
              }`}
            >
              {t === "conversas" ? "Conversas" : t === "forage" ? "Forage" : "Configurações"}
            </button>
          ))}
          <p className="mt-8 px-2 text-[10px] uppercase tracking-wider text-muted">Dispositivos</p>
          {devices.filter((d) => !d.revoked).length === 0 && (
            <p className="mt-1 px-2 leading-5">Nenhum PC pareado.</p>
          )}
          {devices
            .filter((d) => !d.revoked)
            .map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setDeviceId(d.id)}
                className={`block w-full truncate rounded-lg px-2 text-left ${
                  deviceId === d.id ? "bg-surface-raised text-ink" : "hover:text-ink"
                }`}
              >
                <span className={d.online ? "text-success" : "text-muted"}>{d.online ? "● " : "○ "}</span>
                {d.name}
              </button>
            ))}
        </aside>

        <section className="flex min-w-0 flex-1 flex-col bg-canvas">
          {tab === "conversas" && (
            <>
              <div className="flex-1 space-y-3 overflow-y-auto p-5">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={
                      m.role === "user"
                        ? "chat-bubble chat-bubble-user"
                        : m.pendingApproval
                          ? "chat-bubble max-w-[85%] border border-warning/40 bg-[rgba(255,148,18,0.12)] text-warning"
                          : m.role === "system"
                            ? "chat-bubble max-w-[85%] bg-surface text-muted"
                            : "chat-bubble chat-bubble-assistant"
                    }
                  >
                    {m.text}
                  </div>
                ))}
                <div ref={bottom} />
              </div>
              <form onSubmit={onChat} className="border-t border-line p-4">
                <div className="flex gap-2">
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={online ? "Escreva para a YAMI…" : "A mensagem vai para a fila até o PC voltar"}
                    className="field flex-1 rounded-[22px] px-4"
                  />
                  <button type="submit" className="btn-primary">
                    Enviar
                  </button>
                </div>
              </form>
            </>
          )}

          {tab === "forage" && (
            <div className="flex-1 p-6">
              <h1 className="text-2xl font-semibold">Forage</h1>
              <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted">
                Ligar ou pausar o Forage manda o pedido para o aplicativo no seu PC.
                O status e o registro ao vivo vêm de lá, depois da execução.
              </p>
              <p className="mt-4 text-xs uppercase tracking-wider text-accent-text">
                Status: {forageLabel}
              </p>
              <button
                type="button"
                onClick={() => void toggleForage()}
                className="btn-primary mt-6"
              >
                {forageOn === true ? "Pausar o Forage" : "Ligar o Forage"}
              </button>
              <p className="kicker mt-8">Registro ao vivo</p>
              <ul className="mt-2 space-y-1 font-mono text-xs text-muted">
                {forageLog.length === 0 && <li>Nenhuma atividade recebida do PC ainda.</li>}
                {forageLog.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          )}

          {tab === "config" && (
            <div className="flex-1 p-6">
              <h1 className="text-2xl font-semibold">Configurações</h1>
              <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted">
                As configurações da YAMI ficam no PC de casa. Aqui você pareia ou
                desconecta aparelhos. Mudanças de modelo e contas continuam no aplicativo.
              </p>
              <form onSubmit={confirmPair} className="mt-6 flex flex-wrap items-end gap-3">
                <div>
                  <label htmlFor="pair-code" className="kicker">
                    Código do aplicativo
                  </label>
                  <input
                    id="pair-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    maxLength={8}
                    className="field mt-1 w-40 font-mono tracking-widest"
                  />
                </div>
                <button type="submit" className="btn-primary">
                  Parear
                </button>
              </form>
              <p className="mt-8 text-sm">
                <Link href="/conta" className="text-accent-text underline underline-offset-2 hover:text-accent-hover">
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
