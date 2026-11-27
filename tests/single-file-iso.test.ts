import { afterEach, describe, expect, it } from "vitest";
import { resolveSingleFileIso } from "@/lib/yamios/iso-downloader";
import { validSingleFileUrl } from "@/lib/yamios/single-file";
import { toPublicManifest } from "@/lib/yamios/public-manifest";

const SHA = "a".repeat(64);

describe("ISO em arquivo único (Google Drive)", () => {
  afterEach(() => {
    delete process.env.YAMIOS_ISO_URL_UNICA;
  });

  it("aceita só https de hosts conhecidos", () => {
    expect(validSingleFileUrl("https://drive.google.com/file/d/abc/view")).toBe("https://drive.google.com/file/d/abc/view");
    expect(validSingleFileUrl("http://drive.google.com/file/d/abc")).toBeNull();
    expect(validSingleFileUrl("https://evil.example.com/x.iso")).toBeNull();
    expect(validSingleFileUrl("")).toBeNull();
    expect(validSingleFileUrl(null)).toBeNull();
  });

  it("sem link não mostra arquivo único", () => {
    expect(resolveSingleFileIso({ versao: "2.0.0", iso: { sha256: SHA, tamanho: 10, urlUnica: null } })).toBeNull();
  });

  it("usa iso.urlUnica do manifesto", () => {
    const r = resolveSingleFileIso({ versao: "2.0.0", iso: { sha256: SHA, tamanho: 10, urlUnica: "https://drive.google.com/file/d/x/view" } });
    expect(r?.fileName).toBe("yami-os-2.0.0.iso");
    expect(r?.sha256).toBe(SHA);
  });

  it("a variável de ambiente tem prioridade e vai para o manifesto público", () => {
    process.env.YAMIOS_ISO_URL_UNICA = "https://drive.google.com/uc?id=env";
    expect(resolveSingleFileIso({ versao: "2.0.0", iso: { tamanho: 10, urlUnica: "https://drive.google.com/file/d/x/view" } })?.href).toBe("https://drive.google.com/uc?id=env");
    expect(toPublicManifest({ versao: "2.0.0", iso: { tamanho: 10 } }).iso.urlUnica).toBe("https://drive.google.com/uc?id=env");
  });
});
