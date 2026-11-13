import type { RelayDirection } from "./protocol";

export type RelayKind =
  | "chat"
  | "forage"
  | "config"
  | "approval_request"
  | "approval_result"
  | "status"
  | "event";

export type RelayMessage = {
  id: string;
  seq: number;
  deviceId: string;
  direction: RelayDirection;
  kind: RelayKind;
  payload: unknown;
  /** Ações de arquivo ou comando devem ser aprovadas no PC de casa. */
  needsLocalApproval?: boolean;
  from: "browser" | "desktop";
  createdAt: string;
};

export type DesktopStatus = {
  deviceId: string;
  online: boolean;
  lastSeenAt: string | null;
};

export type PullOptions = {
  afterSeq?: number;
  waitMs?: number;
  /** Devolve o histórico recente (ambos os sentidos) quando afterSeq é 0. */
  history?: boolean;
  limit?: number;
  signal?: AbortSignal;
};

export type PullResult = {
  messages: RelayMessage[];
  lastSeq: number;
};

export type RelayPushInput = {
  kind: RelayKind;
  payload: unknown;
  from: "browser" | "desktop";
  needsLocalApproval?: boolean;
};

export interface RelayAdapter {
  setDesktopOnline(deviceId: string, online: boolean): Promise<void>;
  isDesktopOnline(deviceId: string): Promise<boolean>;
  getStatus(deviceId: string): Promise<DesktopStatus>;
  pushToDevice(deviceId: string, message: RelayPushInput): Promise<RelayMessage>;
  pullForDevice(deviceId: string, opts?: PullOptions): Promise<PullResult>;
  pushToPainel(deviceId: string, message: RelayPushInput): Promise<RelayMessage>;
  pullForPainel(deviceId: string, opts?: PullOptions): Promise<PullResult>;
  purgeExpired(now?: Date): Promise<number>;
}
