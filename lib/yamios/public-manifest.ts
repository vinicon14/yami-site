import { YAMI_OS_NAME } from "@/lib/yamios/brand";

/**
 * O manifesto versionado guarda o nome do arquivo (`arquivo`).
 * A URL pública é montada aqui. Um campo ausente não pode virar o
 * texto "undefined" no caminho (foi o que aconteceu na r5).
 *
 * O pacote incremental publicado continua na release v1.0.0:
 * `yami-os-1.0.0-pacote.tar.zst`, 223924 bytes,
 * sha256 3972f0f55000a185e76922406e2261f32f8ee782252a58da7424389755e96008.
 * A `versao` do manifesto pode anunciar uma ISO mais nova. A URL do pacote
 * usa `pacotes[].versao` (`v` + essa versão), não a versão da ISO.
 * `pacotes[0].descricao` descreve o arquivo do pacote. As `notas` descrevem a ISO.
 *
 * Para anunciar outro pacote (a r5 de 233028 bytes nunca foi enviada,
 * e a R6 ainda está no PC), edite só `lib/yamios/latest.json`, juntos:
 * `pacotes[0].descricao`, `pacotes[0].arquivo`, `pacotes[0].sha256`,
 * `pacotes[0].tamanho` e `pacotes[0].versao`.
 * Não escreva `url` no pacote. O tag da release do pacote é `v` + `pacotes[].versao`.
 * Use um nome de arquivo novo e o sha256 real do arquivo enviado.
 * Reutilizar `yami-os-1.0.0-pacote.tar.zst` com outro tamanho ou sha256
 * faz a API omitir o pacote, para não anunciar bytes que não batem.
 */

const RELEASE_BASE = "https://github.com/vinicon14/yamios-releases/releases/download";

/** Conferido na release v1.0.0 (asset e digest do GitHub, 2026-11-23). */
export const KNOWN_PUBLISHED_PACKAGES: Record<string, { tamanho: number; sha256: string }> = {
  "yami-os-1.0.0-pacote.tar.zst": {
    tamanho: 223924,
    sha256: "3972f0f55000a185e76922406e2261f32f8ee782252a58da7424389755e96008",
  },
};

const FILENAME = /^[A-Za-z0-9][A-Za-z0-9._+-]*\.[A-Za-z0-9]+$/;

export type ManifestPacote = {
  versao?: string;
  deVersaoMinima?: string;
  arquivo?: string;
  url?: string;
  sha256?: string;
  tamanho?: number;
  descricao?: string;
};

export type ManifestIsoPart = {
  arquivo?: string;
  url?: string;
  sha256?: string;
  tamanho?: number;
};

export type YamiosManifestSource = {
  produto?: string;
  canal?: string;
  versao?: string;
  build?: string;
  data?: string;
  notas?: string[];
  pacotes?: ManifestPacote[];
  iso?: {
    url?: string | null;
    sha256?: string;
    tamanho?: number;
    kernel?: string;
    observacao?: string;
    partes?: ManifestIsoPart[];
  };
  fontes?: { vercel?: string; github?: string };
};

export type PublicPacote = {
  versao: string;
  deVersaoMinima: string;
  url: string;
  sha256: string;
  tamanho: number;
  descricao: string;
};

export type PublicYamiosManifest = {
  produto: string;
  canal: string;
  versao: string;
  build: string;
  data: string;
  notas: string[];
  pacotes: PublicPacote[];
  iso: {
    url: string | null;
    sha256: string;
    tamanho: number;
    kernel: string;
    partes: Array<{ url: string; sha256: string; tamanho: number }>;
    observacao: string;
  };
  fontes: { vercel: string; github: string };
};

export function assetFilename(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  if (!FILENAME.test(name)) return null;
  if (/^undefined(\.|$)/i.test(name)) return null;
  if (name.includes("..")) return null;
  return name;
}

