"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type AdminApp = {
  id: string;
  name: string;
  slug: string;
  visibility: string;
  platform: string;
  reviewNote: string | null;
  verified: boolean;
  owner: { id: string; email: string; name: string | null; status: string } | null;
  authorVersion: { version: string; fileSha256: string; externalUrl: string | null } | null;
  publicVersion: { version: string } | null;
  openReports: { id: string; reason: string }[];
};

export function AdminAppsPanel() {
  const router = useRouter();
  const [apps, setApps] = useState<AdminApp[]>([]);
  const [note, setNote] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");

  async function load() {
    const res = await fetch("/api/admin/apps");
    const data = await res.json().catch(() => ({}));
    if (res.ok) setApps(data.apps ?? []);
  }

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/apps", { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : { apps: [] }))
      .then((data) => setApps(data.apps ?? []))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  async function act(id: string, action: string) {
    setMessage("");
    const res = await fetch(`/api/admin/apps/${id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, note: note[id] ?? "" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(String(data.error ?? "Não foi possível atualizar."));
      return;
    }
    setMessage("Loja atualizada.");
    await load();
    router.refresh();
  }

  const queue = [...apps].sort((a, b) => Number(b.visibility === "em_revisao") - Number(a.visibility === "em_revisao"));

  return (
    <section className="card mx-auto mt-8 max-w-3xl p-6">
      <h2 className="text-2xl font-semibold">Loja de apps</h2>
      <p className="mt-2 text-sm text-muted">
        Aprovar torna a versão atual pública. Uma atualização de app já público só chega aos outros depois de nova aprovação. Retirar tira o app de todo mundo. Banir bloqueia a conta e retira os apps.
      </p>
      {message ? <p className="mt-3 text-sm" role="status">{message}</p> : null}
      <ul className="mt-5 space-y-5">
        {queue.map((app) => (
          <li key={app.id} className="border-b border-line pb-5 text-sm">
            <p className="font-medium">{app.name}</p>
            <p className="mt-1 text-xs text-muted">
              {app.visibility} · {app.platform} · {app.authorVersion?.version ?? "—"}
              {app.publicVersion ? ` · público ${app.publicVersion.version}` : ""}
              {app.verified ? " · verificado" : " · não verificado"}
            </p>
            <p className="mt-1 text-xs text-muted">
              {app.owner ? `${app.owner.name || app.owner.email} · ${app.owner.email} · ${app.owner.status}` : "sem autor"}
            </p>
            {app.authorVersion?.externalUrl ? <p className="mt-1 text-xs text-muted">Download Windows: {app.authorVersion.externalUrl}</p> : null}
            {app.openReports.map((report) => (
              <p key={report.id} className="mt-2 text-xs">Denúncia: {report.reason}</p>
            ))}
            <input className="field mt-3 w-full" placeholder="Motivo, obrigatório para rejeitar" value={note[app.id] ?? ""} onChange={(e) => setNote({ ...note, [app.id]: e.target.value })} />
            <div className="mt-3 flex flex-wrap gap-2">
              {app.visibility === "em_revisao" ? (
                <>
                  <button className="btn-primary" type="button" onClick={() => void act(app.id, "aprovar")}>Aprovar</button>
                  <button className="btn-ghost" type="button" onClick={() => void act(app.id, "rejeitar")}>Rejeitar</button>
                </>
              ) : null}
              {app.visibility !== "retirado" ? (
                <button className="btn-ghost" type="button" onClick={() => void act(app.id, "retirar")}>Retirar da loja</button>
              ) : (
                <button className="btn-ghost" type="button" onClick={() => void act(app.id, "restaurar")}>Devolver ao autor</button>
              )}
              {!app.verified ? <button className="btn-ghost" type="button" onClick={() => void act(app.id, "verificar")}>Marcar verificado</button> : null}
              {app.owner && app.owner.status !== "bloqueado" ? (
                <button className="btn-ghost" type="button" onClick={() => void act(app.id, "banir")}>Banir publicador</button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
