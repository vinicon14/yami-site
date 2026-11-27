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
const CURRENT_NAME = "yami-os-2.0.1-pacote.tar.zst";

describe("manifesto público do YAMI OS", () => {
  it("deriva a URL do pacote publicado e descreve esse pacote", async () => {
    const arquivo = raw.pacotes[0].arquivo;
    expect(assetFilename(arquivo)).toBe(CURRENT_NAME);

    const res = await latestGet();
    expect(res.status).toBe(200);
    const body = await res.json();
    const pacote = body.pacotes[0];
    expect(new URL(pacote.url).pathname.split("/").pop()).toBe(arquivo);
    expect(raw.versao).toBe("2.0.1");
    expect(raw.pacotes[0].versao).toBe("2.0.1");
    expect(pacote.versao).toBe("2.0.1");
    expect(pacote.deVersaoMinima).toBe("1.0.0");
    expect(pacote.url).toBe(releaseAssetUrl(raw.pacotes[0].versao, arquivo));
    expect(pacote.url).toBe(releaseAssetUrl(raw.versao, arquivo));
    expect(pacote.url).not.toContain("/undefined");

    const known = KNOWN_PUBLISHED_PACKAGES[arquivo];
    expect(pacote.tamanho).toBe(known.tamanho);
    expect(pacote.sha256).toBe(known.sha256);
    expect(body.build).toBe("r8");
    expect(body.versao).toBe("2.0.1");
    expect(body.pacotes[0].descricao).toBe(raw.pacotes[0].descricao);
    expect(body.iso.partes).toHaveLength(2);
    expect(body.iso.partes.map((part: { url: string }) => part.url)).toEqual([
      "https://github.com/vinicon14/yamios-releases/releases/download/v2.0.1/yami-os-2.0.0.iso.parte01",
      "https://github.com/vinicon14/yamios-releases/releases/download/v2.0.1/yami-os-2.0.0.iso.parte02",
    ]);
    expect(body.iso.partes.map((part: { sha256: string }) => part.sha256)).toEqual([
      "57398228bf6d84ecd983738e686e8bf02a64f231c01f49f0126159ba79bd9338",
      "ff009e7849f5b05f571f862b055181101a7e9cb01c842917abfe497306c3489b",
    ]);
    expect(body.iso.sha256).toBe("a61fd940d9a2b5944afedc9e72717221ca1a129d3bd3ab14f920fde51cad6913");
    expect(body.iso.urlUnica ?? null).toBeNull();
    expect(body.iso.arquivoUnico).toBe("yami-os-2.0.0.iso");
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
