import type { SignupIpQuotaInput, SignupIpQuotaResult, UploadQuotaInput, UploadQuotaResult } from "./types";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function assertUploadQuotaInput(input: UploadQuotaInput): void {
  if (typeof input.userId !== "string" || input.userId.length < 1 || input.userId.length > 200) {
    throw new Error("usuario_invalido");
  }
  if (!DAY.test(input.day)) throw new Error("dia_invalido");
  if (!Number.isSafeInteger(input.bytes) || input.bytes < 0) throw new Error("bytes_invalidos");
  if (!Number.isSafeInteger(input.maxCount) || input.maxCount < 0) throw new Error("limite_invalido");
  if (!Number.isSafeInteger(input.maxBytes) || input.maxBytes < 0) throw new Error("limite_invalido");
}

export function assertSignupIpQuotaInput(input: SignupIpQuotaInput): void {
  if (typeof input.ip !== "string" || input.ip.length < 1 || input.ip.length > 80) {
    throw new Error("ip_invalido");
  }
  if (!DAY.test(input.day)) throw new Error("dia_invalido");
  if (!Number.isSafeInteger(input.maxCount) || input.maxCount < 0) throw new Error("limite_invalido");
}

export function uploadQuotaArgs(input: UploadQuotaInput): [string, string, number, number, number, number, number, number] {
  return [
    input.userId,
    input.day,
    input.bytes,
    input.bytes,
    input.maxBytes,
    input.maxCount,
    input.maxCount,
    input.maxBytes,
  ];
}

export function signupIpQuotaArgs(input: SignupIpQuotaInput): [string, string, number, number] {
  return [input.ip, input.day, input.maxCount, input.maxCount];
}

export function uploadQuotaFromRow(
  row: { count?: number | bigint | string; bytes?: number | bigint | string } | undefined | null,
): UploadQuotaResult {
  if (!row || row.count == null || row.bytes == null) return { ok: false, code: "cota_diaria_excedida" };
  return { ok: true, count: Number(row.count), bytes: Number(row.bytes) };
}

export function signupQuotaFromRow(
  row: { count?: number | bigint | string } | undefined | null,
): SignupIpQuotaResult {
  if (!row || row.count == null) return { ok: false, code: "limite_ip_cadastro" };
  return { ok: true, count: Number(row.count) };
}
