"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { FeatureRequestStatus } from "@/lib/db/types";
import type { PublicFeatureRequest } from "@/lib/feature-requests";

export function statusLabel(status: FeatureRequestStatus): string {
  const map: Record<FeatureRequestStatus, string> = {
    pendente: "Pendente",
    aprovada: "Aprovada",
    rejeitada: "Rejeitada",
    em_desenvolvimento: "Em desenvolvimento",
    publicada: "Publicada",
    retirada: "Retirada",
  };
  return map[status];
}

export function FeatureRequestsPanel({ items }: { items: PublicFeatureRequest[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("geral");
  const [message, setMessage] = useState("");

  async function create(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    const res = await fetch("/api/conta/requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, description, category }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error ?? "Não foi possível enviar.");
      return;
    }
    setTitle("");
    setDescription("");
    setMessage("Solicitação enviada.");
    router.refresh();
  }

  return (
    <section className="mt-12">
      <h2 className="text-2xl font-semibold">Solicitações</h2>
      <p className="mt-2 text-sm text-muted">Envie ideias e acompanhe a aprovação. Somente a equipe YAMI publica alterações.</p>
      <form onSubmit={create} className="card mt-4 space-y-3 p-4">
        <input className="field w-full" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título" maxLength={120} required />
        <input className="field w-full" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Categoria" maxLength={32} required />
        <textarea className="field w-full" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descreva sua solicitação" maxLength={4000} required />
        <button className="btn-primary" type="submit">Enviar solicitação</button>
        {message ? <p className="text-sm" role="status">{message}</p> : null}
      </form>
      <ul className="mt-6 space-y-3">
        {items.map((item) => (
          <li key={item.id} className="card flex flex-wrap justify-between gap-3 p-4 text-sm">
            <div>
              <p className="font-medium">{item.title}</p>
              <p className="text-xs text-muted">{item.category} · {new Date(item.createdAt).toLocaleString("pt-BR")}</p>
            </div>
            <span className="text-xs">{statusLabel(item.status)}{item.publishedVersion ? ` · ${item.publishedVersion}` : ""}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
