import { YAMI_OS_FREE_ISO_FROM, YAMI_OS_ISO_SOON } from "@/lib/yamios/brand";
import { assetFilename, filenameFromUrl, releaseAssetUrl } from "@/lib/yamios/public-manifest";

export type IsoPartSource = {
  url?: string;
  arquivo?: string;
  sha256?: string;
  tamanho?: number;
};

export type IsoManifestSource = {
  versao?: string;
  iso?: {
    url?: string | null;
    sha256?: string;
    tamanho?: number;
    partes?: IsoPartSource[];
  } | null;
};

export type FreeIsoPart = {
  index: number;
  fileName: string;
  href: string;
  sha256: string;
  tamanho: number;
};

export type FreeIsoReady = {
  active: true;
  version: string;
  sha256: string;
  tamanho: number;
  parts: FreeIsoPart[];
  linux: string[];
  windows: string[];
};

export type FreeIsoSoon = {
  active: false;
  message: string;
};

const SHA256 = /^[a-f0-9]{64}$/;
const SOON: FreeIsoSoon = { active: false, message: YAMI_OS_ISO_SOON };

export function parseSemver(value: string | undefined): [number, number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec((value ?? "").trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function isVersionAtLeast(version: string | undefined, minimum: string): boolean {
  const current = parseSemver(version);
  const floor = parseSemver(minimum);
  if (!current || !floor) return false;
  for (let index = 0; index < 3; index += 1) {
    if (current[index] > floor[index]) return true;
    if (current[index] < floor[index]) return false;
  }
  return true;
}

export function formatByteSize(bytes: number): string {
  const units = [
    { size: 1024 ** 3, label: "GB", digits: 1 },
    { size: 1024 ** 2, label: "MB", digits: 0 },
    { size: 1024, label: "KB", digits: 0 },
  ];
  for (const unit of units) {
    if (bytes >= unit.size) {
      const value = bytes / unit.size;
      const formatted = value.toLocaleString("pt-BR", {
        minimumFractionDigits: unit.digits,
        maximumFractionDigits: unit.digits,
      });
      return `${formatted} ${unit.label}`;
    }
  }
  return `${bytes.toLocaleString("pt-BR")} bytes`;
}

function isLicenseGateUrl(url: string): boolean {
  try {
    const parsed = new URL(url, "https://yami-site-pi.vercel.app");
    return parsed.pathname.replace(/\/+$/, "").startsWith("/api/yamios/iso");
  } catch {
    return true;
  }
}

/** URL pública da parte. O caminho com licença não entra no download gratuito. */
export function publicIsoHref(version: string, part: IsoPartSource): string | null {
  const arquivo = assetFilename(part.arquivo);
  if (arquivo) return releaseAssetUrl(version, arquivo);

  const url = part.url?.trim() ?? "";
  if (!/^https:\/\/[^\s/]+\/\S+$/i.test(url)) return null;
  if (isLicenseGateUrl(url)) return null;
  return url;
}

function partFileName(index: number): string {
  return `parte${String(index + 1).padStart(2, "0")}`;
}

function validDigest(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const digest = value.trim().toLowerCase();
  return SHA256.test(digest) ? digest : null;
}

function validSize(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function windowsJoin(names: string[]): string {
  if (names.length === 1) return `copy /b ${names[0]} yami-os-amd64.iso`;
  return `copy /b ${names.join("+")} yami-os-amd64.iso`;
}

function instructions(parts: FreeIsoPart[], isoSha: string): { linux: string[]; windows: string[] } {
  const names = parts.map((part) => part.fileName);
  const linux = names.map((name) => `sha256sum ${name}`);
  const windows = names.map((name) => `certutil -hashfile ${name} SHA256`);
  if (parts.length > 1) {
    linux.push(`cat ${names.join(" ")} > yami-os-amd64.iso`);
    linux.push("sha256sum yami-os-amd64.iso");
    windows.push(windowsJoin(names));
    windows.push("certutil -hashfile yami-os-amd64.iso SHA256");
  }
  if (isoSha) {
    linux.push(`# SHA-256 esperado da ISO: ${isoSha}`);
    windows.push(`rem SHA-256 esperado da ISO: ${isoSha}`);
  } else {
    linux.push("# O manifesto nao publica o SHA-256 da ISO montada; os SHA-256 das partes sao verificados pelo script.");
    windows.push("rem O manifesto nao publica o SHA-256 da ISO montada; confira os SHA-256 das partes.");
  }
  return { linux, windows };
}

/**
 * O baixador gratuito só abre quando o manifesto anuncia versão >= 1.1.0
 * e a ISO tem SHA-256, tamanho e partes com URL https pública ou `arquivo`
 * na release. `/api/yamios/iso/N` continua de fora: esse caminho pede licença.
 */
export function resolveFreeIsoDownload(source: IsoManifestSource): FreeIsoReady | FreeIsoSoon {
  const version = source.versao?.trim() ?? "";
  if (!isVersionAtLeast(version, YAMI_OS_FREE_ISO_FROM)) return SOON;

  const iso = source.iso;
  const isoSha = validDigest(iso?.sha256);
  const isoSize = validSize(iso?.tamanho);
  if (!iso || !isoSize) return SOON;

  const rawParts = iso.partes ?? [];
  if (!isoSha && rawParts.length === 0) return SOON;
  const parts: FreeIsoPart[] = [];
  for (let index = 0; index < rawParts.length; index += 1) {
    const part = rawParts[index];
    const href = publicIsoHref(version, part);
    const sha256 = validDigest(part.sha256);
    const tamanho = validSize(part.tamanho);
    if (!href || !sha256 || !tamanho) return SOON;
    parts.push({
      index: index + 1,
      fileName: assetFilename(part.arquivo) ?? filenameFromUrl(part.url) ?? partFileName(index),
      href,
      sha256,
      tamanho,
    });
  }

  if (parts.length === 0) {
    const single = typeof iso.url === "string" ? publicIsoHref(version, { url: iso.url }) : null;
    if (!single) return SOON;
    parts.push({
      index: 1,
      fileName: "yami-os-amd64.iso",
      href: single,
      sha256: isoSha,
      tamanho: isoSize,
    });
    return {
      active: true,
      version,
      sha256: isoSha,
      tamanho: isoSize,
      parts,
      linux: [`sha256sum ${parts[0].fileName}`, `# ${isoSha}`],
      windows: [`certutil -hashfile ${parts[0].fileName} SHA256`, `rem ${isoSha}`],
    };
  }

  const commands = instructions(parts, isoSha);
  return {
    active: true,
    version,
    sha256: isoSha,
    tamanho: isoSize,
    parts,
    linux: commands.linux,
    windows: commands.windows,
  };
}