export function filenameFromUrl(url: unknown): string | null {
  if (typeof url !== "string" || !url.trim()) return null;
  try {
    const parsed = new URL(url, "https://yami-site-pi.vercel.app");
    const last = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).pop() ?? "");
    return assetFilename(last);
  } catch {
    return null;
  }
}

export function releaseAssetUrl(versao: string, arquivo: string): string | null {
  if (!/^\d+\.\d+\.\d+$/.test(versao)) return null;
  const name = assetFilename(arquivo);
  if (!name) return null;
  return `${RELEASE_BASE}/v${versao}/${name}`;
}

function publicReleaseIsoUrl(value: unknown, version: string): string {
  if (typeof value !== "string" || !/^\\d+\\.\\d+\\.\\d+$/.test(version)) return "";
  try {
    const parsed = new URL(value);
    const expectedPrefix = `/vinicon14/yamios-releases/releases/download/v${version}/`;
    const asset = parsed.pathname.slice(expectedPrefix.length);
    if (
      parsed.protocol !== "https:" ||
      parsed.hostname !== "github.com" ||
      !parsed.pathname.startsWith(expectedPrefix) ||
      !asset ||
      asset.includes("/") ||
      !assetFilename(asset)
    ) return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function publishedPackageMatches(arquivo: string, sha256: string, tamanho: number): boolean {
  const known = KNOWN_PUBLISHED_PACKAGES[arquivo];
  if (!known) return true;
  return known.tamanho === tamanho && known.sha256 === sha256.toLowerCase();
}

export function toPublicManifest(raw: YamiosManifestSource): PublicYamiosManifest {
  const versao = raw.versao ?? "";
  const pacotes: PublicPacote[] = [];
  for (const pacote of raw.pacotes ?? []) {
    const arquivo = assetFilename(pacote.arquivo) ?? filenameFromUrl(pacote.url);
    const packageVersion = pacote.versao && /^\d+\.\d+\.\d+$/.test(pacote.versao) ? pacote.versao : versao;
    const sha256 = typeof pacote.sha256 === "string" ? pacote.sha256.toLowerCase() : "";
    const tamanho = typeof pacote.tamanho === "number" ? pacote.tamanho : Number.NaN;
    if (!arquivo || !Number.isFinite(tamanho) || tamanho <= 0 || !/^[a-f0-9]{64}$/.test(sha256)) continue;
    if (!publishedPackageMatches(arquivo, sha256, tamanho)) continue;
    const url = releaseAssetUrl(packageVersion, arquivo);
    if (!url) continue;
    pacotes.push({
      versao: packageVersion,
      deVersaoMinima: pacote.deVersaoMinima ?? "",
      url,
      sha256,
      tamanho,
      descricao: pacote.descricao ?? "",
    });
  }

  const isoUrl = raw.iso?.url;
  const publicIsoUrl = typeof isoUrl === "string" && /^https?:\/\//i.test(isoUrl) ? null : isoUrl ?? null;
  // A ISO é pública e gratuita. Preserve o link da release: o endpoint
  // /api/yamios/iso era legado, exigia licença e apontava para a versão 1.0.0.
  // Só aceitamos assets HTTPS do repositório oficial e da tag desta versão.
  const partes = (raw.iso?.partes ?? []).map((part) => ({
    url: publicReleaseIsoUrl(part.url, versao),
    sha256: String(part.sha256 ?? ""),
    tamanho: Number(part.tamanho ?? 0),
  }));

  return {
    produto: raw.produto ?? YAMI_OS_NAME,
    canal: raw.canal ?? "estavel",
    versao,
    build: raw.build ?? "",
    data: raw.data ?? "",
    notas: raw.notas ?? [],
    pacotes,
    iso: {
      url: publicIsoUrl,
      sha256: raw.iso?.sha256 ?? "",
      tamanho: raw.iso?.tamanho ?? 0,
      kernel: raw.iso?.kernel ?? "",
      partes,
      observacao: raw.iso?.observacao ?? "",
    },
    fontes: {
      vercel: raw.fontes?.vercel ?? "",
      github: raw.fontes?.github ?? "",
    },
  };
}

