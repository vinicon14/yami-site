import type { FeatureRequest } from "./db/types";

export type AppPlatform = "linux" | "windows";

export function normalizeAppPlatform(value: unknown): AppPlatform {
  return value === "windows" ? "windows" : "linux";
}

export function storeActionLabel(platform: AppPlatform): string {
  return platform === "windows" ? "Baixar para Windows" : "Instalar";
}

export function externalDownloadUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export type CatalogApp = {
  id: string;
  name: string;
  description: string;
  category: string;
  version: string;
  icon: string | null;
  platform: AppPlatform;
  sha256: string | null;
  size: number | null;
  downloadUrl: string;
  publishedAt: string | null;
  actionLabel: string;
};

export function toCatalogApps(items: FeatureRequest[]): CatalogApp[] {
  const apps: CatalogApp[] = [];
  for (const item of items) {
    if (item.status !== "publicada" || !item.fileBlobPathname) continue;
    const downloadUrl = externalDownloadUrl(item.publishedAssetUrl);
    if (!downloadUrl) continue;
    const platform = normalizeAppPlatform(item.appPlatform);
    apps.push({
      id: item.id,
      name: item.title,
      description: item.description,
      category: item.category,
      version: item.appVersion ?? item.publishedVersion ?? "1.0.0",
      icon: item.appIcon,
      platform,
      sha256: item.fileSha256,
      size: item.fileSize,
      downloadUrl,
      publishedAt: item.publishedAt,
      actionLabel: storeActionLabel(platform),
    });
  }
  return apps;
}
