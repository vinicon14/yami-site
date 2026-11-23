export type AppPlatform = "linux" | "windows";

export function normalizeAppPlatform(value: unknown): AppPlatform {
  return value === "windows" ? "windows" : "linux";
}

/** Rótulo mostrado na loja do site e no contrato de /api/apps. */
export function storeActionLabel(platform: AppPlatform): string {
  return platform === "windows" ? "Baixar para Windows" : "Instalar";
}

/** URL http(s) absoluta para o botão de download. Rejeita outros esquemas. */
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
