/** Hosts aceitos para o download em arquivo único (a ISO inteira fica no Google Drive). */
const SINGLE_FILE_HOSTS = new Set([
  "drive.google.com",
  "drive.usercontent.google.com",
  "docs.google.com",
  "github.com",
]);


export function validSingleFileUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" || !SINGLE_FILE_HOSTS.has(parsed.hostname)) return null;
    if (parsed.pathname.replace(/\/+$/, "").startsWith("/api/yamios/iso")) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}
