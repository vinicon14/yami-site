import { describe, expect, it } from "vitest";
import raw from "../lib/yamios/latest.json";
import { GET as latestGet } from "../app/api/yamios/latest/route";
import { GET as isoGet } from "../app/api/yamios/iso/[part]/route";
import {
  KNOWN_PUBLISHED_PACKAGES,
  assetFilename,
  isoDownloadUrl,
  releaseAssetUrl,
  toPublicManifest,
} from "../lib/yamios/public-manifest";

describe("manifesto público do YAMI OS", () => {
  it("deriva a URL do pacote a partir do nome do arquivo", async () => {
    const arquivo = raw.pacotes[0].arquivo;
    expect(assetFilename(arquivo)).toBe(arquivo);
    expect(arquivo).not.toBe("undefined");

    const res = await latestGet();
    expect(res.status).toBe(200);
    const body = await res.json();
    const pacote = body.pacotes[0];
    const filename = new URL(pacote.url).pathname.split("/").pop();
    expect(filename).toBe(arquivo);
    expect(pacote.url).toBe(releaseAssetUrl(raw.versao, arquivo));
    expect(pacote.url).not.toContain("/undefined");

    const known = KNOWN_PUBLISHED_PACKAGES[arquivo];
    if (known) {
      expect(pacote.tamanho).toBe(known.tamanho);
      expect(pacote.sha256).toBe(known.sha256);
    }
  });

  it("não publica URL com arquivo undefined nem anuncia sha divergente do asset conhecido", () => {
    const hidden = toPublicManifest({
      versao: "1.0.0",
      pacotes: [
        {
          versao: "1.0.0",
          deVersaoMinima: "0.8.0",
          url: "https://github.com/vinicon14/yamios-releases/releases/download/v1.0.0/undefined",
          sha256: "5105ca914fdd202b2f3b7918b4543c0f301840d938a97679d782558afebfa901",
          tamanho: 233028,
          descricao: "r5 não publicada",
        },
        {
          versao: "1.0.0",
          deVersaoMinima: "0.8.0",
          arquivo: "yami-os-1.0.0-pacote.tar.zst",
          sha256: "5105ca914fdd202b2f3b7918b4543c0f301840d938a97679d782558afebfa901",
          tamanho: 233028,
          descricao: "sha que não é o do arquivo publicado",
        },
      ],
    });
    expect(hidden.pacotes).toEqual([]);
    expect(JSON.stringify(hidden)).not.toContain("/undefined");

    const published = toPublicManifest({
      versao: "1.0.0",
      build: "r6",
      pacotes: [
        {
          versao: "1.0.0",
          deVersaoMinima: "0.8.0",
          arquivo: "yami-os-1.0.0-r6-pacote.tar.zst",
          sha256: "ab".repeat(32),
          tamanho: 10,
          descricao: "nome novo, checksum informado pelo dono",
        },
      ],
    });
    expect(published.pacotes[0].url).toBe(
      "https://github.com/vinicon14/yamios-releases/releases/download/v1.0.0/yami-os-1.0.0-r6-pacote.tar.zst",
    );
  });

  it("não expõe URL pública da ISO e exige login na parte 1", async () => {
    const res = await latestGet();
    const body = await res.json();
    expect(body.iso.partes.map((part: { url: string }) => part.url)).toEqual([
      "/api/yamios/iso/1",
      "/api/yamios/iso/2",
    ]);
    expect(JSON.stringify(body.iso)).not.toContain("github.com");
    expect(JSON.stringify(body)).not.toMatch(/https?:\/\/[^"]+\.iso/);

    expect(isoDownloadUrl(raw, "1")).toBe(
      "https://github.com/vinicon14/yamios-releases/releases/download/v1.0.0/yami-os-1.0.0.iso.parte01",
    );
    expect(isoDownloadUrl({ versao: "1.0.0", iso: { partes: [{ url: "https://github.com/vinicon14/yamios-releases/releases/download/v1.0.0/undefined" }] } }, "1")).toBeNull();

    const iso = await isoGet(new Request("http://localhost/api/yamios/iso/1"), {
      params: Promise.resolve({ part: "1" }),
    });
    expect(iso.status).toBe(401);
  });
});
