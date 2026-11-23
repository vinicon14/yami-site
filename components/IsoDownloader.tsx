import { YAMI_OS_FREE_ISO_FROM, YAMI_OS_NAME } from "@/lib/yamios/brand";
import {
  formatByteSize,
  resolveFreeIsoDownload,
  type IsoManifestSource,
} from "@/lib/yamios/iso-downloader";

export function IsoDownloader({ source }: { source: IsoManifestSource }) {
  const offer = resolveFreeIsoDownload(source);

  if (!offer.active) {
    return (
      <div className="card iso-offer p-5" data-iso-offer="soon">
        <p className="kicker">Download gratuito</p>
        <p className="mt-3 text-lg font-semibold tracking-tight text-balance">
          Em breve na versão {YAMI_OS_FREE_ISO_FROM}.
        </p>
      </div>
    );
  }

  const singleFile = offer.parts.length === 1 && offer.parts[0].fileName === "yami-os-amd64.iso";

  return (
    <div className="card iso-offer p-5" data-iso-offer="ready">
      <p className="kicker">Download gratuito</p>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        ISO {offer.version} do {YAMI_OS_NAME}. Não pede licença.
      </p>
      <p className="mt-3 text-sm">Tamanho da ISO: {formatByteSize(offer.tamanho)}</p>
      <p className="iso-hash mt-1 font-mono text-xs leading-relaxed text-muted">
        SHA-256 da ISO: {offer.sha256}
      </p>
      <ul className="mt-4 space-y-4 text-sm">
        {offer.parts.map((part) => (
          <li key={`${part.index}-${part.fileName}`} className="min-w-0">
            <a
              className="inline-flex min-h-11 items-center text-accent-text underline underline-offset-2"
              href={part.href}
            >
              {singleFile
                ? `Baixar a ISO (${formatByteSize(part.tamanho)})`
                : `Baixar a parte ${part.index} (${formatByteSize(part.tamanho)})`}
            </a>
            <p className="text-muted">Salve como {part.fileName}.</p>
            <p className="iso-hash font-mono text-xs leading-relaxed text-muted">SHA-256: {part.sha256}</p>
          </li>
        ))}
      </ul>
      <p className="mt-5 text-sm leading-relaxed text-muted">
        {singleFile
          ? "Depois de baixar, confira o SHA-256."
          : "Confira o SHA-256 de cada parte, junte os arquivos e confira o SHA-256 da ISO."}
      </p>
      <div className="mt-4 grid gap-4">
        <div className="min-w-0">
          <p className="kicker">Linux</p>
          <pre className="iso-commands mt-2">{offer.linux.join("\n")}</pre>
        </div>
        <div className="min-w-0">
          <p className="kicker">Windows</p>
          <pre className="iso-commands mt-2">{offer.windows.join("\n")}</pre>
        </div>
      </div>
    </div>
  );
}
