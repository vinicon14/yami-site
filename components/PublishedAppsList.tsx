import type { CatalogApp } from "@/lib/apps-catalog";

export function PublishedAppsList({ apps }: { apps: CatalogApp[] }) {
  return (
    <section className="mt-12">
      <h2 className="text-2xl font-semibold">Loja</h2>
      <p className="mt-2 text-sm text-muted">
        Aplicativos publicados para quem tem licença. No Windows o download é externo e não instala dentro do YAMI OS.
      </p>
      {apps.length === 0 ? (
        <p className="mt-4 text-sm text-muted">Nenhum aplicativo publicado ainda.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {apps.map((app) => (
            <li key={app.id} className="card flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
              <div>
                <p className="font-medium">{app.name}</p>
                <p className="text-xs text-muted">
                  {app.category} · {app.version} · {app.platform}
                </p>
              </div>
              {app.platform === "windows" ? (
                <a className="btn-primary" href={app.downloadUrl} target="_blank" rel="noopener noreferrer">
                  {app.actionLabel}
                </a>
              ) : (
                <span className="text-xs text-muted">{app.actionLabel} no YAMI OS</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
