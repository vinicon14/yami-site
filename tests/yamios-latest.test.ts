import { describe, expect, it } from "vitest";
import raw from "../lib/yamios/latest.json";
import { GET as latestGet } from "../app/api/yamios/latest/route";
import { GET as isoGet } from "../app/api/yamios/iso/[part]/route";
import {
  KNOWN_PUBLISHED_PACKAGES,
  assetFilename,
  releaseAssetUrl,
  toPublicManifest,
} from "../lib/yamios/public-manifest";

const PUBLISHED_NAME = "yami-os-1.0.0-pacote.tar.zst";

describe("manifesto público do YAMI OS", () => {
  it("deriva a URL do pacote publicado e descreve esse pacote", async () => {
    const arquivo = raw.pacotes[0].arquivo;
    expect(assetFilename(arquivo)).toBe(PUBLISHED_NAME);

    const res = await latestGet();
    expect(res.status).toBe(200);
    const body = await res.json();
    const pacote = body.pacotes[0];
    expect(new URL(pacote.url).pathname.split("/").pop()).toBe(arquivo);
    expect(raw.versao).toBe("1.0.0");
    expect(raw.pacotes[0].versao).toBe("1.0.0");
    expect(pacote.versao).toBe("1.0.0");
    expect(pacote.url).toBe(releaseAssetUrl(raw.pacotes[0].versao, arquivo));
    expect(pacote.url).not.toBe(releaseAssetUrl(raw.versao, arquivo));
    expect(pacote.url).not.toContain("/undefined");

    const known = KNOWN_PUBLISHED_PACKAGES[arquivo];
    expect(pacote.tamanho).toBe(known.tamanho);
    expect(pacote.sha256).toBe(known.sha256);
    expect(body.build).toBe("r1");
    expect(body.versao).toBe("1.0.0");
    expect(body.notas).toEqual([]);
    expect(body.pacotes[0].descricao).toBe(raw.pacotes[0].descricao);
    expect(body.pacotes[0].descricao).not.toMatch(/greeter|LightDM|Criar apps/i);
    expect(body.notas.join("\n")).toContain("LightDM");
    expect(body.notas.join("\n")).not.toMatch(/greeter|Criar apps/i);
    expect(body.iso.observacao).toContain("ISO 1.0.0 publicada em duas partes");
    expect(body.iso.partes).toHaveLength(2);
    expect(body.iso.partes.map((part: { url: string }) => part.url)).toEqual([
      "https://github.com/vinicon14/yamios-releases/releases/download/v1.0.0/yami-os-1.0.0.iso.parte01",
      "https://github.com/vinicon14/yamios-releases/releases/download/v1.0.0/yami-os-1.0.0.iso.parte02",
    ]);
    expect(body.iso.partes.map((part: { sha256: string }) => part.sha256)).toEqual([
      "bb490df271b32f6b92de7f45d24b66785b066d9a6d92a73bc5e35c45e6c965e8",
      "a4c8f45c9b22d56c150bdb3953e741f820f1bc8d6e1b245997810e8708b7a544",
    ]);
    expect(body.iso.sha256).toBe("");
    expect(body.iso.tamanho).toBe(3318644736);
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
          descricao: "nome ausente",
        },
        {
          versao: "1.0.0",
          deVersaoMinima: "0.8.0",
          arquivo: PUBLISHED_NAME,
          sha256: "5105ca914fdd202b2f3b7918b4543c0f301840d938a97679d782558afebfa901",
          tamanho: 233028,
          descricao: "sha que não é o do arquivo publicado",
        },
      ],
    });
    expect(hidden.pacotes).toEqual([]);
    expect(JSON.stringify(hidden)).not.toContain("/undefined");

    const outro = toPublicManifest({
      versao: "1.0.0",
      build: "r5",
      notas: ["Pacote que o dono passou a publicar"],
      pacotes: [
        {
          versao: "1.0.0",
          deVersaoMinima: "0.8.0",
          arquivo: "yami-os-1.0.0-r5-pacote.tar.zst",
          sha256: "ab".repeat(32),
          tamanho: 10,
          descricao: "outro arquivo, checksum informado no manifesto",
        },
      ],
    });
    expect(outro.build).toBe("r5");
    expect(outro.pacotes[0].url).toBe(
      "https://github.com/vinicon14/yamios-releases/releases/download/v1.0.0/yami-os-1.0.0-r5-pacote.tar.zst",
    );
  });

  it("expõe somente os assets oficiais e mantém o endpoint legado sem arquivo", async () => {
    const res = await latestGet();
    const body = await res.json();
    expect(body.iso.partes).toHaveLength(2);
    expect(JSON.stringify(body.iso)).not.toContain("/api/yamios/iso");
    expect(JSON.stringify(body.iso)).not.toContain("/api/yamios/iso");

    const iso = await isoGet(new Request("http://localhost/api/yamios/iso/1"), {
      params: Promise.resolve({ part: "1" }),
    });
    expect(iso.status).toBe(404);
    expect(await iso.json()).toEqual({ error: "parte_indisponivel" });

    const invalid = await isoGet(new Request("http://localhost/api/yamios/iso/nope"), {
      params: Promise.resolve({ part: "nope" }),
    });
    expect(invalid.status).toBe(404);
    expect(await invalid.json()).toEqual({ error: "parte_invalida" });
  });
});
