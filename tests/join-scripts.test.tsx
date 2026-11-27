import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { InstallGuide } from "../components/install/InstallGuide";
import { GET as scriptGet } from "../app/api/yamios/scripts/[kind]/route";
import raw from "../lib/yamios/latest.json";
import { BOOT_MENU_KEYS } from "../lib/install-guide";
import { buildJoinScripts, type JoinManifestSource } from "../lib/yamios/join-scripts";
import InstalarYamiOsPage from "../app/(site)/instalar-yami-os/page";

const exec = promisify(execFile);
const sha = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");

function manifest(overrides: JoinManifestSource = {}): JoinManifestSource {
  return {
    versao: "9.9.9",
    iso: {
      sha256: "c".repeat(64),
      tamanho: 30,
      partes: [
        { arquivo: "alfa.parte01", sha256: "a".repeat(64), tamanho: 10 },
        { arquivo: "beta.parte02", sha256: "b".repeat(64), tamanho: 20 },
      ],
    },
    ...overrides,
  };
}

async function run(command: string, args: string[], cwd: string) {
  try {
    const result = await exec(command, args, { cwd, encoding: "utf8" });
    return { code: 0, output: `${result.stdout}\n${result.stderr ?? ""}` };
  } catch (error) {
    const failed = error as { code?: number; stdout?: string; stderr?: string };
    return {
      code: typeof failed.code === "number" ? failed.code : 1,
      output: `${failed.stdout ?? ""}\n${failed.stderr ?? ""}`,
    };
  }
}

