import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("..", import.meta.url));
const textExtensions = new Set([".ts", ".tsx", ".js", ".mjs", ".json", ".md", ".sql", ".css", ".html", ".example"]);
const secretPatterns = [
  /APP_USR-[A-Za-z0-9-]+/,
  /TEST-[A-Za-z0-9-]+/,
  /sk-[A-Za-z0-9]{10,}/,
  /-----BEGIN (RSA |EC )?PRIVATE KEY-----/,
];

function textFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === ".git" || name === "node_modules" || name === ".next") continue;
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      out.push(...textFiles(path));
    } else if (textExtensions.has(name.slice(name.lastIndexOf(".")))) {
      out.push(path);
    }
  }
  return out;
}

describe("verificação final 0.8.0", () => {
  it("não contém segredos nos arquivos versionados", () => {
    const offenders = [];
    for (const file of textFiles(root)) {
      const content = readFileSync(file, "utf8");
      for (const pattern of secretPatterns) {
        if (pattern.test(content)) offenders.push(relative(root, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("anuncia a ISO 1.1.0 e mantém o pacote incremental 1.0.0", () => {
    const manifest = JSON.parse(readFileSync(join(root, "lib/yamios/latest.json"), "utf8"));
    expect(manifest.versao).toBe("1.1.0");
    expect(manifest.pacotes[0].versao).toBe("1.0.0");
    expect(manifest.pacotes[0].arquivo).toBe("yami-os-1.0.0-pacote.tar.zst");
    expect(manifest.pacotes[0].sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest.pacotes[0].deVersaoMinima).toBe("0.8.0");
  });
});
