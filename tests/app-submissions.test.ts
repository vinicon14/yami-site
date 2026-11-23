import { describe, expect, it } from "vitest";
import { validateAppFile } from "../lib/app-submissions";

describe("validação de app", () => {
  it("aceita AppImage e tar.zst válidos", () => {
    expect(validateAppFile({ name: "app.AppImage", size: 1000, sha256: "a".repeat(64) })).toEqual({ ok: true });
    expect(validateAppFile({ name: "app.tar.zst", size: 1000, sha256: "a".repeat(64) })).toEqual({ ok: true });
  });

  it("rejeita formato, tamanho ou hash inválidos", () => {
    expect(validateAppFile({ name: "app.exe", size: 1000, sha256: "a".repeat(64) }).ok).toBe(false);
    expect(validateAppFile({ name: "app.AppImage", size: 600 * 1024 * 1024, sha256: "a".repeat(64) }).ok).toBe(false);
    expect(validateAppFile({ name: "app.AppImage", size: 1000, sha256: "abc" }).ok).toBe(false);
  });
});
