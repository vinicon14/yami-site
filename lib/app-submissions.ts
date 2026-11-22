const MAX_APP_BYTES = 500 * 1024 * 1024;
const ALLOWED = [".AppImage", ".tar.zst"];

export function validateAppFile(input: { name: string; size: number; sha256: string }) {
  const name = String(input?.name ?? "").trim();
  const size = Number(input?.size);
  const sha256 = String(input?.sha256 ?? "").trim().toLowerCase();
  if (!ALLOWED.some((ext) => name.toLowerCase().endsWith(ext.toLowerCase()))) return { ok: false, reason: "formato_invalido" };
  if (!Number.isFinite(size) || size <= 0 || size > MAX_APP_BYTES) return { ok: false, reason: "tamanho_invalido" };
  if (!/^[a-f0-9]{64}$/.test(sha256)) return { ok: false, reason: "sha256_invalido" };
  return { ok: true };
}
