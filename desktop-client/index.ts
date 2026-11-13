/**
 * Cliente do aplicativo de desktop da YAMI.
 *
 * Este módulo descreve e implementa o protocolo com o site (pareamento e
 * relé). Ele NÃO deve ser colado no repositório do site como parte do
 * instalador: copie ou importe para o código do aplicativo Windows, sem
 * alterar o build-src da YAMI a partir deste repositório.
 *
 * Regras:
 * - O código de pareamento aparece no aplicativo.
 * - Ações de arquivo ou comando exigem aprovação local, mesmo se o pedido
 *   veio do painel remoto.
 * - Nunca envie chaves, senhas ou carteiras pelo relé.
 */
import type {
  ApprovalDecision,
  DesktopPollResponse,
  PairingPollResponse,
  PairingStartResponse,
  RelayMessage,
} from "./types";

export type { ApprovalDecision, DesktopPollResponse, PairingPollResponse, PairingStartResponse, RelayMessage } from "./types";

export type YamiDesktopClientOptions = {
  /** Origem do site, sem barra no final. Ex.: https://yami-site.vercel.app */
  baseUrl: string;
  /** Função fetch (padrão: globalThis.fetch). */
  fetchFn?: typeof fetch;
  /** Intervalo de espera entre coletas, em ms. */
  pollIntervalMs?: number;
};

export type StoredDevice = {
  deviceId: string;
  deviceName: string;
  deviceToken: string;
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

export class YamiDesktopClient {
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;
  private readonly pollIntervalMs: number;

  constructor(opts: YamiDesktopClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.fetchFn = opts.fetchFn ?? fetch;
    this.pollIntervalMs = opts.pollIntervalMs ?? 2000;
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

  /** Coleta pedidos do painel remoto. */
  async pull(deviceToken: string): Promise<DesktopPollResponse> {
    const res = await this.fetchFn(`${this.baseUrl}/api/relay/desktop`, {
      method: "GET",
      headers: { Authorization: `Bearer ${deviceToken}` },
    });
    if (res.status === 401) throw new Error("dispositivo desconectado ou token inválido");
    if (!res.ok) throw new Error(`falha no relé (${res.status})`);
    return (await res.json()) as DesktopPollResponse;
  }

  /** Envia um evento ou resposta para o painel no navegador. */
  async push(
    deviceToken: string,
    message: { kind: RelayMessage["kind"]; payload: unknown; needsLocalApproval?: boolean },
  ): Promise<void> {
    const res = await this.fetchFn(`${this.baseUrl}/api/relay/desktop`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${deviceToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    });
    if (!res.ok) throw new Error(`falha ao enviar (${res.status})`);
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
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new Error("abort"));
    });
  });
}
