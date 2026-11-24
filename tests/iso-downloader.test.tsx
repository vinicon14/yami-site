import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { IsoDownloader } from "../components/IsoDownloader";
import { YamiOsPromo } from "../components/YamiOsPromo";
import HomePage from "../app/(site)/page";
import raw from "../lib/yamios/latest.json";
import { YAMI_OS_FREE_ISO_FROM, YAMI_OS_ISO_SOON, YAMI_OS_NAME, yamiOsPromoCopy } from "../lib/yamios/brand";
import { releaseAssetUrl } from "../lib/yamios/public-manifest";
import {
  isVersionAtLeast,
  resolveFreeIsoDownload,
  type IsoManifestSource,
} from "../lib/yamios/iso-downloader";

const ISO_SHA = "c".repeat(64);
const PART_A = "a".repeat(64);
const PART_B = "b".repeat(64);

function readyManifest(overrides: IsoManifestSource = {}): IsoManifestSource {
  return {
    versao: "1.1.0",
    iso: {
      sha256: ISO_SHA,
      tamanho: 3_000_000_000,
      partes: [
        {
          url: "https://github.com/vinicon14/yamios-releases/releases/download/v1.1.0/yami-os-1.1.0.iso.parte01",
          sha256: PART_A,
          tamanho: 1_800_000_000,
        },
        {
          url: "https://github.com/vinicon14/yamios-releases/releases/download/v1.1.0/yami-os-1.1.0.iso.parte02",
          sha256: PART_B,
          tamanho: 1_200_000_000,
        },
      ],
    },
    ...overrides,
  };
}

const beforeFree: IsoManifestSource = {
  versao: "1.0.0",
  iso: {
    sha256: ISO_SHA,
    tamanho: 3318644736,
    partes: [
      { url: "/api/yamios/iso/1", sha256: PART_A, tamanho: 1992294400 },
      { url: "/api/yamios/iso/2", sha256: PART_B, tamanho: 1326350336 },
    ],
  },
};

