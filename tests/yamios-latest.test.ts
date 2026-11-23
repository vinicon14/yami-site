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
    expect(pacote.url).toBe(releaseAssetUrl(raw.versao, arquivo));
    expect(pacote.url).not.toContain("/undefined");

    const known = KNOWN_PUBLISHED_PACKAGES[arquivo];
    expect(pacote.tamanho).toBe(known.tamanho);
    expect(pacote.sha256).toBe(known.sha256);
    expect(body.build).toBe("r1");
    expect(body.notas).toEqual(raw.notas);
    expect(body.pacotes[0].descricao).toBe(raw.pacotes[0].descricao);
    const texto = [...body.notas, body.pacotes[0].descricao].join("\n");
    expect(texto).not.toMatch(/greeter|LightDM|Criar apps/i);
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

  it("mantém a ISO só no caminho com licença", async () => {
    const res = await latestGet();
    const body = await res.json();
    expect(body.iso.partes.map((part: { url: string }) => part.url)).toEqual([
      "/api/yamios/iso/1",
      "/api/yamios/iso/2",
    ]);
    expect(JSON.stringify(body.iso)).not.toContain("github.com");
    expect(JSON.stringify(body)).not.toMatch(/https?:\/\/[^"]+\.iso/);

    const iso = await isoGet(new Request("http://localhost/api/yamios/iso/1"), {
      params: Promise.resolve({ part: "1" }),
    });
    expect(iso.status).toBe(401);
  });
});