describe("scripts de juntar a ISO", () => {
  it("monta duas partes com nomes e sha256 vindos do manifesto", () => {
    const source = manifest();
    const bundle = buildJoinScripts(source);
    expect(bundle).not.toBeNull();
    if (!bundle) return;

    expect(bundle.parts.map((part) => part.fileName)).toEqual(["alfa.parte01", "beta.parte02"]);
    expect(bundle.isoFileName).toBe("yami-os-9.9.9-amd64.iso");
    expect(bundle.isoSha256).toBe("c".repeat(64));
    expect(bundle.sh).toContain("a".repeat(64));
    expect(bundle.sh).toContain("b".repeat(64));
    expect(bundle.sh).toContain("c".repeat(64));
    expect(bundle.bat).toContain("a".repeat(64));
    expect(bundle.bat).toContain("c".repeat(64));
    expect(bundle.bat).not.toContain(raw.versao);
    expect(bundle.bat).not.toContain("1.0.0");
    expect(bundle.sh).toContain("cat ");
    expect(bundle.sh).toContain("sha256sum -c");
    expect(bundle.sh).toContain("shasum -a 256");
    expect(bundle.sh).toContain("Bateu");
    expect(bundle.sh).toContain("Não bateu");
    expect(bundle.bat).toContain('copy /Y /b "alfa.parte01"+"beta.parte02" "yami-os-9.9.9-amd64.iso"');
    expect(bundle.bat).toContain("certutil -hashfile");
    expect(bundle.bat).toContain("RESULTADO: BATEU");
    expect(bundle.bat).toContain("RESULTADO: NAO BATEU");
    expect(bundle.bat).toContain("Nao bateu:");
    expect(bundle.windowsCommands).toContain("copy /Y /b");
    expect(bundle.windowsCommands).toContain(`rem Tem que ser igual a ${"c".repeat(64)}`);
    expect(bundle.linuxCommands).toContain("sha256sum -c");
    expect(bundle.macCommands).toContain("shasum -a 256 -c");
    expect(bundle.sh).not.toMatch(/https?:\/\//);
    expect(bundle.bat).not.toContain("/api/yamios/iso");
    expect(bundle.bat.startsWith("@echo off\r\n")).toBe(true);
    expect(bundle.bat.charCodeAt(0)).toBe(64);
    expect(bundle.bat).toContain("\r\n");
    expect(bundle.sh).not.toContain("\r");
  });

  it("confere uma ISO de uma parte sem juntar, e o sha sai do manifesto", () => {
    const isoSha = "d".repeat(64);
    const bundle = buildJoinScripts({
      versao: "1.1.0",
      iso: {
        sha256: isoSha.toUpperCase(),
        tamanho: 4096,
        url: "https://example.com/releases/yami-os-1.1.0.iso",
        partes: [],
      },
    });
    expect(bundle).not.toBeNull();
    if (!bundle) return;

    expect(bundle.parts).toEqual([{ fileName: "yami-os-1.1.0.iso", sha256: isoSha }]);
    expect(bundle.isoFileName).toBe("yami-os-1.1.0.iso");
    expect(bundle.sh).toContain(isoSha);
    expect(bundle.sh).not.toContain(isoSha.toUpperCase());
    expect(bundle.bat).toContain(isoSha);
    expect(bundle.sh).not.toMatch(/\bcat\b/);
    expect(bundle.bat).not.toContain("copy /Y /b");
    expect(bundle.linuxCommands).not.toMatch(/\bcat\b/);
    expect(bundle.windowsCommands).toContain(`certutil -hashfile "yami-os-1.1.0.iso" SHA256`);
    expect(bundle.windowsCommands).toContain(`rem Tem que ser igual a ${isoSha}`);
    expect(bundle.macCommands).toContain("shasum -a 256 -c");
  });

  it("usa o nome do arquivo da URL e cai em parte01 quando a URL não tem nome", () => {
    const fromUrl = buildJoinScripts(
      manifest({
        iso: {
          sha256: "c".repeat(64),
          tamanho: 20,
          partes: [
            {
              url: "https://github.com/vinicon14/yamios-releases/releases/download/v1.1.0/yami-os-1.1.0.iso.parte01",
              sha256: "a".repeat(64),
              tamanho: 10,
            },
            {
              url: "https://github.com/vinicon14/yamios-releases/releases/download/v1.1.0/yami-os-1.1.0.iso.parte02",
              sha256: "b".repeat(64),
              tamanho: 10,
            },
          ],
        },
      }),
    );
    expect(fromUrl?.parts.map((part) => part.fileName)).toEqual([
      "yami-os-1.1.0.iso.parte01",
      "yami-os-1.1.0.iso.parte02",
    ]);

    const fallback = buildJoinScripts(
      manifest({
        iso: {
          sha256: "c".repeat(64),
          tamanho: 20,
          partes: [
            { url: "/api/yamios/iso/1", sha256: "a".repeat(64), tamanho: 10 },
            { url: "/api/yamios/iso/2", sha256: "b".repeat(64), tamanho: 10 },
          ],
        },
      }),
    );
    expect(fallback?.parts.map((part) => part.fileName)).toEqual(["parte01", "parte02"]);
    expect(fallback?.sh).not.toContain("https://");
  });

  it("gera scripts para a ISO 2.0.0 com os nomes e hashes publicados", () => {
    expect(raw.versao).toBe("2.0.0");
    expect(raw.iso.partes).toHaveLength(2);
    const bundle = buildJoinScripts(raw);
    expect(bundle).not.toBeNull();
    if (!bundle) return;
    expect(bundle.parts.map((part) => part.fileName)).toEqual([
      "yami-os-2.0.0.iso.parte01",
      "yami-os-2.0.0.iso.parte02",
    ]);
    expect(bundle.isoSha256).toBe("a61fd940d9a2b5944afedc9e72717221ca1a129d3bd3ab14f920fde51cad6913");
    expect(bundle.sh).toContain("57398228bf6d84ecd983738e686e8bf02a64f231c01f49f0126159ba79bd9338");
    expect(bundle.sh).toContain("ff009e7849f5b05f571f862b055181101a7e9cb01c842917abfe497306c3489b");
    expect(bundle.sh).toContain("a61fd940d9a2b5944afedc9e72717221ca1a129d3bd3ab14f920fde51cad6913");
    expect(bundle.sh).toContain("cat ");
    expect(bundle.bat).toContain("copy /Y /b");
  });

  it("o .bat começa com @echo off, usa CRLF e só tem bytes ASCII", () => {
    const bundle = buildJoinScripts(raw);
    expect(bundle).not.toBeNull();
    if (!bundle) return;
    const bat = bundle.bat;
    expect(bat.startsWith("@echo off\r\n")).toBe(true);
    expect(bat.includes("\uFEFF")).toBe(false);
    expect(bat.charCodeAt(0)).toBe("@".charCodeAt(0));
    expect([...bat].every((char) => char.charCodeAt(0) < 128)).toBe(true);
    expect(bat.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
    expect(bat).toContain("\r\n");
  });

  it("recusa manifesto sem ISO utilizável", () => {
    expect(buildJoinScripts({ versao: "1.0.0" })).toBeNull();
    expect(buildJoinScripts({ versao: "1.0.0", iso: { sha256: "abc", tamanho: 10, partes: [] } })).toBeNull();
    expect(
      buildJoinScripts({
        versao: "1.0.0",
        iso: {
          sha256: "a".repeat(64),
          tamanho: 10,
          partes: [
            { arquivo: "alfa.parte01", sha256: "invalido", tamanho: 5 },
            { arquivo: "beta.parte02", sha256: "b".repeat(64), tamanho: 5 },
          ],
        },
      }),
    ).toBeNull();
    expect(
      buildJoinScripts({
        versao: "1.0.0",
        iso: {
          sha256: "a".repeat(64),
          tamanho: 10,
          partes: [
            { arquivo: "igual.iso", sha256: "b".repeat(64), tamanho: 5 },
            { arquivo: "igual.iso", sha256: "c".repeat(64), tamanho: 5 },
          ],
        },
      }),
    ).toBeNull();
  });

  it("junta duas partes mesmo sem SHA-256 publicado para a ISO completa", async () => {
    const left = Buffer.from("parte-um-1.0.0");
    const right = Buffer.from("parte-dois-1.0.0");
    const bundle = buildJoinScripts({
      versao: "1.0.0",
      iso: {
        sha256: "",
        tamanho: left.length + right.length,
        partes: [
          { arquivo: "parte-a", sha256: sha(left), tamanho: left.length },
          { arquivo: "parte-b", sha256: sha(right), tamanho: right.length },
        ],
      },
    });
    expect(bundle).not.toBeNull();
    if (!bundle) return;
    expect(bundle.isoSha256).toBe("");
    expect(bundle.sh).toContain("cat 'parte-a' 'parte-b'");
    expect(bundle.sh).not.toContain("conferir 'yami-os-1.0.0-amd64.iso'");
    const dir = await mkdtemp(path.join(tmpdir(), "yami-join-no-iso-sha-"));
    try {
      await writeFile(path.join(dir, "parte-a"), left);
      await writeFile(path.join(dir, "parte-b"), right);
      await writeFile(path.join(dir, "juntar-iso.sh"), bundle.sh, { mode: 0o755 });
      const script = await run("sh", ["juntar-iso.sh"], dir);
      expect(script.code).toBe(0);
      expect(script.output).toContain("Bateu");
      expect(sha(await readFile(path.join(dir, bundle.isoFileName)))).toBe(sha(Buffer.concat([left, right])));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("o script de duas partes junta, confere e diz se bateu", async () => {
    const left = Buffer.from("parte-esquerda");
    const right = Buffer.from("parte-direita");
    const iso = Buffer.concat([left, right]);
    const bundle = buildJoinScripts({
      versao: "2.0.0",
      iso: {
        sha256: sha(iso).toUpperCase(),
        tamanho: iso.length,
        partes: [
          { arquivo: "esquerda.parte01", sha256: sha(left), tamanho: left.length },
          { arquivo: "direita.parte02", sha256: sha(right).toUpperCase(), tamanho: right.length },
        ],
      },
    });
    expect(bundle).not.toBeNull();
    if (!bundle) return;
    expect(bundle.sh).toContain(sha(iso));
    expect(bundle.sh).not.toContain(sha(iso).toUpperCase());

    const dir = await mkdtemp(path.join(tmpdir(), "yami-join-"));
    try {
      await writeFile(path.join(dir, "esquerda.parte01"), left);
      await writeFile(path.join(dir, "direita.parte02"), right);
      await writeFile(path.join(dir, "juntar-iso.sh"), bundle.sh, { mode: 0o755 });

      const typed = await run("sh", ["-c", bundle.linuxCommands], dir);
      expect(typed.code).toBe(0);
      expect(typed.output).toMatch(/OK/);

      if ((await run("sh", ["-c", "command -v shasum"], dir)).code === 0) {
        const mac = await run("sh", ["-c", bundle.macCommands], dir);
        expect(mac.code).toBe(0);
        expect(mac.output).toMatch(/OK/);
      }

      const script = await run("sh", ["juntar-iso.sh"], dir);
      expect(script.code).toBe(0);
      expect(script.output).toContain("Bateu");
      expect(script.output).not.toContain("Não bateu");
      expect(sha(await readFile(path.join(dir, bundle.isoFileName)))).toBe(sha(iso));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("diz que não bateu quando o sha da ISO não é o do arquivo", async () => {
    const body = Buffer.from("arquivo-errado");
    const bundle = buildJoinScripts({
      versao: "2.0.0",
      iso: {
        sha256: "e".repeat(64),
        tamanho: body.length,
        partes: [{ arquivo: "sozinho.iso", sha256: sha(body), tamanho: body.length }],
      },
    });
    expect(bundle).not.toBeNull();
    if (!bundle) return;
    expect(bundle.sh).toContain(sha(body));
    expect(bundle.sh).toContain("e".repeat(64));

    const dir = await mkdtemp(path.join(tmpdir(), "yami-join-"));
    try {
      await writeFile(path.join(dir, "sozinho.iso"), body);
      await writeFile(path.join(dir, "juntar-iso.sh"), bundle.sh, { mode: 0o755 });
      const script = await run("sh", ["juntar-iso.sh"], dir);
      expect(script.code).not.toBe(0);
      expect(script.output).toContain("Não bateu");
      expect(script.output).toContain("e".repeat(64));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("o script de uma parte só confere e diz que bateu", async () => {
    const body = Buffer.from("iso-inteira");
    const bundle = buildJoinScripts({
      versao: "1.1.0",
      iso: {
        sha256: sha(body),
        tamanho: body.length,
        partes: [{ arquivo: "yami.iso", sha256: sha(body), tamanho: body.length }],
      },
    });
    expect(bundle).not.toBeNull();
    if (!bundle) return;
    expect(bundle.sh).not.toMatch(/\bcat\b/);

    const dir = await mkdtemp(path.join(tmpdir(), "yami-join-"));
    try {
      await writeFile(path.join(dir, "yami.iso"), body);
      await writeFile(path.join(dir, "juntar-iso.sh"), bundle.sh, { mode: 0o755 });
      const script = await run("sh", ["juntar-iso.sh"], dir);
      expect(script.code).toBe(0);
      expect(script.output).toContain("Bateu. O arquivo yami.iso está certo.");
      expect(script.output).not.toContain("Não bateu");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("entrega os scripts de montagem para a ISO publicada", async () => {
    const unix = await scriptGet(new Request("http://localhost/api/yamios/scripts/unix"), {
      params: Promise.resolve({ kind: "unix" }),
    });
    expect(unix.status).toBe(200);
    expect(await unix.text()).toContain("cat ");

    const windows = await scriptGet(new Request("http://localhost/api/yamios/scripts/windows"), {
      params: Promise.resolve({ kind: "windows" }),
    });
    expect(windows.status).toBe(200);
    expect(await windows.text()).toContain("copy /Y /b");

    const missing = await scriptGet(new Request("http://localhost/api/yamios/scripts/outro"), {
      params: Promise.resolve({ kind: "outro" }),
    });
    expect(missing.status).toBe(404);
  });

});

describe("página de instalação", () => {
  it("mostra o estado real da ISO e mantém as instruções de pendrive e boot", () => {
    const html = renderToStaticMarkup(<InstalarYamiOsPage />);
    expect(html).toContain("Baixar a parte 1");
    expect(html).toContain("2.0.0");
    expect(html).toContain("yami-os-2.0.0.iso.parte01");
    expect(html).toContain("Rufus");
    expect(html).toContain("balenaEtcher");
    expect(html).toContain("Ventoy");
    expect(html).toContain("imagem ISO ou imagem DD");
    expect(html).toContain("Secure Boot");
    expect(html).toContain("America/Sao_Paulo");
    expect(html).toContain("pt-BR");
    expect(html).toContain("Dá para pular");
    expect(html).toContain('data-iso-offer="ready"');
    expect(html).toContain("O YAMI OS é de graça para baixar");
    expect(html).not.toContain("gratis para baixar");
    expect(html).not.toContain("/api/yamios/iso");
    expect(html).not.toMatch(/senha padr[aã]o/i);
    expect(html).not.toMatch(/default password/i);
    for (const row of BOOT_MENU_KEYS) {
      expect(html).toContain(row.brand);
      expect(html).toContain(row.key);
    }
  });

  it("trata a ISO de uma parte sem pedir para juntar e sem a frase de licença", () => {
    const isoSha = "f".repeat(64);
    const html = renderToStaticMarkup(
      <InstallGuide
        source={{
          versao: "1.1.0",
          build: "r9",
          iso: {
            sha256: isoSha,
            tamanho: 4096,
            kernel: "6.8.0",
            url: "https://example.com/yami-os-1.1.0.iso",
            partes: [],
          },
        }}
      />,
    );
    expect(html).toContain(isoSha);
    expect(html).toContain("yami-os-1.1.0.iso");
    expect(html).toContain("Baixar a ISO");
    expect(html).toContain("Conferir o arquivo");
    expect(html).not.toContain("copy /Y /b");
    expect(html).not.toContain("pede uma licença");
    expect(html).toContain("sha256sum -c");
    expect(html).toContain("America/Sao_Paulo");
  });
});
