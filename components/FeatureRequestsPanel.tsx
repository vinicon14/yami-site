"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { upload } from "@vercel/blob/client";
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
  const [platform, setPlatform] = useState<"linux" | "windows">("linux");
  const [file, setFile] = useState<File | null>(null);
  const [fileMeta, setFileMeta] = useState<{ name: string; size: number; sha256: string; pathname: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

  async function sha256File(selected: File): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", await selected.arrayBuffer());
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setFile(selected);
    setFileMeta(null);
    if (!selected) return;
    const sha256 = await sha256File(selected);
    const pathname = `apps/${crypto.randomUUID()}/${selected.name.replace(/[^A-Za-z0-9._+-]/g, "_")}`;
    setUploading(true);
    setMessage("Enviando arquivo…");
    try {
      const uploaded = await upload(pathname, selected, {
        access: "private",
        multipart: true,
        handleUploadUrl: "/api/uploads/app",
        contentType: "application/octet-stream",
        clientPayload: JSON.stringify({
          filename: selected.name,
          version: "1.0.0",
          size: selected.size,
          sha256,
        }),
      });
      setFileMeta({ name: selected.name, size: selected.size, sha256, pathname: uploaded.pathname });
      setMessage("Arquivo enviado. Envie a solicitação.");
    } catch (error) {
      setFile(null);
      setMessage(error instanceof Error ? error.message : "Não foi possível enviar o arquivo.");
    } finally {
      setUploading(false);
    }
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    const res = await fetch("/api/conta/requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title,
        description,
        category,
        appPlatform: platform,
        fileName: fileMeta?.name ?? null,
        fileSize: fileMeta?.size ?? null,
        fileSha256: fileMeta?.sha256 ?? null,
        fileBlobPathname: fileMeta?.pathname ?? null,
        appVersion: fileMeta ? "1.0.0" : null,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.error ?? "Não foi possível enviar.");
      return;
    }
    setTitle("");
    setDescription("");
    setFile(null);
    setFileMeta(null);
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
        <label className="block text-sm">
          <span className="text-muted">Plataforma</span>
          <select className="field mt-1 w-full" value={platform} onChange={(e) => setPlatform(e.target.value === "windows" ? "windows" : "linux")}>
            <option value="linux">Linux (instalar no YAMI OS)</option>
            <option value="windows">Windows (download externo)</option>
          </select>
        </label>
        <textarea className="field w-full" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descreva sua solicitação" maxLength={4000} required />
        <input className="field w-full" type="file" accept=".AppImage,.tar.zst" onChange={(e) => void handleFileChange(e)} disabled={uploading} />
        {fileMeta ? <p className="text-xs text-muted">{fileMeta.name} · {fileMeta.size} bytes · SHA-256 conferido</p> : null}
        <button className="btn-primary" type="submit" disabled={uploading}>{uploading ? "Enviando arquivo…" : "Enviar solicitação"}</button>
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
