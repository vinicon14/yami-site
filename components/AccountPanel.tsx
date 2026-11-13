"use client";

import { CopyButton } from "./CopyButton";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";

type License = { id: string; key: string; orderId: string; createdAt: string };
type Order = {
  id: string;
  status: string;
  amountBrl: number;
  paidAt: string | null;
  createdAt: string;
};
type Device = {
  id: string;
  name: string;
  createdAt: string;
  lastSeenAt: string | null;
  revoked: boolean;
};
type Audit = { id: string; action: string; createdAt: string; meta: string | null };

export function AccountPanel({
  licenses,
  orders,
  devices,
  audit,
}: {
  licenses: License[];
  orders: Order[];
  devices: Device[];
  audit: Audit[];
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [deviceName, setDeviceName] = useState("PC de casa");

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  async function newLink(orderId: string) {
    setMsg(null);
    const res = await fetch("/api/auth/download-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId }),
    });
    const data = (await res.json()) as { error?: string; url?: string };
    if (!res.ok) {
      setMsg(data.error ?? "não foi possível emitir o link");
      return;
    }
    setDownloadUrl(data.url ?? null);
    setMsg("Link emitido. Ele vale 24 horas.");
  }

  async function confirm() {
    setMsg(null);
    const res = await fetch("/api/pairing/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, deviceName }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setMsg(data.error ?? "não foi possível parear");
      return;
    }
    setCode("");
    setMsg("Computador pareado. Você já pode abrir o painel remoto.");
    router.refresh();
  }

  async function revoke(deviceId: string) {
    setMsg(null);
    const res = await fetch("/api/pairing/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setMsg(data.error ?? "não foi possível desconectar");
      return;
    }
    router.refresh();
  }

  return (
    <div className="mt-10 space-y-12">
      {msg && (
        <p className="border border-line bg-paper-2 px-4 py-3 text-sm" role="status">
          {msg}
        </p>
      )}

      <section>
        <h2 className="font-serif text-2xl font-medium">Licenças</h2>
        {licenses.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            Nenhuma licença ligada a este e-mail. Se você já comprou, use o mesmo
            e-mail da compra, ou{" "}
            <Link href="/checkout" className="text-rust underline underline-offset-2">
              compre a YAMI
            </Link>
            .
          </p>
        ) : (
          <ul className="mt-4 space-y-4">
            {licenses.map((l) => (
              <li key={l.id} className="border border-line p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <code className="font-mono text-sm tracking-wide">{l.key}</code>
                  <CopyButton value={l.key} />
                </div>
                <button
                  type="button"
                  onClick={() => newLink(l.orderId)}
                  className="mt-3 border border-line px-3 py-1.5 text-sm hover:border-ink"
                >
                  Emitir link de download
                </button>
              </li>
            ))}
          </ul>
        )}
        {downloadUrl && (
          <p className="mt-3 text-sm">
            <a href={downloadUrl} className="text-rust underline underline-offset-2">
              Baixar o instalador
            </a>
          </p>
        )}
      </section>

      <section>
        <h2 className="font-serif text-2xl font-medium">Pedidos</h2>
        {orders.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Nenhum pedido neste e-mail.</p>
        ) : (
          <ul className="mt-4 space-y-2 text-sm">
            {orders.map((o) => (
              <li key={o.id} className="flex flex-wrap justify-between gap-2 border-b border-line py-2">
                <span className="font-mono text-xs text-muted">{o.id.slice(0, 8)}</span>
                <span>{o.status === "paid" ? "pago" : o.status}</span>
                <span>
                  {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(o.amountBrl)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="font-serif text-2xl font-medium">Computadores pareados</h2>
        <p className="mt-2 text-sm text-muted">
          No aplicativo da YAMI, peça um código de pareamento e digite-o aqui.
        </p>
        <form
          className="mt-4 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void confirm();
          }}
        >
          <div>
            <label htmlFor="code" className="block text-xs text-muted">
              Código
            </label>
            <input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="mt-1 w-36 border border-line bg-paper px-3 py-2 font-mono text-sm tracking-widest"
              maxLength={8}
              autoComplete="off"
            />
          </div>
          <div>
            <label htmlFor="deviceName" className="block text-xs text-muted">
              Nome do PC
            </label>
            <input
              id="deviceName"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              className="mt-1 w-44 border border-line bg-paper px-3 py-2 text-sm"
            />
          </div>
          <button type="submit" className="border border-ink bg-ink px-3 py-2 text-sm text-paper hover:bg-rust hover:border-rust">
            Parear
          </button>
        </form>
        <ul className="mt-6 space-y-3">
          {devices.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 border border-line p-3 text-sm">
              <div>
                <p className="font-medium">{d.name}</p>
                <p className="text-xs text-muted">
                  {d.revoked ? "desconectado" : "ativo"}
                  {d.lastSeenAt
                    ? ` · visto ${new Date(d.lastSeenAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`
                    : ""}
                </p>
              </div>
              {!d.revoked && (
                <button
                  type="button"
                  onClick={() => revoke(d.id)}
                  className="border border-line px-3 py-1.5 text-xs hover:border-ink"
                >
                  Desconectar
                </button>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm">
          <Link href="/painel" className="text-rust underline underline-offset-2">
            Abrir o painel remoto
          </Link>
        </p>
      </section>

      <section>
        <h2 className="font-serif text-2xl font-medium">Registro de acesso</h2>
        {audit.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Nenhuma ação registrada ainda.</p>
        ) : (
          <ul className="mt-4 space-y-1 font-mono text-xs text-muted">
            {audit.map((a) => (
              <li key={a.id}>
                {new Date(a.createdAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}{" "}
                — {a.action}
                {a.meta ? ` (${a.meta})` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>

      <button
        type="button"
        onClick={() => void logout()}
        className="border border-line px-4 py-2 text-sm hover:border-ink"
      >
        Sair
      </button>
    </div>
  );
}
