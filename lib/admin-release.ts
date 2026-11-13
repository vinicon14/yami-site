import { randomBytes } from "node:crypto";
import {
  defaultContentType,
  isReleaseKind,
  parseReleaseFile,
  RELEASE_KINDS,
  RELEASE_LABELS,
  type ReleaseFile,
  type ReleaseKind,
  type ReleaseManifest,
} from "./release";

export const MAX_RELEASE_BYTES = 500 * 1024 * 1024;
export const RELEASE_PATH_RE =
  /^releases\/(\d+\.\d+\.\d+(?:[.-][A-Za-z0-9.-]+)?)\/([a-f0-9]{32})\/([A-Za-z0-9._+-]+\.(exe|apk))$/;
export const VERSION_RE = /^\d+\.\d+\.\d+(?:[.-][A-Za-z0-9.-]+)?$/;

export function extensionForKind(kind: ReleaseKind): "exe" | "apk" {
  return kind === "apk" ? "apk" : "exe";
}

export function allowedContentTypes(kind: ReleaseKind): string[] {
  if (kind === "apk") {
    return [
      "application/vnd.android.package-archive",
      "application/octet-stream",
      "application/zip",
      "application/java-archive",
    ];
  }
  return [
    "application/octet-stream",
    "application/x-msdownload",
    "application/vnd.microsoft.portable-executable",
    "application/x-msdos-program",
    "application/exe",
  ];
}

export function sanitizeFilename(name: string): string {
  const base = name.replace(/\\/g, "/").split("/").pop() ?? "";
  return base.replace(/[^A-Za-z0-9._+-]/g, "_");
}

export function validateVersion(version: string): string | null {
  const v = version.trim();
  if (!VERSION_RE.test(v)) return "informe a versão no formato X.Y.Z";
  return null;
}

export function validateUploadMeta(input: {
  kind: string;
  filename: string;
  version: string;
  size: number;
  sha256?: string;
}): { ok: true; kind: ReleaseKind; filename: string; version: string; size: number; sha256?: string } | { ok: false; error: string } {
  if (!isReleaseKind(input.kind)) return { ok: false, error: "tipo de arquivo inválido" };
  const versionError = validateVersion(input.version);
  if (versionError) return { ok: false, error: versionError };
  const filename = sanitizeFilename(input.filename);
  if (!filename) return { ok: false, error: "nome de arquivo inválido" };
  const ext = extensionForKind(input.kind);
  if (!filename.toLowerCase().endsWith(`.${ext}`)) {
    return { ok: false, error: `o arquivo precisa terminar em .${ext}` };
  }
  const size = Number(input.size);
  if (!Number.isFinite(size) || size <= 0) return { ok: false, error: "tamanho inválido" };
  if (size > MAX_RELEASE_BYTES) return { ok: false, error: "o arquivo passa de 500 MB" };
  let sha256: string | undefined;
  if (input.sha256 !== undefined) {
    const hash = input.sha256.trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(hash)) return { ok: false, error: "SHA256 inválido" };
    sha256 = hash;
  }
  return {
    ok: true,
    kind: input.kind,
    filename,
    version: input.version.trim(),
    size: Math.floor(size),
    sha256,
  };
}

export function randomReleasePathname(version: string, filename: string): string {
  const token = randomBytes(16).toString("hex");
  const safe = sanitizeFilename(filename);
  return `releases/${version.trim()}/${token}/${safe}`;
}

export function parseClientUploadPayload(raw: string | null): {
  kind?: string;
  filename?: string;
  version?: string;
  size?: number;
  sha256?: string;
} {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      kind: typeof parsed.kind === "string" ? parsed.kind : undefined,
      filename: typeof parsed.filename === "string" ? parsed.filename : undefined,
      version: typeof parsed.version === "string" ? parsed.version : undefined,
      size: typeof parsed.size === "number" ? parsed.size : Number(parsed.size),
      sha256: typeof parsed.sha256 === "string" ? parsed.sha256 : undefined,
    };
  } catch {
    return {};
  }
}

export function assertUploadPathname(pathname: string, meta: {
  kind: ReleaseKind;
  version: string;
  filename: string;
}): string | null {
  const match = pathname.match(RELEASE_PATH_RE);
  if (!match) return "caminho de upload inválido";
  const [, version, , file] = match;
  if (version !== meta.version) return "a versão do caminho não confere";
  if (file !== sanitizeFilename(meta.filename)) return "o nome do arquivo não confere";
  const ext = extensionForKind(meta.kind);
  if (!file.toLowerCase().endsWith(`.${ext}`)) return "extensão do caminho não confere";
  return null;
}

export function applyReleaseFile(
  previous: ReleaseManifest | null,
  file: ReleaseFile,
): ReleaseManifest {
  const files = { ...(previous?.files ?? {}), [file.kind]: file };
  const version =
    files.setup?.version ??
    files.portable?.version ??
    files.apk?.version ??
    file.version;
  return {
    version,
    publishedAt: file.publishedAt,
    files,
  };
}

export function buildReleaseFile(input: {
  kind: ReleaseKind;
  filename: string;
  version: string;
  size: number;
  sha256: string;
  blobPathname: string;
  publishedAt?: string;
}): ReleaseFile | null {
  return parseReleaseFile(input.kind, {
    kind: input.kind,
    label: RELEASE_LABELS[input.kind],
    filename: input.filename,
    version: input.version,
    size: input.size,
    sha256: input.sha256,
    publishedAt: input.publishedAt ?? new Date().toISOString(),
    blobPathname: input.blobPathname,
    contentType: defaultContentType(input.kind),
  });
}

export function publicHistoryItem(entry: {
  id: string;
  kind: ReleaseKind;
  payload: ReleaseFile;
  uploadedByEmail: string;
  createdAt: string;
}) {
  return {
    id: entry.id,
    kind: entry.kind,
    filename: entry.payload.filename,
    version: entry.payload.version,
    size: entry.payload.size,
    sha256: entry.payload.sha256,
    publishedAt: entry.payload.publishedAt,
    uploadedByEmail: entry.uploadedByEmail,
    createdAt: entry.createdAt,
  };
}

export { RELEASE_KINDS, RELEASE_LABELS };
