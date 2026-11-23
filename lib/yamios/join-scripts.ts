import { assetFilename, filenameFromUrl } from "@/lib/yamios/public-manifest";

/**
 * Monta o script que junta as partes da ISO e confere o SHA-256.
 * Nomes, quantidade de partes e códigos vêm do manifesto. Não há
 * versão, nome de arquivo nem checksum fixo aqui.
 */

const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/;

export type JoinPartSource = {
  url?: string;
  arquivo?: string;
  sha256?: string;
  tamanho?: number;
};

export type JoinManifestSource = {
  versao?: string;
  iso?: {
    url?: string | null;
    sha256?: string;
    tamanho?: number;
    partes?: JoinPartSource[];
  } | null;
};

export type JoinScriptPart = {
  fileName: string;
  sha256: string;
};

export type JoinScriptBundle = {
  version: string;
  isoFileName: string;
  isoSha256: string;
  parts: JoinScriptPart[];
  bat: string;
  sh: string;
  windowsCommands: string;
  linuxCommands: string;
  macCommands: string;
};

export const JOIN_SCRIPT_FILES = {
  windows: { field: "bat", filename: "juntar-iso.bat" },
  unix: { field: "sh", filename: "juntar-iso.sh" },
} as const;

export type JoinScriptKind = keyof typeof JOIN_SCRIPT_FILES;

function digest(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const hash = value.trim().toLowerCase();
  return SHA256.test(hash) ? hash : null;
}

function safeName(value: string | null): string | null {
  if (!value || !SAFE_NAME.test(value)) return null;
  if (value.includes("..")) return null;
  return value;
}

function partFileName(part: JoinPartSource, index: number): string {
  return (
    safeName(assetFilename(part.arquivo)) ??
    safeName(filenameFromUrl(part.url)) ??
    `parte${String(index + 1).padStart(2, "0")}`
  );
}

function isoOutputName(version: string, partNames: string[]): string | null {
  const candidates = version
    ? [`yami-os-${version}-amd64.iso`, `yami-os-${version}-montada.iso`]
    : ["yami-os-amd64.iso", "yami-os-montada.iso"];
  return candidates.find((name) => !partNames.includes(name)) ?? null;
}

