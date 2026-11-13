import { formatBytes, RELEASE_KINDS, type PublicReleaseManifest, type ReleaseKind } from "@/lib/release";

export function DownloadButtons({
  token,
  manifest,
  expiresAt,
}: {
  token: string;
  manifest: PublicReleaseManifest | null;
  expiresAt?: string;
}) {
  return (
    <div className="card mt-6 p-5">
      <p className="kicker">Downloads</p>
      {expiresAt ? (
        <p className="mt-2 text-sm text-muted">
          Os links expiram em{" "}
          {new Date(expiresAt).toLocaleString("pt-BR", {
            timeZone: "America/Sao_Paulo",
          })}{" "}
          (horário de Brasília) e têm um limite de usos.
        </p>
      ) : null}
      <ul className="mt-4 space-y-3">
        {RELEASE_KINDS.map((kind) => (
          <FileRow key={kind} kind={kind} token={token} manifest={manifest} />
        ))}
      </ul>
    </div>
  );
}

function FileRow({
  kind,
  token,
  manifest,
}: {
  kind: ReleaseKind;
  token: string;
  manifest: PublicReleaseManifest | null;
}) {
  const file = manifest?.files[kind];
  if (!file) {
    if (kind === "apk") {
      return (
        <li className="card bg-surface-raised px-4 py-3 text-sm">
          <span className="font-medium">Aplicativo Android (APK)</span>
          <span className="mt-1 block text-muted">APK em breve</span>
        </li>
      );
    }
    return (
      <li className="card bg-surface-raised px-4 py-3 text-sm text-muted">
        {kind === "setup" ? "Instalador Windows" : "Windows portátil"} ainda não
        publicado.
      </li>
    );
  }
  const href = `/api/download?token=${encodeURIComponent(token)}&file=${kind}`;
  return (
    <li className="card px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{file.label}</p>
          <p className="mt-1 font-mono text-xs text-muted">
            {file.filename} · {formatBytes(file.size)} · v{file.version}
          </p>
          <p className="mt-1 break-all font-mono text-[11px] text-muted">
            SHA256 {file.sha256}
          </p>
        </div>
        <a href={href} className="btn-primary">
          Baixar
        </a>
      </div>
    </li>
  );
}
