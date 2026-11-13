/**
 * Cliente do aplicativo de desktop da YAMI.
 *
 * Este módulo descreve e implementa o protocolo com o site (pareamento e
 * relé Postgres). Ele NÃO deve ser colado no repositório do site como parte
 * do instalador: copie ou importe para o código do aplicativo Windows, sem
 * alterar o build-src da YAMI a partir deste repositório.
 *
 * Regras:
 * - O código de pareamento aparece no aplicativo.
 * - Ações de arquivo ou comando exigem aprovação local, mesmo se o pedido
 *   veio do painel remoto.
 * - Nunca envie chaves, senhas ou carteiras pelo relé.
 *
 * API canônica:
 *   POST /api/pairing/start
 *   GET  /api/pairing/poll?pollToken=
 *   GET  /api/relay/device/pull?afterSeq=&waitMs=  (Authorization: Bearer)
 *   POST /api/relay/device/push                     (Authorization: Bearer)
 */
import type {
  ApprovalDecision,
  DevicePullResponse,
  DevicePushResponse,
  IpcEnvelope,
  PairingPollResponse,
  PairingStartResponse,
  RelayMessage,
} from "./types";

export type {
  ApprovalDecision,
  DevicePullResponse,
  DevicePushResponse,
  DesktopPollResponse,
  IpcEnvelope,
  PairingPollResponse,
  PairingStartResponse,
  RelayMessage,
} from "./types";

export type YamiDesktopClientOptions = {
  /** Origem do site, sem barra no final. Ex.: https://yami-site-pi.vercel.app */
  baseUrl: string;
  /** Função fetch (padrão: globalThis.fetch). */
  fetchFn?: typeof fetch;
  /** Espera entre tentativas depois de um erro, em ms. */
  pollIntervalMs?: number;
  /** Long-poll, em ms (o servidor limita a 25 s). 0 = coleta curta. */
  waitMs?: number;
};

export type StoredDevice = {
  deviceId: string;
  deviceName: string;
  deviceToken: string;
};

export type PollLoopHandlers = {
  onMessages?: (messages: RelayMessage[], lastSeq: number) => void | Promise<void>;
  onChat?: (message: RelayMessage) => void | Promise<void>;
  onForage?: (message: RelayMessage) => void | Promise<void>;
  onConfig?: (message: RelayMessage) => void | Promise<void>;
  onStatus?: (message: RelayMessage) => void | Promise<void>;
  onApprovalNeeded?: (message: RelayMessage) => void | Promise<void>;
  onUnauthorized?: () => void;
  onError?: (err: unknown) => void;
};

const FILE_OR_COMMAND = new Set(["file", "command", "shell", "approval_request"]);

export function needsLocalApproval(message: RelayMessage): boolean {
  if (message.needsLocalApproval) return true;
  if (FILE_OR_COMMAND.has(message.kind)) return true;
  if (
    typeof message.payload === "object" &&
    message.payload !== null &&
    "action" in message.payload
  ) {
    return FILE_OR_COMMAND.has(String((message.payload as { action?: string }).action));
  }
  return false;
}

/** Mapeia uma mensagem do relé para o canal de IPC do aplicativo Electron. */
export function mapRelayToIpc(message: RelayMessage): IpcEnvelope {
  if (needsLocalApproval(message)) {
    return { channel: "yami:approval:needed", message };
  }
  switch (message.kind) {
    case "chat":
      return { channel: "yami:chat:inbound", message };
    case "forage":
      return { channel: "yami:forage:inbound", message };
    case "config":
      return { channel: "yami:config:inbound", message };
    case "status":
      return { channel: "yami:status:inbound", message };
    default:
      return { channel: "yami:event:inbound", message };
  }
}

export class YamiDesktopClient {
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;
  private readonly pollIntervalMs: number;
  private readonly waitMs: number;

  constructor(opts: YamiDesktopClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.fetchFn = opts.fetchFn ?? fetch;
    this.pollIntervalMs = opts.pollIntervalMs ?? 2000;
    this.waitMs = opts.waitMs ?? 20_000;
  }

  /** Pede um código para exibir na janela do aplicativo. */
  async startPairing(): Promise<PairingStartResponse> {
    const res = await this.fetchFn(`${this.baseUrl}/api/pairing/start`, {
      method: "POST",
    });
    if (!res.ok) throw new Error(`falha ao iniciar pareamento (${res.status})`);
    return (await res.json()) as PairingStartResponse;
  }

  async pollPairing(pollToken: string): Promise<PairingPollResponse> {
    const url = new URL(`${this.baseUrl}/api/pairing/poll`);
    url.searchParams.set("pollToken", pollToken);
    const res = await this.fetchFn(url, { method: "GET" });
    if (!res.ok) throw new Error(`falha ao consultar pareamento (${res.status})`);
    return (await res.json()) as PairingPollResponse;
  }