function shellSingle(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function windowsJoin(names: string[], isoName: string): string {
  return `copy /Y /b ${names.map((name) => `"${name}"`).join("+")} "${isoName}"`;
}

function certutil(name: string): string {
  return `certutil -hashfile "${name}" SHA256`;
}

type Check = { fileName: string; sha256: string };

function buildSh(version: string, parts: JoinScriptPart[], isoName: string, isoSha: string, before: Check[], after: Check[]): string {
  const lines = [
    "#!/bin/sh",
    "set -eu",
    'cd "$(dirname "$0")" || exit 1',
    "",
    `# Gerado a partir do manifesto do YAMI OS ${version}.`,
    "# Deixe este arquivo na mesma pasta dos downloads.",
    "# Ele junta as partes, quando houver mais de uma, e confere o SHA-256.",
    "",
    "conferir() {",
    "  arquivo=$1",
    "  esperado=$2",
    '  if [ ! -f "$arquivo" ]; then',
    '    echo "Não achei o arquivo $arquivo nesta pasta."',
    '    echo "Deixe este script na mesma pasta dos arquivos que você baixou."',
    '    echo "Se o navegador salvou com outro nome, renomeie para $arquivo."',
    "    exit 1",
    "  fi",
    "  if command -v sha256sum >/dev/null 2>&1; then",
    "    if printf '%s  %s\\n' \"$esperado\" \"$arquivo\" | sha256sum -c -; then",
    '      echo "Bateu: $arquivo"',
    "      return 0",
    "    fi",
    "  elif command -v shasum >/dev/null 2>&1; then",
    "    if printf '%s  %s\\n' \"$esperado\" \"$arquivo\" | shasum -a 256 -c -; then",
    '      echo "Bateu: $arquivo"',
    "      return 0",
    "    fi",
    "  else",
    '    echo "Não achei sha256sum nem shasum neste computador."',
    "    exit 1",
    "  fi",
    '  echo "Não bateu: $arquivo"',
    '  echo "Esperado: $esperado"',
    '  echo "Não use este arquivo. Baixe de novo."',
    "  exit 1",
    "}",
    "",
  ];

  for (const check of before) {
    lines.push(`conferir ${shellSingle(check.fileName)} ${shellSingle(check.sha256)}`);
  }
  if (after.length > 0) {
    const names = parts.map((part) => shellSingle(part.fileName)).join(" ");
    lines.push('echo "Juntando as partes..."');
    lines.push(`if ! cat ${names} > ${shellSingle(isoName)}; then`);
    lines.push('  echo "Não consegui juntar as partes."');
    lines.push("  exit 1");
    lines.push("fi");
    for (const check of after) {
      lines.push(`conferir ${shellSingle(check.fileName)} ${shellSingle(check.sha256)}`);
    }
  }
  lines.push(
    `echo ${shellSingle(`Bateu. O arquivo ${isoName} está certo. Pode gravar o pendrive.`)}`,
  );
  return `${lines.join("\n")}\n`;
}

function buildBat(version: string, parts: JoinScriptPart[], isoName: string, before: Check[], after: Check[]): string {
  const lines = [
    "@echo off",
    "setlocal EnableExtensions",
    'cd /d "%~dp0"',
    `echo YAMI OS ${version}`,
    "echo Conferindo os arquivos. Nao feche esta janela.",
    "echo.",
  ];

  for (const part of parts) {
    lines.push(`if not exist "${part.fileName}" (`);
    lines.push(`  echo Nao achei o arquivo ${part.fileName} nesta pasta.`);
    lines.push("  echo Deixe este script na mesma pasta dos arquivos que voce baixou.");
    lines.push(`  echo Se o navegador salvou com outro nome, renomeie para ${part.fileName}.`);
    lines.push("  pause");
    lines.push("  exit /b 1");
    lines.push(")");
  }

  for (const check of before) {
    lines.push(`call :conferir "${check.fileName}" "${check.sha256}"`);
    lines.push("if errorlevel 1 goto :falhou");
  }

  if (after.length > 0) {
    lines.push(`echo Juntando as partes em ${isoName} ...`);
    lines.push(`${windowsJoin(parts.map((part) => part.fileName), isoName)} >nul`);
    lines.push("if errorlevel 1 goto :juncao");
    for (const check of after) {
      lines.push(`call :conferir "${check.fileName}" "${check.sha256}"`);
      lines.push("if errorlevel 1 goto :falhou");
    }
  }

  lines.push("echo.");
  lines.push("echo RESULTADO: BATEU");
  lines.push(`echo O arquivo ${isoName} esta certo. Pode gravar o pendrive.`);
  lines.push("pause");
  lines.push("exit /b 0");
  lines.push("");
  lines.push(":juncao");
  lines.push("echo Nao consegui juntar as partes.");
  lines.push("pause");
  lines.push("exit /b 1");
  lines.push("");
  lines.push(":falhou");
  lines.push("echo.");
  lines.push("echo RESULTADO: NAO BATEU");
  lines.push("echo Nao grave o pendrive. Baixe os arquivos de novo.");
  lines.push("pause");
  lines.push("exit /b 1");
  lines.push("");
  lines.push(":conferir");
  lines.push('set "ARQ=%~1"');
  lines.push('set "QUER=%~2"');
  lines.push('set "OBTIDO="');
  lines.push(
    `for /f "skip=1 delims=" %%L in ('certutil -hashfile "%ARQ%" SHA256') do set "OBTIDO=%%L" & goto :conferir_cmp`,
  );
  lines.push(":conferir_cmp");
  lines.push('set "OBTIDO=%OBTIDO: =%"');
  lines.push('if /I "%OBTIDO%"=="%QUER%" (');
  lines.push("  echo Bateu: %ARQ%");
  lines.push("  exit /b 0");
  lines.push(")");
  lines.push("echo Nao bateu: %ARQ%");
  lines.push("echo Esperado: %QUER%");
  lines.push("echo Obtido: %OBTIDO%");
  lines.push("exit /b 1");
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

function checksumBlock(tool: string, checks: Check[]): string {
  const body = checks.map((check) => `${check.sha256}  ${check.fileName}`).join("\n");
  return `${tool} <<'YAMI_SHA'\n${body}\nYAMI_SHA`;
}

function manualCommands(parts: JoinScriptPart[], isoName: string, isoSha: string, before: Check[], after: Check[]): Pick<JoinScriptBundle, "windowsCommands" | "linuxCommands" | "macCommands"> {
  const windows: string[] = [];
  for (const check of before) {
    windows.push(certutil(check.fileName));
    windows.push(`rem Tem que ser igual a ${check.sha256}`);
  }
  if (after.length > 0) {
    windows.push(windowsJoin(parts.map((part) => part.fileName), isoName));
    for (const check of after) {
      windows.push(certutil(check.fileName));
      windows.push(`rem Tem que ser igual a ${check.sha256}`);
    }
  }

  const listed = [...before, ...after];
  const cat = after.length > 0 ? `cat ${parts.map((part) => part.fileName).join(" ")} > ${isoName}\n` : "";
  return {
    windowsCommands: windows.join("\n"),
    linuxCommands: `${cat}${checksumBlock("sha256sum -c", listed)}`,
    macCommands: `${cat}${checksumBlock("shasum -a 256 -c", listed)}`,
  };
}

export function buildJoinScripts(source: JoinManifestSource): JoinScriptBundle | null {
  const iso = source.iso;
  const isoSha = digest(iso?.sha256);
  if (!iso || !isoSha) return null;

  const version = /^\d+\.\d+\.\d+$/.test(source.versao?.trim() ?? "") ? source.versao!.trim() : "";
  const rawParts = iso.partes ?? [];
  const parts: JoinScriptPart[] = [];

  if (rawParts.length === 0) {
    const singleName = safeName(filenameFromUrl(iso.url));
    if (!singleName) return null;
    parts.push({ fileName: singleName, sha256: isoSha });
  } else {
    for (let index = 0; index < rawParts.length; index += 1) {
      const part = rawParts[index];
      const fileName = partFileName(part, index);
      if (!safeName(fileName)) return null;
      const sha256 = digest(part.sha256);
      if (sha256) {
        parts.push({ fileName, sha256 });
        continue;
      }
      const missing = part.sha256 == null || (typeof part.sha256 === "string" && part.sha256.trim() === "");
      if (!(rawParts.length === 1 && missing)) return null;
      parts.push({ fileName, sha256: isoSha });
    }
  }

  if (new Set(parts.map((part) => part.fileName)).size !== parts.length) return null;

  const multiple = parts.length >= 2;
  const isoFileName = multiple ? isoOutputName(version, parts.map((part) => part.fileName)) : parts[0].fileName;
  if (!isoFileName) return null;

  const before: Check[] = [];
  const after: Check[] = [];
  if (multiple) {
    before.push(...parts.map((part) => ({ fileName: part.fileName, sha256: part.sha256 })));
    after.push({ fileName: isoFileName, sha256: isoSha });
  } else {
    const only = parts[0];
    if (only.sha256 !== isoSha) before.push({ fileName: only.fileName, sha256: only.sha256 });
    before.push({ fileName: only.fileName, sha256: isoSha });
  }

  const commands = manualCommands(parts, isoFileName, isoSha, before, after);
  return {
    version: version || source.versao?.trim() || "",
    isoFileName,
    isoSha256: isoSha,
    parts,
    bat: buildBat(version || source.versao?.trim() || "YAMI OS", parts, isoFileName, before, after),
    sh: buildSh(version || source.versao?.trim() || "YAMI OS", parts, isoFileName, isoSha, before, after),
    ...commands,
  };
}
