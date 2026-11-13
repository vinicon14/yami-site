"use client";

import { upload } from "@vercel/blob/client";
import { useMemo, useState } from "react";
import {
  formatBytes,
  RELEASE_KINDS,
  RELEASE_LABELS,
  type PublicReleaseManifest,
  type ReleaseKind,
} from "@/lib/release";

export type PublicHistoryItem = {
  id: string;
  kind: ReleaseKind;
  filename: string;
  version: string;
  size: number;
  sha256: string;
  publishedAt: string;
  uploadedByEmail: string;
  createdAt: string;
};

const ACCEPT: Record<ReleaseKind, string> = {
  setup: ".exe,application/octet-stream,application/x-msdownload",
  portable: ".exe,application/octet-stream,application/x-msdownload",
  apk: ".apk,application/vnd.android.package-archive",
};

function expectedExt(kind: ReleaseKind): "exe" | "apk" {
  return kind === "apk" ? "apk" : "exe";
}

function sanitizeFilename(name: string): string {
  const base = name.replace(/\\/g, "/").split("/").pop() ?? "";
  return base.replace(/[^A-Za-z0-9._+-]/g, "_");
}

function randomPathname(version: string, filename: string): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const token = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `releases/${version}/${token}/${sanitizeFilename(filename)}`;
}

