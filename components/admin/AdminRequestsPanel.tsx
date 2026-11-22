"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FeatureRequest } from "@/lib/db/types";
import { statusLabel } from "../FeatureRequestsPanel";

const OPEN_STATUSES = new Set(["pendente", "aprovada", "em_desenvolvimento"]);

export function AdminRequestsPanel({ items }: { items: FeatureRequest[] }) {
  const router = useRouter();
  const [note, setNote] = useState<Record<string, string>>({});
  const [version, setVersion] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");

  async function transition(id: string, status: string, request: FeatureRequest) {
    setMessage("");
    const publishedVersion = status === "publicada" ? (version[id] ?? "") : null;
    const res = await fetch(`/api/admin/requests/${id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status, note: note[id] ?? "", publishedVersion }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error ?? "Falha ao atualizar.");
      return;
    }
    setMessage(`${request.title}: ${statusLabel(data.item.status)}.`);
    router.refresh();
  }

  return (
    <section className="card mt-8 p-6">
      <h2 className="text-2xl font-semibold">Solicitações em aberto</h2>
      {message ? <p className="mt-3 text-sm" role="status">{message}</p> : null}
      <ul className="mt-5 space-y-5">
        {items.filter((i) => OPEN_STATUSES.has(i.status)).map((item) => (
          <li key={item.id} className="border-b border-line pb-5">
            <p className="font-medium">{item.title}</p>
            <p className="mt-1 text-xs text-muted">{item.category} · {statusLabel(item.status)}</p>
            <p className="mt-1 text-sm text-muted">{item.description}</p>
            <input className="field mt-3 w-full" placeholder="Nota administrativa" value={note[item.id] ?? ""} onChange={(e) => setNote({ ...note, [item.id]: e.target.value })} />
            <div className="mt-3 flex flex-wrap gap-2">
              {item.status === "pendente" ? (
                <>
                  <button className="btn-primary" onClick={() => transition(item.id, "aprovada", item)}>Aprovar</button>
                  <button className="btn-ghost" onClick={() => transition(item.id, "rejeitada", item)}>Rejeitar</button>
                </>
              ) : null}
              {item.status !== "em_desenvolvimento" ? (
                <button className="btn-ghost" onClick={() => transition(item.id, "em_desenvolvimento", item)}>Iniciar desenvolvimento</button>
              ) : null}
              <span className="inline-flex items-center gap-2 text-xs">
                <input className="field w-24" placeholder="0.8.0" value={version[item.id] ?? ""} onChange={(e) => setVersion({ ...version, [item.id]: e.target.value })} />
                <button className="btn-ghost" onClick={() => transition(item.id, "publicada", item)}>Publicada</button>
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
