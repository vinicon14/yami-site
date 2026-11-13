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

export type RelayMessage = {
  id: string;
  kind: RelayKind;
  payload: unknown;
  needsLocalApproval?: boolean;
  from: "browser" | "desktop";
  createdAt: string;
};

export type DesktopPollResponse = {
  ok: true;
  deviceId: string;
  messages: RelayMessage[];
};

export type ApprovalDecision = "approved" | "denied";
