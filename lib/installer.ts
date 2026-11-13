import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import {
  getInstallerAuthHeader,
  getInstallerFilename,
  getInstallerPath,
  getInstallerUrl,
} from "./config";

export type InstallerSource =
  | { ok: true; kind: "url" | "path"; filename: string }
  | { ok: false; reason: "not_configured" };

export function getInstallerSource(): InstallerSource {
  const filename = getInstallerFilename();
  if (getInstallerPath()) return { ok: true, kind: "path", filename };
  if (getInstallerUrl()) return { ok: true, kind: "url", filename };
  return { ok: false, reason: "not_configured" };
}

export async function openInstallerStream(): Promise<{
  stream: ReadableStream;
  contentLength?: number;
  contentType: string;
  filename: string;
}> {
  const source = getInstallerSource();
  if (!source.ok) {
    throw new Error("instalador não configurado");
  }
  const filename = source.filename;
  const contentType = "application/octet-stream";

  if (source.kind === "path") {
    const path = getInstallerPath();
    const info = await stat(path);
    const nodeStream = createReadStream(path);
    return {
      stream: Readable.toWeb(nodeStream) as ReadableStream,
      contentLength: info.size,
      contentType,
      filename,
    };
  }

  const url = getInstallerUrl();
  const headers: Record<string, string> = {};
  const auth = getInstallerAuthHeader();
  if (auth) headers.Authorization = auth;
  const res = await fetch(url, { headers, cache: "no-store", redirect: "manual" });
  // Recusa redirecionar o cliente para a URL privada: se o host
  // devolver 302, seguimos no servidor só se for o mesmo esquema
  // e não devolvemos o Location ao navegador.
  if (res.status >= 300 && res.status < 400) {
    throw new Error("o host do instalador redirecionou; ajuste a URL direta");
  }
  if (!res.ok || !res.body) {
    throw new Error(`falha ao obter o instalador (${res.status})`);
  }
  const lengthHeader = res.headers.get("content-length");
  return {
    stream: res.body,
    contentLength: lengthHeader ? Number(lengthHeader) : undefined,
    contentType,
    filename,
  };
}
