import { randomBytes } from "node:crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateLicenseKey(): string {
  const bytes = randomBytes(16);
  const chars: string[] = [];
  for (const b of bytes) {
    chars.push(ALPHABET[b % ALPHABET.length]!);
  }
  const s = chars.join("");
  return `YAMI-${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}`;
}

export function isLicenseKeyFormat(value: string): boolean {
  return /^YAMI-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(
    value,
  );
}
