export type PairingStartResponse = {
  code: string;
  pollToken: string;
  expiresAt: string;
};

export type PairingPollResponse =
  | { status: "pending"; expiresAt: string }
  | { status: "expired" }
  | { status: "consumed" }
  | { status: "ready"; deviceId: string; deviceName: string; deviceToken: string };

export type RelayKind =
  | "chat"
  | "forage"
  | "config"
  | "approval_request"
  | "approval_result"
  | "status"
  | "event";

export type RelayDirection = "up" | "down";

export type RelayMessage = {
  id: string;
  seq: number;
  deviceId: string;
  direction: RelayDirection;
  kind: RelayKind;
  payload: unknown;
  needsLocalApproval?: boolean;
  from: "browser" | "desktop";
  createdAt: string;
};

export type DevicePullResponse = {
  ok: true;
  deviceId: string;
  messages: RelayMessage[];
  lastSeq: number;
  serverTime?: string;
};

/** @deprecated Use DevicePullResponse. */
export type DesktopPollResponse = DevicePullResponse;

export type DevicePushResponse = {
  ok: true;
  message: RelayMessage;
};

export type ApprovalDecision = "approved" | "denied";

/** Canais de IPC sugeridos para o app Electron da YAMI. */
export type IpcEnvelope =
  | { channel: "yami:chat:inbound"; message: RelayMessage }
  | { channel: "yami:forage:inbound"; message: RelayMessage }
  | { channel: "yami:config:inbound"; message: RelayMessage }
  | { channel: "yami:approval:needed"; message: RelayMessage }
  | { channel: "yami:status:inbound"; message: RelayMessage }
  | { channel: "yami:event:inbound"; message: RelayMessage };
