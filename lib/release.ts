export const RELEASE_KINDS = ["setup", "portable", "apk"] as const;
export type ReleaseKind = (typeof RELEASE_KINDS)[number];

export const RELEASE_LABELS: Record<ReleaseKind, string> = {
  setup: "Instalador Windows",
  portable: "Windows portátil",
  apk: "Aplicativo Android (APK)",
};

export type ReleaseFile = {
  kind: ReleaseKind;
  label: string;
  filename: string;
  version: string;
  size: number;
  sha256: string;
  publishedAt: string;
  blobPathname: string;
  contentType: string;
};

export type ReleaseManifest = {
  version: string;
  publishedAt: string;
  files: Partial<Record<ReleaseKind, ReleaseFile>>;
};

/** Vista pública: sem pathname do Blob e sem URL. */
export type PublicReleaseFile = Omit<ReleaseFile, "blobPathname"> & {
  available: true;
};

export type PublicReleaseManifest = {
  version: string;
  publishedAt: string;
  files: Partial<Record<ReleaseKind, PublicReleaseFile>>;
};

export function isReleaseKind(value: string | null | undefined): value is ReleaseKind {
  return value === "setup" || value === "portable" || value === "apk";
}

export function parseReleaseManifest(input: unknown): ReleaseManifest | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  if (typeof raw.version !== "string" || !raw.version.trim()) return null;
  if (typeof raw.publishedAt !== "string" || !raw.publishedAt) return null;
  const filesIn = raw.files;
  if (!filesIn || typeof filesIn !== "object") return null;
  const files: Partial<Record<ReleaseKind, ReleaseFile>> = {};
  for (const kind of RELEASE_KINDS) {
    const f = (filesIn as Record<string, unknown>)[kind];
    const parsed = parseReleaseFile(kind, f);
    if (parsed) files[kind] = parsed;
  }
  return {
    version: raw.version.trim(),
    publishedAt: raw.publishedAt,
    files,
  };
}

export function parseReleaseFile(kind: ReleaseKind, input: unknown): ReleaseFile | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const filename = typeof raw.filename === "string" ? raw.filename.trim() : "";
  const version = typeof raw.version === "string" ? raw.version.trim() : "";
  const sha256 = typeof raw.sha256 === "string" ? raw.sha256.trim().toLowerCase() : "";
  const blobPathname =
    typeof raw.blobPathname === "string" ? raw.blobPathname.trim() : "";
  const publishedAt = typeof raw.publishedAt === "string" ? raw.publishedAt : "";
  const size = Number(raw.size);
  if (!filename || !version || !blobPathname || !publishedAt) return null;
  if (!/^[a-f0-9]{64}$/.test(sha256)) return null;
  if (!Number.isFinite(size) || size <= 0) return null;
  const contentType =
    typeof raw.contentType === "string" && raw.contentType
      ? raw.contentType
      : defaultContentType(kind);
  const label =
    typeof raw.label === "string" && raw.label
      ? raw.label
      : RELEASE_LABELS[kind];
  return {
    kind,
    label,
    filename,
    version,
    size: Math.floor(size),
    sha256,
    publishedAt,
    blobPathname,
    contentType,
  };
}

export function defaultContentType(kind: ReleaseKind): string {
  if (kind === "apk") return "application/vnd.android.package-archive";
  return "application/octet-stream";
}

export function toPublicManifest(
  manifest: ReleaseManifest,
): PublicReleaseManifest {
  const files: PublicReleaseManifest["files"] = {};
  for (const kind of RELEASE_KINDS) {
    const f = manifest.files[kind];
    if (!f) continue;
    const { blobPathname: _omit, ...rest } = f;
    void _omit;
    files[kind] = { ...rest, available: true };
  }
  return {
    version: manifest.version,
    publishedAt: manifest.publishedAt,
    files,
  };
}

export function formatBytes(size: number): string {
  if (size >= 1024 * 1024 * 1024) {
    return `${(size / (1024 * 1024 * 1024)).toFixed(2).replace(".", ",")} GB`;
  }
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(0)} MB`;
  }
  return `${size} bytes`;
}