describe("baixador gratuito da ISO", () => {
  it("mantém o nome oficial numa constante", () => {
    expect(YAMI_OS_NAME).toBe("YAMI OS");
    expect(YAMI_OS_FREE_ISO_FROM).toBe("1.1.0");
    expect(raw.produto).toBe(YAMI_OS_NAME);
    expect(yamiOsPromoCopy(false).windowsOffer).toContain("pagar para usar a YAMI no Windows");
    expect(yamiOsPromoCopy(true).windowsOffer).toContain("pagar para usar a YAMI no Windows");
  });

  it("não promete download grátis enquanto a versão for menor que 1.1.0", () => {
    expect(isVersionAtLeast(beforeFree.versao, "1.1.0")).toBe(false);
    expect(yamiOsPromoCopy(false).title).toBe("O download gratuito do YAMI OS estará disponível em breve");
    expect(yamiOsPromoCopy(false).title).not.toContain("de graça para baixar");

    const html = renderToStaticMarkup(<YamiOsPromo source={beforeFree} />);
    expect(html).toContain("O download gratuito do YAMI OS estará disponível em breve");
    expect(html).not.toContain("de graça para baixar");
    expect(html).toContain("pagar para usar a YAMI no Windows");
    expect(html).toContain('data-iso-offer="soon"');
    expect(html).toContain("A ISO ainda não está disponível para download.");
    const soon = html.slice(html.indexOf('data-iso-offer="soon"'));
    expect(soon).not.toMatch(/gratuito|grátis|de graça/i);
    expect(soon).not.toMatch(/<a[\s>]/);
  });

  it("diz que é de graça para baixar a partir da 1.1.0", () => {
    const source = readyManifest();
    expect(yamiOsPromoCopy(true).title).toBe("O YAMI OS é de graça para baixar");

    const html = renderToStaticMarkup(<YamiOsPromo source={source} />);
    expect(html).toContain("O YAMI OS é de graça para baixar");
    expect(html).not.toContain("vai ser grátis");
    expect(html).toContain("Download gratuito");
    expect(html).toContain("Não pede licença");
    expect(html).toContain('data-iso-offer="ready"');
  });

  it("fica desativado na 1.0.0, sem link", () => {
    const offer = resolveFreeIsoDownload(beforeFree);
    expect(offer.active).toBe(false);
    if (offer.active) return;
    expect(offer.message).toBe(YAMI_OS_ISO_SOON);

    const html = renderToStaticMarkup(<IsoDownloader source={beforeFree} />);
    expect(html).toContain("A ISO ainda não está disponível para download.");
    expect(html).not.toMatch(/gratuito|grátis|de graça/i);
    expect(html).not.toMatch(/<a[\s>]/);
    expect(html).not.toContain("href=");
    expect(html).toContain('data-iso-offer="soon"');
  });

  it("não anuncia a ISO 1.1.0 enquanto a Release oficial não existe", () => {
    expect(raw.versao).toBe("1.1.0");
    expect(raw.iso.partes).toEqual([]);
    expect(raw.iso.sha256).toBe("");
    expect(raw.iso.tamanho).toBe(0);

    const offer = resolveFreeIsoDownload(raw);
    expect(offer.active).toBe(false);

    const promo = renderToStaticMarkup(<YamiOsPromo source={raw} />);
    expect(promo).toContain("O download gratuito do YAMI OS estará disponível em breve");
    expect(promo).toContain('data-iso-offer="soon"');
    expect(promo).not.toContain("Download gratuito");
    expect(promo).not.toContain("de graça para baixar");
    expect(promo).not.toContain("/api/yamios/iso");

    const page = renderToStaticMarkup(<IsoDownloader source={raw} />);
    expect(page).toContain("A ISO ainda não está disponível para download.");
    expect(page).not.toContain("href=");
  });

  it("não libera a 1.1.0 se a ISO ainda aponta para o caminho com licença", () => {
    const licensed = readyManifest({
      iso: {
        sha256: ISO_SHA,
        tamanho: 3_000_000_000,
        partes: [
          { url: "/api/yamios/iso/1", sha256: PART_A, tamanho: 10 },
          { url: "https://yami-site-pi.vercel.app/api/yamios/iso/2", sha256: PART_B, tamanho: 10 },
        ],
      },
    });
    expect(resolveFreeIsoDownload(licensed).active).toBe(false);
    const html = renderToStaticMarkup(<IsoDownloader source={licensed} />);
    expect(html).not.toContain("href=");
  });

  it("ativa na 1.1.0 com partes públicas, tamanho, SHA-256 e como juntar", () => {
    const source = readyManifest();
    const offer = resolveFreeIsoDownload(source);
    expect(offer.active).toBe(true);
    if (!offer.active) return;
    expect(offer.version).toBe("1.1.0");
    expect(offer.sha256).toBe(ISO_SHA);
    expect(offer.parts.map((part) => part.href)).toEqual([
      "https://github.com/vinicon14/yamios-releases/releases/download/v1.1.0/yami-os-1.1.0.iso.parte01",
      "https://github.com/vinicon14/yamios-releases/releases/download/v1.1.0/yami-os-1.1.0.iso.parte02",
    ]);
    expect(offer.linux.join("\n")).toContain("sha256sum parte01");
    expect(offer.linux.join("\n")).toContain("cat parte01 parte02 > yami-os-amd64.iso");
    expect(offer.linux.join("\n")).toContain("sha256sum yami-os-amd64.iso");
    expect(offer.windows.join("\n")).toContain("certutil -hashfile parte01 SHA256");
    expect(offer.windows.join("\n")).toContain("copy /b parte01+parte02 yami-os-amd64.iso");
    expect(offer.windows.join("\n")).toContain("certutil -hashfile yami-os-amd64.iso SHA256");

    const html = renderToStaticMarkup(<IsoDownloader source={source} />);
    expect(html).toContain('data-iso-offer="ready"');
    expect(html).toContain("Não pede licença");
    expect(html).toContain(PART_A);
    expect(html).toContain(ISO_SHA);
    expect(html).toContain("Linux");
    expect(html).toContain("Windows");
    expect(html).not.toContain("/api/yamios/iso");
    expect(html).toContain("Baixar a parte 1");
    expect(html).toContain("Salve como parte02.");
  });

  it("aceita arquivo da release e versões acima de 1.1.0", () => {
    const arquivo = "yami-os-1.2.0.iso.parte01";
    const source = readyManifest({
      versao: "1.2.0",
      iso: {
        sha256: ISO_SHA,
        tamanho: 4096,
        partes: [{ arquivo, sha256: PART_A, tamanho: 2048 }],
      },
    });
    const offer = resolveFreeIsoDownload(source);
    expect(offer.active).toBe(true);
    if (!offer.active) return;
    expect(offer.parts[0].href).toBe(releaseAssetUrl("1.2.0", arquivo));
    expect(resolveFreeIsoDownload(readyManifest({ versao: "2.0.0" })).active).toBe(true);
    expect(resolveFreeIsoDownload(readyManifest({ versao: "1.10.0" })).active).toBe(true);
    expect(isVersionAtLeast("1.1.0", "1.1.0")).toBe(true);
  });

  it("permanece em breve sem versão suficiente ou sem ISO utilizável", () => {
    expect(resolveFreeIsoDownload(readyManifest({ versao: "1.0.9" })).active).toBe(false);
    expect(resolveFreeIsoDownload(readyManifest({ versao: "1.1" })).active).toBe(false);
    expect(resolveFreeIsoDownload({ versao: "1.1.0" }).active).toBe(false);
    expect(
      resolveFreeIsoDownload({
        versao: "1.1.0",
        iso: { sha256: ISO_SHA, tamanho: 10, url: null, partes: [] },
      }).active,
    ).toBe(false);
    const broken = readyManifest();
    broken.iso?.partes?.push({ url: "http://inseguro.example/parte03", sha256: PART_A, tamanho: 10 });
    expect(resolveFreeIsoDownload(broken).active).toBe(false);
  });

  it("trata uma ISO única em https como download direto", () => {
    const href = "https://github.com/vinicon14/yamios-releases/releases/download/v1.1.0/yami-os-1.1.0.iso";
    const offer = resolveFreeIsoDownload({
      versao: "1.1.0",
      iso: { sha256: ISO_SHA, tamanho: 4096, url: href, partes: [] },
    });
    expect(offer.active).toBe(true);
    if (!offer.active) return;
    expect(offer.parts).toEqual([
      { index: 1, fileName: "yami-os-amd64.iso", href, sha256: ISO_SHA, tamanho: 4096 },
    ]);
    expect(offer.linux.join("\n")).not.toContain("cat ");
    expect(offer.windows.join("\n")).toContain("certutil -hashfile yami-os-amd64.iso SHA256");
    expect(offer.windows.join("\n")).not.toContain("copy /b");
  });
});
