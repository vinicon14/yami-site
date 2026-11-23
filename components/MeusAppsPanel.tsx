"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { upload } from "@vercel/blob/client";
import type { CatalogApp } from "@/lib/store-apps";
import { PublishedAppsList } from "./PublishedAppsList";

const ERRORS: Record<string, string> = {
  nome_em_uso: "Esse nome já pertence a outra pessoa.",
  limite_excedido: "Muitas denúncias nesta hora. Tente de novo mais tarde.",
  cota_diaria_excedida: "Cota diária de envios esgotada. Ela zera no próximo dia (UTC).",
  sha256_divergente: "O SHA-256 do arquivo não confere com o que o servidor calculou.",
  sha256_invalido: "Informe o SHA-256 em 64 caracteres hexadecimais.",
  formato_invalido: "Formato de arquivo não aceito.",
  tamanho_invalido: "O arquivo passa do limite de tamanho.",
  url_externa_invalida: "O download do Windows precisa ser um link https público.",
  url_externa_obrigatoria: "Informe o link de download para Windows.",
  versao_nao_maior: "A versão nova precisa ser maior que a atual.",
  versao_invalida: "Use uma versão no formato 1.2.3.",
  conta_bloqueada: "Esta conta está bloqueada.",
  app_retirado: "Este app foi retirado e o nome continua reservado.",
  ja_publico: "Essa versão já está na loja pública.",
};

function explain(code: string): string {
  return ERRORS[code] ?? code;
}

function visibilityLabel(app: CatalogApp): string {
  if (app.visibility === "retirado") return "Retirado";
  if (app.visibility === "em_revisao") return "Em revisão";
  if (app.visibility === "publico" && app.updatePending) return "Público · atualização só para você";
  if (app.visibility === "publico") return "Público";
  return "Só para você";
}

