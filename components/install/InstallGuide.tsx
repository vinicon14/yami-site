import Link from "next/link";
import { CopyButton } from "@/components/CopyButton";
import { BOOT_MENU_KEYS } from "@/lib/install-guide";
import { formatByteSize, publicIsoHref } from "@/lib/yamios/iso-downloader";
import { YAMI_OS_NAME } from "@/lib/yamios/brand";
import {
  JOIN_SCRIPT_FILES,
  buildJoinScripts,
  type JoinManifestSource,
  type JoinPartSource,
} from "@/lib/yamios/join-scripts";

type GuideSource = JoinManifestSource & {
  build?: string;
  iso?: (NonNullable<JoinManifestSource["iso"]> & {
    kernel?: string;
    observacao?: string;
    partes?: JoinPartSource[];
  }) | null;
};

function pointsAtLicense(url: string): boolean {
  try {
    const parsed = new URL(url, "https://yami-site-pi.vercel.app");
    return /\/api\/yamios\/iso(?:\/|$)/.test(parsed.pathname);
  } catch {
    return false;
  }
}

function HashLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-4 min-w-0">
      <p className="text-sm font-medium">{label}</p>
      <div className="mt-2 flex flex-wrap items-start gap-2">
        <p className="iso-hash min-w-0 flex-1 font-mono text-xs leading-relaxed">{value}</p>
        <div className="shrink-0">
          <CopyButton value={value} label="Copiar" />
        </div>
      </div>
    </div>
  );
}

function CommandBlock({ title, value }: { title: string; value: string }) {
  return (
    <div className="mt-4 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-medium">{title}</h3>
        <CopyButton value={value} label="Copiar comandos" />
      </div>
      <pre className="iso-commands iso-scroll mt-2">{value}</pre>
    </div>
  );
}

function StepGlyph({ kind }: { kind: "usb" | "file" | "check" | "copy" }) {
  return (
    <svg viewBox="0 0 48 48" className="mx-auto h-12 w-12 text-accent-text" aria-hidden="true">
      {kind === "usb" ? (
        <>
          <rect x="18" y="8" width="12" height="7" rx="1.5" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M21 8V4h2.4M26.6 8V4H29" stroke="currentColor" strokeWidth="2" />
          <rect x="14" y="15" width="20" height="27" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />
          <circle cx="24" cy="30" r="3" fill="currentColor" />
        </>
      ) : null}
      {kind === "file" ? (
        <>
          <path d="M14 8h14l8 8v24a2 2 0 0 1-2 2H14a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M28 8v8h8" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M18 28h12M18 34h8" stroke="currentColor" strokeWidth="2" />
        </>
      ) : null}
      {kind === "check" ? (
        <>
          <circle cx="24" cy="24" r="14" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M16 24.5 21.5 30 33 18" fill="none" stroke="currentColor" strokeWidth="2.4" />
        </>
      ) : null}
      {kind === "copy" ? (
        <>
          <rect x="16" y="14" width="18" height="22" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M10 30h8M8 24h10" stroke="currentColor" strokeWidth="2" />
          <path d="M14 27 8 24l6-3" fill="none" stroke="currentColor" strokeWidth="2" />
        </>
      ) : null}
    </svg>
  );
}

function PictureSteps({ steps }: { steps: Array<{ kind: "usb" | "file" | "check" | "copy"; label: string }> }) {
  return (
    <div className="mt-4 grid grid-cols-3 gap-2" aria-hidden="true">
      {steps.map((step) => (
        <div key={step.label} className="rounded-lg border border-line bg-canvas px-2 py-3 text-center">
          <StepGlyph kind={step.kind} />
          <p className="mt-2 text-xs leading-snug text-muted">{step.label}</p>
        </div>
      ))}
    </div>
  );
}

