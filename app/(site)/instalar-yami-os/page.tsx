import Link from "next/link";
import manifest from "@/lib/yamios/latest.json";
import { renderInstallCommands } from "@/lib/install-page";

export const dynamic = "force-static";

export default function InstalarYamiOsPage() {
  const iso = manifest.iso;
  const parts = (iso.partes ?? []) as Array<{ url: string; sha256: string; tamanho: number }>;
  const commands = renderInstallCommands(parts.length);
  const hasParts = parts.length > 0;

  return (
    <article className="mx-auto max-w-3xl px-5 py-12 md:px-8 md:py-16">
      <p className="kicker">Instalação</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">Instalar o YAMI OS</h1>
      <p className="mt-4 text-sm leading-relaxed text-muted">
        Versão {manifest.versao} · build {manifest.build} · kernel {iso.kernel}. O sistema é baixado em partes para caber no GitHub.
      </p>

      <section className="card mt-8 p-5">
        <p className="kicker">Verificação</p>
        <p className="mt-2 font-mono text-xs break-all">SHA-256 da ISO montada: {iso.sha256}</p>
        <p className="mt-1 text-xs text-muted">Tamanho aproximado: {Math.round(iso.tamanho / 1024 / 1024 / 1024)} GB</p>
      </section>

      <section className="card mt-6 p-5">
        <p className="kicker">Downloads</p>
        {hasParts ? (
          <ul className="mt-3 space-y-3 text-sm">
            {parts.map((part, index) => (
              <li key={part.url}>
                <a className="inline-flex min-h-11 items-center text-accent-text underline underline-offset-2" href={part.url}>
                  Parte {index + 1} ({Math.round(part.tamanho / 1024 / 1024)} MB)
                </a>
                <p className="break-all font-mono text-xs leading-relaxed text-muted">{part.sha256}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted">ISO em preparação. Use o pacote de atualização se você já tem o YAMI OS.</p>
        )}
      </section>

      <section className="card mt-6 p-5">
        <p className="kicker">Montar a ISO</p>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-surface p-3 text-xs">{commands.join("\n")}</pre>
        <p className="mt-3 text-sm text-muted">
          No Windows, use PowerShell: <code>Get-Content parte01,parte02 -Encoding Byte | Set-Content yami-os-amd64.iso -Encoding Byte</code>
        </p>
      </section>

      <p className="mt-8 text-sm">
        <Link href="/checkout" className="inline-flex min-h-11 items-center text-accent-text underline underline-offset-2 hover:text-accent-hover">
          Comprar a YAMI
        </Link>
      </p>
    </article>
  );
}