  /**
   * Exibe o código, espera a pessoa confirmar no site, devolve o token do
   * aparelho. Guarde o token com o mesmo cuidado de uma senha, no cofre
   * local do aplicativo — nunca no repositório nem em log.
   */
  async waitForPairing(
    onCode: (info: { code: string; expiresAt: string }) => void,
    signal?: AbortSignal,
  ): Promise<StoredDevice> {
    const started = await this.startPairing();
    onCode({ code: started.code, expiresAt: started.expiresAt });
    while (!signal?.aborted) {
      const result = await this.pollPairing(started.pollToken);
      if (result.status === "ready") {
        return {
          deviceId: result.deviceId,
          deviceName: result.deviceName,
          deviceToken: result.deviceToken,
        };
      }
      if (result.status === "expired") {
        throw new Error("o código de pareamento expirou");
      }
      await sleep(this.pollIntervalMs, signal);
    }
    throw new Error("pareamento cancelado");
  }

  /**
   * Coleta pedidos do painel remoto (long-poll até `waitMs`, ou coleta curta
   * com `waitMs: 0`). Envie `afterSeq` igual ao `lastSeq` da resposta anterior.
   */
  async pull(
    deviceToken: string,
    opts: { afterSeq?: number; waitMs?: number; signal?: AbortSignal } = {},
  ): Promise<DevicePullResponse> {
    const url = new URL(`${this.baseUrl}/api/relay/device/pull`);
    url.searchParams.set("afterSeq", String(opts.afterSeq ?? 0));
    url.searchParams.set("waitMs", String(opts.waitMs ?? this.waitMs));
    const res = await this.fetchFn(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${deviceToken}` },
      signal: opts.signal,
    });
    if (res.status === 401) throw new Error("dispositivo desconectado ou token inválido");
    if (res.status === 403) throw new Error("esta conta não tem licença");
    if (!res.ok) throw new Error(`falha no relé (${res.status})`);
    return (await res.json()) as DevicePullResponse;
  }

  /** Envia um evento ou resposta para o painel no navegador. */
  async push(
    deviceToken: string,
    message: { kind: RelayMessage["kind"]; payload: unknown; needsLocalApproval?: boolean },
  ): Promise<DevicePushResponse> {
    const res = await this.fetchFn(`${this.baseUrl}/api/relay/device/push`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${deviceToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    });
    if (res.status === 401) throw new Error("dispositivo desconectado ou token inválido");
    if (res.status === 413) throw new Error("mensagem grande demais");
    if (!res.ok) throw new Error(`falha ao enviar (${res.status})`);
    return (await res.json()) as DevicePushResponse;
  }

  /**
   * Laço em segundo plano: long-poll, entrega mensagens aos handlers e
   * atualiza `afterSeq`. Pare com `signal.abort()`. 401 chama
   * `onUnauthorized` e encerra (token revogado).
   */
  async runPollLoop(
    deviceToken: string,
    handlers: PollLoopHandlers = {},
    signal?: AbortSignal,
    startAfterSeq = 0,
  ): Promise<void> {
    let afterSeq = startAfterSeq;
    while (!signal?.aborted) {
      try {
        const result = await this.pull(deviceToken, {
          afterSeq,
          waitMs: this.waitMs,
          signal,
        });
        if (result.lastSeq > afterSeq) afterSeq = result.lastSeq;
        if (result.messages.length) {
          await handlers.onMessages?.(result.messages, result.lastSeq);
          for (const message of result.messages) {
            if (needsLocalApproval(message)) {
              await handlers.onApprovalNeeded?.(message);
              continue;
            }
            switch (message.kind) {
              case "chat":
                await handlers.onChat?.(message);
                break;
              case "forage":
                await handlers.onForage?.(message);
                break;
              case "config":
                await handlers.onConfig?.(message);
                break;
              case "status":
                await handlers.onStatus?.(message);
                break;
              default:
                break;
            }
          }
        }
      } catch (err) {
        if (signal?.aborted) return;
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("desconectado") || msg.includes("token inválido")) {
          handlers.onUnauthorized?.();
          return;
        }
        handlers.onError?.(err);
        try {
          await sleep(this.pollIntervalMs, signal);
        } catch {
          return;
        }
      }
    }
  }

  /**
   * Processa uma mensagem vinda do painel. Se precisar de aprovação local,
   * chama `approve` e só então devolve a decisão — o aplicativo é quem
   * executa, e só depois de o usuário aceitar no PC.
   */
  async handleIncoming(
    message: RelayMessage,
    approve: (message: RelayMessage) => Promise<ApprovalDecision>,
  ): Promise<{ proceed: boolean; decision?: ApprovalDecision }> {
    if (!needsLocalApproval(message)) return { proceed: true };
    const decision = await approve(message);
    return { proceed: decision === "approved", decision };
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("abort"));
      return;
    }
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new Error("abort"));
      },
      { once: true },
    );
  });
}