export function MeusAppsPanel() {
  const router = useRouter();
  const [mine, setMine] = useState<CatalogApp[]>([]);
  const [storeApps, setStoreApps] = useState<CatalogApp[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("utilidades");
  const [version, setVersion] = useState("1.0.0");
  const [platform, setPlatform] = useState<"linux" | "windows">("linux");
  const [externalUrl, setExternalUrl] = useState("");
  const [sha256, setSha256] = useState("");
  const [size, setSize] = useState("");
  const [fileMeta, setFileMeta] = useState<{ name: string; size: number; sha256: string; pathname: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [reportReason, setReportReason] = useState<Record<string, string>>({});

  async function load() {
    const res = await fetch("/api/conta/apps");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return;
    setMine(data.mine ?? []);
    setStoreApps(data.store ?? []);
  }

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/conta/apps", { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => {
        setMine(data.mine ?? []);
        setStoreApps(data.store ?? []);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  async function sha256File(selected: File): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", await selected.arrayBuffer());
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setFileMeta(null);
    if (!selected) return;
    const digest = await sha256File(selected);
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
          version,
          size: selected.size,
          sha256: digest,
          platform,
        }),
      });
      setFileMeta({ name: selected.name, size: selected.size, sha256: digest, pathname: uploaded.pathname });
      setMessage("Arquivo recebido. O servidor confere o SHA-256 ao publicar.");
    } catch (error) {
      setMessage(explain(error instanceof Error ? error.message : "Não foi possível enviar o arquivo."));
    } finally {
      setUploading(false);
    }
  }

  async function publish(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    const res = await fetch("/api/apps", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        description,
        category,
        version,
        platform,
        fileName: fileMeta?.name ?? null,
        fileSize: fileMeta?.size ?? null,
        fileSha256: fileMeta?.sha256 ?? null,
        fileBlobPathname: fileMeta?.pathname ?? null,
        externalUrl: platform === "windows" ? externalUrl : null,
        size: platform === "windows" ? Number(size) : fileMeta?.size ?? null,
        sha256: platform === "windows" ? sha256 : fileMeta?.sha256 ?? null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(explain(String(data.error ?? "Não foi possível publicar.")));
      return;
    }
    setName("");
    setDescription("");
    setFileMeta(null);
    setExternalUrl("");
    setSha256("");
    setSize("");
    setMessage("O app já está disponível para você. Peça a publicação quando quiser que todo mundo veja.");
    await load();
    router.refresh();
  }

  async function askReview(id: string) {
    setMessage("");
    const res = await fetch(`/api/apps/${id}/revisao`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(explain(String(data.error ?? "Não foi possível pedir a revisão.")));
      return;
    }
    setMessage("Pedido de publicação enviado. Quem já tem o app público continua na versão anterior até a aprovação.");
    await load();
  }

  async function report(id: string) {
    setMessage("");
    const res = await fetch(`/api/apps/${id}/denuncia`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: reportReason[id] ?? "" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(explain(String(data.error ?? "Não foi possível enviar a denúncia.")));
      return;
    }
    setReportReason((current) => ({ ...current, [id]: "" }));
    setMessage("Denúncia enviada. A equipe pode retirar o app.");
  }

  return (
    <section className="mt-12">
      <h2 className="text-2xl font-semibold">Meus apps</h2>
      <p className="mt-2 text-sm text-muted">
        Depois das checagens automáticas o app fica disponível só na sua conta e nos seus aparelhos. A loja pública continua com revisão de um administrador.
      </p>
      <form onSubmit={publish} className="card mt-4 space-y-3 p-4">
        <input className="field w-full" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do app" maxLength={80} required />
        <input className="field w-full" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Categoria (ex.: utilidades)" maxLength={32} required />
        <input className="field w-full" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.0.0" pattern="\d+\.\d+\.\d+" required />
        <label className="block text-sm">
          <span className="text-muted">Plataforma</span>
          <select className="field mt-1 w-full" value={platform} onChange={(e) => setPlatform(e.target.value === "windows" ? "windows" : "linux")}>
            <option value="linux">Linux (instalar no YAMI OS)</option>
            <option value="windows">Windows (download externo)</option>
          </select>
        </label>
        <textarea className="field w-full" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="O que o app faz" maxLength={4000} required />
        {platform === "linux" ? (
          <input className="field w-full" type="file" accept=".AppImage,.tar.zst,application/octet-stream" onChange={(e) => void handleFileChange(e)} disabled={uploading} />
        ) : (
          <>
            <input className="field w-full" value={externalUrl} onChange={(e) => setExternalUrl(e.target.value)} placeholder="https://… link do instalador Windows" required />
            <input className="field w-full" value={sha256} onChange={(e) => setSha256(e.target.value.trim())} placeholder="SHA-256 do arquivo" pattern="[a-fA-F0-9]{64}" required />
            <input className="field w-full" value={size} onChange={(e) => setSize(e.target.value)} placeholder="Tamanho em bytes" inputMode="numeric" required />
          </>
        )}
        {fileMeta ? <p className="text-xs text-muted">{fileMeta.name} · {fileMeta.size} bytes</p> : null}
        <button className="btn-primary" type="submit" disabled={uploading || (platform === "linux" && !fileMeta)}>
          {uploading ? "Enviando arquivo…" : "Publicar para mim"}
        </button>
        {message ? <p className="text-sm" role="status">{message}</p> : null}
      </form>
      <ul className="mt-6 space-y-3">
        {mine.map((app) => (
          <li key={app.id} className="card space-y-2 p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">{app.name}</p>
              <span className="text-xs">{visibilityLabel(app)} · {app.version}</span>
            </div>
            <p className="text-xs text-muted">
              {app.publisher.name} · {app.badge === "novo" ? "novo" : app.badge === "nao_verificado" ? "não verificado" : "verificado"} · {app.actionLabel}
              {app.publicVersion && app.updatePending ? ` · o público ainda vê ${app.publicVersion}` : ""}
            </p>
            {app.reviewNote ? <p className="text-xs text-muted">Nota da revisão: {app.reviewNote}</p> : null}
            {app.visibility !== "retirado" && app.visibility !== "em_revisao" && !(app.visibility === "publico" && !app.updatePending) ? (
              <button className="btn-ghost text-xs" type="button" onClick={() => void askReview(app.id)}>Pedir publicação</button>
            ) : null}
          </li>
        ))}
      </ul>
      <PublishedAppsList apps={storeApps} />
      {storeApps.some((app) => !app.mine) ? (
        <ul className="mt-4 space-y-3">
          {storeApps.filter((app) => !app.mine).map((app) => (
            <li key={`denuncia-${app.id}`} className="card space-y-2 p-4 text-sm">
              <p className="text-xs text-muted">Denunciar {app.name}</p>
              <textarea className="field w-full" value={reportReason[app.id] ?? ""} onChange={(e) => setReportReason({ ...reportReason, [app.id]: e.target.value })} placeholder="Descreva o problema (pelo menos 10 caracteres)" maxLength={1000} />
              <button className="btn-ghost text-xs" type="button" onClick={() => void report(app.id)}>Enviar denúncia</button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
