"use client";

import { CopyButton } from "./CopyButton";
import { LicenseRequired } from "./LicenseRequired";
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

export function pairingButtonText(hasPending: boolean): string {
  return hasPending ? "Reenviar link" : "Enviar link de ativação";
}

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
  const [downloadToken, setDownloadToken] = useState<string | null>(null);
  const [downloadExpires, setDownloadExpires] = useState<string | null>(null);
  const [apkReady, setApkReady] = useState(true);
  const [deviceName, setDeviceName] = useState("PC de casa");
  const [hasPendingPairing, setHasPendingPairing] = useState(false);

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
    const data = (await res.json()) as {
      error?: string;
      token?: string;
      expiresAt?: string;
      apkComingSoon?: boolean;
    };
    if (!res.ok) {
      setMsg(data.error ?? "não foi possível emitir o link");
      return;
    }
    setDownloadToken(data.token ?? null);
    setDownloadExpires(data.expiresAt ?? null);
    setApkReady(!data.apkComingSoon);
    setMsg("Links emitidos. Valem 24 horas e têm um limite de usos.");
  }

  async function sendPairingLink() {
    setMsg(null);
    const res = await fetch("/api/pairing/email/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "", deviceName }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setMsg(data.error ?? "Não foi possível enviar o link.");
      return;
    }
    setHasPendingPairing(true);
    setMsg("Link enviado. Verifique seu e-mail e clique no link para ativar este computador.");
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
        <p className="card px-4 py-3 text-sm" role="status">
          {msg}
        </p>
      )}

      <section>
        <h2 className="text-2xl font-semibold">Licenças</h2>
        {licenses.length === 0 ? (
          <div className="mt-4">
            <LicenseRequired />
          </div>
        ) : (
          <ul className="mt-4 space-y-4">
            {licenses.map((l) => (
              <li key={l.id} className="card p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <code className="font-mono text-sm tracking-wide">{l.key}</code>
                  <CopyButton value={l.key} />
                </div>
                <button
                  type="button"
                  onClick={() => newLink(l.orderId)}
                  className="btn-ghost mt-3 px-3 py-1.5"
                >
                  Emitir link de download
                </button>
              </li>
            ))}
          </ul>
        )}
        {downloadToken && (
          <ul className="mt-4 space-y-2 text-sm">
            <li>
              <a
                href={`/api/download?token=${downloadToken}&file=setup`}
                className="text-accent-text underline underline-offset-2 hover:text-accent-hover"
              >
                Baixar instalador Windows
              </a>
            </li>
            <li>
              <a
                href={`/api/download?token=${downloadToken}&file=portable`}
                className="text-accent-text underline underline-offset-2 hover:text-accent-hover"
              >
                Baixar Windows portátil
              </a>
            </li>
            <li>
              {apkReady ? (
                <a
                  href={`/api/download?token=${downloadToken}&file=apk`}
                  className="text-accent-text underline underline-offset-2 hover:text-accent-hover"
                >
                  Baixar aplicativo Android (APK)
                </a>
              ) : (
                <span className="text-muted">APK em breve</span>
              )}
            </li>
            {downloadExpires ? (
              <li className="text-xs text-muted">
                Expira em{" "}
                {new Date(downloadExpires).toLocaleString("pt-BR", {
                  timeZone: "America/Sao_Paulo",
                })}{" "}
                (horário de Brasília).
              </li>
            ) : null}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-2xl font-semibold">Pedidos</h2>
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
        <h2 className="text-2xl font-semibold">Computadores pareados</h2>
        <p className="mt-2 text-sm text-muted">
          No aplicativo da YAMI, peça um código de pareamento e digite-o aqui.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="deviceName" className="block text-xs text-muted">
              Nome do PC
            </label>
            <input
              id="deviceName"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              className="field mt-1 w-44"
            />
          </div>
          <button type="button" onClick={() => void sendPairingLink()} className="btn-primary">
            {pairingButtonText(hasPendingPairing)}
          </button>
        </div>
        <ul className="mt-6 space-y-3">
          {devices.map((d) => (
            <li key={d.id} className="card flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
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
                  className="btn-ghost px-3 py-1.5 text-xs"
                >
                  Desconectar
                </button>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm">
          <Link href="/painel" className="text-accent-text underline underline-offset-2 hover:text-accent-hover">
            Abrir o painel remoto
          </Link>
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold">Registro de acesso</h2>
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
        className="btn-ghost"
      >
        Sair
      </button>
    </div>
  );
}
