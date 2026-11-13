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

export interface RelayAdapter {
  setDesktopOnline(deviceId: string, online: boolean): Promise<void>;
  isDesktopOnline(deviceId: string): Promise<boolean>;
  getStatus(deviceId: string): Promise<DesktopStatus>;
  pushToDesktop(deviceId: string, message: Omit<RelayMessage, "id" | "createdAt">): Promise<RelayMessage>;
  pullForDesktop(deviceId: string): Promise<RelayMessage[]>;
  pushToBrowser(userId: string, message: Omit<RelayMessage, "id" | "createdAt">): Promise<RelayMessage>;
  pullForBrowser(userId: string): Promise<RelayMessage[]>;
}