export function InstallGuide({ source }: { source: GuideSource }) {
  const plan = buildJoinScripts(source);
  const rawParts = source.iso?.partes ?? [];
  const downloads = rawParts.length
    ? rawParts.map((part, index) => ({
        href: publicIsoHref(source.versao ?? "", part) ?? "",
        fileName: plan?.parts[index]?.fileName ?? `parte${String(index + 1).padStart(2, "0")}`,
        sha256: plan?.parts[index]?.sha256 ?? part.sha256 ?? "",
        tamanho: typeof part.tamanho === "number" ? part.tamanho : 0,
      }))
    : plan?.parts.length === 1
      ? [
          {
            href: publicIsoHref(source.versao ?? "", { url: source.iso?.url ?? undefined }) ?? "",
            fileName: plan.parts[0].fileName,
            sha256: plan.isoSha256,
            tamanho: typeof source.iso?.tamanho === "number" ? source.iso.tamanho : 0,
          },
        ]
      : [];
  const needsLicense = downloads.some((item) => pointsAtLicense(item.href));
  const joins = (plan?.parts.length ?? downloads.length) > 1;
  const isoSha = plan?.isoSha256 ?? source.iso?.sha256 ?? "";
  const isoSize = typeof source.iso?.tamanho === "number" ? source.iso.tamanho : 0;
  const versionBits = [source.versao, source.build, source.iso?.kernel].filter(Boolean).join(" · ");

  const steps = [
    ["#baixar", "1. Baixar"],
    ["#juntar", joins ? "2. Juntar e conferir" : "2. Conferir"],
    ["#pendrive", "3. Gravar o pendrive"],
    ["#ligar", "4. Ligar pelo pendrive"],
    ["#primeiro-boot", "5. Primeira vez"],
  ];

  return (
    <article className="mx-auto min-w-0 max-w-3xl px-5 py-12 md:px-8 md:py-16">
      <p className="kicker">Instalação</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
        Instalar o {YAMI_OS_NAME}
      </h1>
      <p className="mt-4 text-sm leading-relaxed text-muted sm:text-base">
        Este passo a passo é para quem nunca instalou um sistema. São cinco etapas: baixar, conferir,
        gravar um pendrive, ligar o computador por ele e responder o que o próprio {YAMI_OS_NAME} perguntar.
      </p>
      {versionBits ? <p className="mt-3 text-sm text-muted">{versionBits}</p> : null}
      {isoSize > 0 ? (
        <p className="mt-1 text-sm text-muted">Tamanho da ISO: {formatByteSize(isoSize)}.</p>
      ) : null}

      <nav aria-label="Passos da instalação" className="mt-6">
        <ol className="grid gap-2 sm:grid-cols-2">
          {steps.map(([href, label]) => (
            <li key={href}>
              <a
                href={href}
                className="flex min-h-11 items-center rounded-lg border border-line px-3 text-sm hover:border-accent/40"
              >
                {label}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="mt-8 space-y-6">
        <section id="baixar" className="card scroll-mt-24 p-5">
          <h2 className="text-2xl font-semibold tracking-tight text-balance">1. Baixar o sistema</h2>
          {downloads.length === 0 ? (
            <p className="mt-3 text-sm leading-relaxed text-muted">
              A ISO desta versão ainda não está publicada. Se você já tem o {YAMI_OS_NAME} instalado, use o pacote de atualização.
            </p>
          ) : (
            <>
              <p className="mt-3 text-sm leading-relaxed sm:text-base">
                {joins
                  ? `O arquivo é grande e vem em ${downloads.length} partes. Baixe todas, na mesma pasta.`
                  : "O arquivo vem inteiro, em um download só. Guarde ele numa pasta fácil de achar."}
              </p>
              {source.iso?.observacao ? (
                <p className="mt-3 text-sm leading-relaxed text-muted">{source.iso.observacao}</p>
              ) : null}
              {needsLicense ? (
                <p className="mt-3 text-sm leading-relaxed">
                  Esta versão pede uma licença para baixar.{" "}
                  <Link href="/entrar" className="text-accent-text underline underline-offset-2">
                    Entre
                  </Link>{" "}
                  na conta da compra antes. Se o site avisar que a licença falta, ela está em{" "}
                  <Link href="/precos" className="text-accent-text underline underline-offset-2">
                    Preços
                  </Link>
                  .
                </p>
              ) : null}
              <ul className="mt-4 space-y-5">
                {downloads.map((item, index) => (
                  <li key={`${item.fileName}-${index}`} className="min-w-0">
                    {item.href ? (
                      <a
                        className="inline-flex min-h-11 items-center text-accent-text underline underline-offset-2"
                        href={item.href}
                      >
                        {downloads.length === 1
                          ? `Baixar a ISO${item.tamanho > 0 ? ` (${formatByteSize(item.tamanho)})` : ""}`
                          : `Baixar a parte ${index + 1}${item.tamanho > 0 ? ` (${formatByteSize(item.tamanho)})` : ""}`}
                      </a>
                    ) : (
                      <p className="text-sm">Parte {index + 1} sem link nesta versão.</p>
                    )}
                    <p className="mt-1 text-sm leading-relaxed">
                      Salve com o nome <strong className="font-mono font-medium">{item.fileName}</strong>.
                      Se o navegador usar outro nome, renomeie para este antes de continuar.
                    </p>
                    {item.sha256 ? (
                      <HashLine
                        label={downloads.length === 1 ? "SHA-256 da ISO" : `SHA-256 da parte ${index + 1}`}
                        value={item.sha256}
                      />
                    ) : null}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section id="juntar" className="card scroll-mt-24 p-5">
          <h2 className="text-2xl font-semibold tracking-tight text-balance">
            {joins ? "2. Juntar as partes e conferir" : "2. Conferir o arquivo"}
          </h2>
          <p className="mt-3 text-sm leading-relaxed sm:text-base">
            O SHA-256 é um código de conferência. Se o código do seu arquivo for igual ao do site, o download veio inteiro.
          </p>
          {isoSha ? <HashLine label="SHA-256 da ISO" value={isoSha} /> : null}

          {plan ? (
            <>
              <p className="mt-5 text-sm leading-relaxed sm:text-base">
                {joins
                  ? "O script junta as partes e confere os códigos. Ele não baixa nada: os arquivos já precisam estar na pasta."
                  : "O script confere o código do arquivo. Ele não baixa nada: o arquivo já precisa estar na pasta."}{" "}
                Se estiver certo, ele escreve <strong className="font-medium">Bateu</strong>. Se estiver errado, ele escreve que não bateu. Aí é só baixar de novo.
              </p>
              <div className="cta-row mt-4">
                <a className="btn-primary" href="/api/yamios/scripts/windows" download={JOIN_SCRIPT_FILES.windows.filename}>
                  Baixar o script para Windows
                </a>
                <a className="btn-ghost" href="/api/yamios/scripts/unix" download={JOIN_SCRIPT_FILES.unix.filename}>
                  Baixar o script para Linux e Mac
                </a>
              </div>
              <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed">
                <li>Coloque o script na mesma pasta dos arquivos baixados.</li>
                <li>No Windows, dê dois cliques em {JOIN_SCRIPT_FILES.windows.filename}. A janela escreve RESULTADO: BATEU ou RESULTADO: NAO BATEU e espera uma tecla, para você conseguir ler.</li>
                <li>
                  No Linux ou no Mac, abra o Terminal nessa pasta e digite{" "}
                  <code className="iso-hash">sh {JOIN_SCRIPT_FILES.unix.filename}</code>.
                </li>
              </ul>

              <h3 className="mt-6 text-base font-medium">Se preferir digitar</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Abra o terminal na pasta dos arquivos. No Windows, digite cmd no menu Iniciar. No Mac ou no Linux, digite cd, um espaço, e arraste a pasta para a janela. No Linux, OK quer dizer que bateu e FAILED quer dizer que não bateu. No Mac vale o mesmo, com o shasum. No Windows, o código que aparecer tem que ser igual ao da linha de baixo. Se a linha não couber na tela, deslize para o lado ou use Copiar comandos.
              </p>
              <CommandBlock title="Windows" value={plan.windowsCommands} />
              <CommandBlock title="Linux" value={plan.linuxCommands} />
              <CommandBlock title="Mac" value={plan.macCommands} />
            </>
          ) : (
            <p className="mt-4 text-sm leading-relaxed text-muted">
              Ainda não dá para montar o script desta versão. Quando a ISO estiver no site, os botões aparecem aqui.
            </p>
          )}
        </section>

        <section id="pendrive" className="card scroll-mt-24 p-5">
          <h2 className="text-2xl font-semibold tracking-tight text-balance">3. Gravar o pendrive</h2>
          <p className="mt-3 text-sm leading-relaxed sm:text-base">
            Use um pendrive maior do que a ISO{isoSize > 0 ? ` (${formatByteSize(isoSize)})` : ""}. Gravar apaga o que estiver nele. Copie seus arquivos para outro lugar antes.
          </p>
          <p className="mt-3 text-sm leading-relaxed">
            O pendrive é o disco pequeno. O disco do computador é o grande. Se tiver dúvida, tire o pendrive, olhe a lista, coloque de novo e veja qual nome apareceu.
          </p>

          <h3 className="mt-6 text-lg font-semibold">Rufus, no Windows</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Programa gratuito. Baixe no{" "}
            <a className="text-accent-text underline underline-offset-2" href="https://rufus.ie/pt/" target="_blank" rel="noopener noreferrer">
              site oficial do Rufus
            </a>
            . Não precisa instalar.
          </p>
          <PictureSteps
            steps={[
              { kind: "usb", label: "Escolha o pendrive" },
              { kind: "file", label: "Escolha a ISO" },
              { kind: "check", label: "Modo ISO ou DD" },
            ]}
          />
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
            <li>Abra o Rufus. Em Dispositivo, escolha o pendrive.</li>
            <li>Em Seleção de boot, clique em Selecionar e escolha o arquivo .iso que você conferiu.</li>
            <li>O Rufus pergunta o modo. Pode ser imagem ISO ou imagem DD. Os dois servem. Se o computador não ligar por um, grave de novo no outro.</li>
            <li>Clique em Iniciar e espere o aviso de que terminou. Só então tire o pendrive.</li>
          </ol>

          <h3 className="mt-6 text-lg font-semibold">balenaEtcher, no Windows</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Outra opção, com menos botões. Baixe no{" "}
            <a className="text-accent-text underline underline-offset-2" href="https://etcher.balena.io/" target="_blank" rel="noopener noreferrer">
              site oficial do balenaEtcher
            </a>
            .
          </p>
          <PictureSteps
            steps={[
              { kind: "file", label: "Flash from file" },
              { kind: "usb", label: "Select target" },
              { kind: "check", label: "Flash" },
            ]}
          />
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
            <li>Abra o Etcher e clique em Flash from file, que é escolher o arquivo. Selecione a ISO.</li>
            <li>Clique em Select target, que é escolher o destino, e marque o pendrive.</li>
            <li>Clique em Flash. Ele avisa que vai apagar o pendrive. Espere o Flash complete.</li>
          </ol>

          <h3 className="mt-6 text-lg font-semibold">Ventoy, se quiser só copiar a ISO</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            O Ventoy prepara o pendrive uma vez. Depois, copiar a ISO é como copiar uma foto. Baixe no{" "}
            <a className="text-accent-text underline underline-offset-2" href="https://www.ventoy.net/en/download.html" target="_blank" rel="noopener noreferrer">
              site oficial do Ventoy
            </a>
            .
          </p>
          <PictureSteps
            steps={[
              { kind: "usb", label: "Instale o Ventoy" },
              { kind: "copy", label: "Copie a ISO" },
              { kind: "check", label: "Escolha na lista" },
            ]}
          />
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
            <li>Instale o Ventoy no pendrive. Essa etapa apaga o pendrive uma vez.</li>
            <li>Quando terminar, o pendrive abre como uma pasta. Copie o arquivo .iso para dentro dela. O pendrive precisa caber a ISO, com uma sobra para o Ventoy.</li>
            <li>Na hora de ligar, o Ventoy mostra uma lista. Escolha a ISO do {YAMI_OS_NAME}.</li>
          </ol>
        </section>

        <section id="ligar" className="card scroll-mt-24 p-5">
          <h2 className="text-2xl font-semibold tracking-tight text-balance">4. Ligar o computador pelo pendrive</h2>
          <p className="mt-3 text-sm leading-relaxed sm:text-base">
            Desligue o computador de verdade, com o pendrive encaixado. Ligue e aperte a tecla do menu várias vezes, logo que a tela acender, antes do Windows abrir. Esse menu se chama menu de boot: é a lista que deixa você escolher o pendrive.
          </p>
          <p className="mt-3 text-sm leading-relaxed">
            Se o Windows abrir direto, desligue de novo e tente outra vez. Em notebook, às vezes a tecla precisa do Fn junto. A primeira tela também pode mostrar a tecla certa.
          </p>

          <div className="mt-4 overflow-hidden rounded-lg border border-line">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Teclas do menu de boot por fabricante</caption>
              <thead className="hidden border-b border-line text-muted sm:table-header-group">
                <tr>
                  <th scope="col" className="px-4 py-2 font-medium">Marca</th>
                  <th scope="col" className="px-4 py-2 font-medium">Tecla</th>
                  <th scope="col" className="px-4 py-2 font-medium">Detalhe</th>
                </tr>
              </thead>
              <tbody>
                {BOOT_MENU_KEYS.map((row) => (
                  <tr key={row.brand} className="block border-b border-line px-4 py-3 last:border-b-0 sm:table-row sm:px-0">
                    <th scope="row" className="block text-left font-medium sm:table-cell sm:px-4 sm:py-3">{row.brand}</th>
                    <td className="mt-1 block font-mono text-accent-text sm:mt-0 sm:table-cell sm:px-4 sm:py-3">{row.key}</td>
                    <td className="mt-1 block text-muted sm:mt-0 sm:table-cell sm:px-4 sm:py-3">{row.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Estas são as teclas mais comuns. Um modelo pode usar outra. Se não funcionar, olhe o que a tela mostra ao ligar.
          </p>

          <div className="mt-5 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm leading-relaxed">
            <p className="font-medium text-warning">Pode ser preciso desligar o Secure Boot</p>
            <p className="mt-1">
              Se o pendrive não aparecer, ou se o computador falar em assinatura inválida, entre na configuração. As teclas mais comuns são F2, Del ou Esc. Procure Secure Boot em Boot ou Security e desligue. Salve e saia. Depois volte ao menu de boot.
            </p>
          </div>
        </section>

        <section id="primeiro-boot" className="card scroll-mt-24 p-5">
          <h2 className="text-2xl font-semibold tracking-tight text-balance">5. O que acontece na primeira vez</h2>
          <p className="mt-3 text-sm leading-relaxed sm:text-base">
            Quando o {YAMI_OS_NAME} ligar pelo pendrive, ele mesmo faz as perguntas. Você só responde e confirma.
          </p>
          <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm leading-relaxed">
            <li>
              <strong className="font-medium">Idioma e teclado.</strong> O padrão já vem em português do Brasil (pt-BR). Se a tela estiver em português, confirme.
            </li>
            <li>
              <strong className="font-medium">Fuso horário.</strong> O padrão é America/Sao_Paulo, o horário de Brasília.
            </li>
            <li>
              <strong className="font-medium">Rede e Wi-Fi.</strong> Escolha a sua rede, se tiver. Sem internet também dá para continuar.
            </li>
            <li>
              <strong className="font-medium">Sua conta.</strong> Você escolhe o nome e a senha nessa hora. Anote a senha num lugar seguro.
            </li>
            <li>
              <strong className="font-medium">Instalação no disco.</strong> O sistema é gravado no disco do computador. O que estiver nesse disco pode ser apagado. Se há fotos ou documentos que você quer manter, copie para outro lugar antes de confirmar.
            </li>
            <li>
              <strong className="font-medium">Pareamento e licença da YAMI.</strong> Se houver internet, o sistema pode pedir para parear ou ativar a licença. Dá para pular e fazer isso depois.
            </li>
          </ol>
          <p className="mt-4 text-sm leading-relaxed text-muted">
            Siga até o fim. Quando a instalação no disco terminar, o computador pode reiniciar. Se ele voltar para o pendrive, tire o pendrive e ligue de novo.
          </p>
        </section>
      </div>
    </article>
  );
}