async function sha256File(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function formatWhen(iso: string): string {
  const t = new Date(iso);
  if (!Number.isFinite(t.getTime())) return iso;
  return t.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export function AdminPanel({
  email,
  manifest: initialManifest,
  history: initialHistory,
}: {
  email: string;
  manifest: PublicReleaseManifest | null;
  history: PublicHistoryItem[];
}) {
  const [manifest, setManifest] = useState(initialManifest);
  const [history, setHistory] = useState(initialHistory);
  const [globalMsg, setGlobalMsg] = useState<string | null>(null);

  return (
    <article className="mx-auto max-w-3xl px-5 py-12 md:px-8 md:py-16">
      <p className="kicker">Admin</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">Publicar instaladores</h1>
      <p className="mt-4 text-sm leading-relaxed text-muted">
        Envie o instalador normal, o portátil e o APK. O arquivo vai direto para o
        armazenamento privado; depois disto, os downloads passam a servir a versão
        mais nova. Você entrou como {email}.
      </p>
      {globalMsg && (
        <p className="card mt-6 px-4 py-3 text-sm" role="status">
          {globalMsg}
        </p>
      )}
      <div className="mt-10 space-y-6">
        {RELEASE_KINDS.map((kind) => (
          <Slot
            key={kind}
            kind={kind}
            current={manifest?.files[kind] ?? null}
            history={history.filter((h) => h.kind === kind)}
            onPublished={(nextManifest, nextHistory) => {
              setManifest(nextManifest);
              setHistory(nextHistory);
              setGlobalMsg(`${RELEASE_LABELS[kind]} publicado.`);
            }}
            onError={setGlobalMsg}
          />
        ))}
      </div>
    </article>
  );
}

function Slot({
  kind,
  current,
  history,
  onPublished,
  onError,
}: {
  kind: ReleaseKind;
  current: PublicReleaseManifest["files"][ReleaseKind] | null | undefined;
  history: PublicHistoryItem[];
  onPublished: (manifest: PublicReleaseManifest, history: PublicHistoryItem[]) => void;
  onError: (message: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [version, setVersion] = useState(current?.version ?? "");
  const [phase, setPhase] = useState<"idle" | "hash" | "upload" | "publish" | "rollback">("idle");
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const previous = useMemo(() => {
    const seen = new Set<string>();
    if (current?.sha256) seen.add(current.sha256);
    return history.filter((h) => {
      if (seen.has(h.sha256)) return false;
      seen.add(h.sha256);
      return true;
    });
  }, [history, current?.sha256]);

  async function publish() {
    onError("");
    if (!file) {
      onError("escolha um arquivo");
      return;
    }
    const ext = expectedExt(kind);
    const filename = sanitizeFilename(file.name);
    if (!filename.toLowerCase().endsWith(`.${ext}`)) {
      onError(`o arquivo precisa terminar em .${ext}`);
      return;
    }
    if (!/^\d+\.\d+\.\d+(?:[.-][A-Za-z0-9.-]+)?$/.test(version.trim())) {
      onError("informe a versão no formato X.Y.Z");
      return;
    }
    if (file.size > 500 * 1024 * 1024) {
      onError("o arquivo passa de 500 MB");
      return;
    }
    setBusy(true);
    try {
      setPhase("hash");
      setProgress(0);
      const sha256 = await sha256File(file);
      const pathname = randomPathname(version.trim(), filename);
      setPhase("upload");
      const uploaded = await upload(pathname, file, {
        access: "private",
        multipart: true,
        handleUploadUrl: "/api/admin/upload",
        contentType:
          kind === "apk"
            ? "application/vnd.android.package-archive"
            : "application/octet-stream",
        clientPayload: JSON.stringify({
          kind,
          filename,
          version: version.trim(),
          size: file.size,
          sha256,
        }),
        onUploadProgress: ({ percentage }) => setProgress(percentage),
      });
      setPhase("publish");
      const res = await fetch("/api/admin/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          filename,
          version: version.trim(),
          size: file.size,
          sha256,
          pathname: uploaded.pathname,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        manifest?: PublicReleaseManifest;
        history?: PublicHistoryItem[];
      };
      if (!res.ok || !data.manifest) {
        throw new Error(data.error ?? "não foi possível registrar o arquivo");
      }
      onPublished(data.manifest, data.history ?? []);
      setFile(null);
      setProgress(100);
      setPhase("idle");
    } catch (err) {
      onError(err instanceof Error ? err.message : "falha no envio");
      setPhase("idle");
    } finally {
      setBusy(false);
    }
  }

  async function rollback(historyId: string) {
    onError("");
    setBusy(true);
    setPhase("rollback");
    try {
      const res = await fetch("/api/admin/rollback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ historyId }),
      });
      const data = (await res.json()) as {
        error?: string;
        manifest?: PublicReleaseManifest;
        history?: PublicHistoryItem[];
      };
      if (!res.ok || !data.manifest) {
        throw new Error(data.error ?? "não foi possível voltar a versão");
      }
      onPublished(data.manifest, data.history ?? []);
      setPhase("idle");
    } catch (err) {
      onError(err instanceof Error ? err.message : "falha ao voltar a versão");
      setPhase("idle");
    } finally {
      setBusy(false);
    }
  }

  const statusLabel =
    phase === "hash"
      ? "Calculando SHA256…"
      : phase === "upload"
        ? `Enviando… ${Math.round(progress)}%`
        : phase === "publish"
          ? "Registrando a versão…"
          : phase === "rollback"
            ? "Restaurando versão anterior…"
            : null;

  return (
    <section className="card p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="kicker">{kind}</p>
          <h2 className="mt-1 text-2xl font-semibold">{RELEASE_LABELS[kind]}</h2>
        </div>
        {current ? (
          <p className="text-xs text-accent-text">publicado</p>
        ) : (
          <p className="text-xs text-warning">{kind === "apk" ? "em breve" : "ainda não publicado"}</p>
        )}
      </div>

      {current ? (
        <dl className="mt-4 grid gap-2 text-sm text-muted">
          <div>
            <dt className="text-xs uppercase tracking-wider">Versão atual</dt>
            <dd className="text-ink">{current.version}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider">Arquivo</dt>
            <dd className="break-all font-mono text-xs text-ink-soft">
              {current.filename} · {formatBytes(current.size)}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider">SHA256</dt>
            <dd className="break-all font-mono text-[11px]">{current.sha256}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wider">Publicado em</dt>
            <dd>{formatWhen(current.publishedAt)} (horário de Brasília)</dd>
          </div>
        </dl>
      ) : (
        <p className="mt-4 text-sm text-muted">Nenhum arquivo neste slot ainda.</p>
      )}

      <div className="mt-6 grid gap-4 md:grid-cols-[1fr_8rem] md:items-end">
        <div>
          <label className="block text-sm font-medium" htmlFor={`${kind}-file`}>
            Novo arquivo
          </label>
          <input
            id={`${kind}-file`}
            type="file"
            accept={ACCEPT[kind]}
            disabled={busy}
            className="field mt-1"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium" htmlFor={`${kind}-version`}>
            Versão
          </label>
          <input
            id={`${kind}-version`}
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            disabled={busy}
            placeholder="0.62.0"
            className="field mt-1"
          />
        </div>
      </div>

      {statusLabel && (
        <div className="mt-4">
          <p className="text-xs text-muted">{statusLabel}</p>
          <div className="mt-2 h-2 overflow-hidden rounded-pill bg-surface-raised">
            <div
              className="h-full bg-accent transition-[width] duration-200"
              style={{ width: `${phase === "upload" ? progress : phase === "hash" ? 8 : 100}%` }}
            />
          </div>
        </div>
      )}

      <div className="mt-5">
        <button type="button" className="btn-primary" disabled={busy} onClick={() => void publish()}>
          {busy && phase !== "rollback" ? "Enviando…" : "Publicar"}
        </button>
      </div>

      {previous.length > 0 && (
        <div className="mt-6 border-t border-line pt-4">
          <p className="kicker">Versões anteriores</p>
          <ul className="mt-3 space-y-2">
            {previous.slice(0, 6).map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <div>
                  <p className="text-ink">
                    {item.version} · {formatBytes(item.size)}
                  </p>
                  <p className="font-mono text-[11px] text-muted">
                    {item.filename} · {formatWhen(item.createdAt)} · {item.uploadedByEmail}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-ghost text-xs"
                  disabled={busy}
                  onClick={() => void rollback(item.id)}
                >
                  Voltar a esta versão
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
