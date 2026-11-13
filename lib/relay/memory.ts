import type { DesktopStatus, RelayAdapter, RelayMessage } from "./types";

function enqueue(map: Map<string, RelayMessage[]>, key: string, msg: RelayMessage) {
  const list = map.get(key) ?? [];
  list.push(msg);
  // Evita crescimento infinito em dev.
  map.set(key, list.slice(-200));
}

function drain(map: Map<string, RelayMessage[]>, key: string): RelayMessage[] {
  const list = map.get(key) ?? [];
  map.set(key, []);
  return list;
}

export function createMemoryRelay(): RelayAdapter {
  const toDesktop = new Map<string, RelayMessage[]>();
  const toBrowser = new Map<string, RelayMessage[]>();
  const online = new Map<string, DesktopStatus>();

  return {
    async setDesktopOnline(deviceId, isOnline) {
      online.set(deviceId, {
        deviceId,
        online: isOnline,
        lastSeenAt: isOnline ? new Date().toISOString() : (online.get(deviceId)?.lastSeenAt ?? null),
      });
    },
    async isDesktopOnline(deviceId) {
      return online.get(deviceId)?.online === true;
    },
    async getStatus(deviceId) {
      return (
        online.get(deviceId) ?? { deviceId, online: false, lastSeenAt: null }
      );
    },
    async pushToDesktop(deviceId, message) {
      const full: RelayMessage = {
        ...message,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      };
      enqueue(toDesktop, deviceId, full);
      return full;
    },
    async pullForDesktop(deviceId) {
      const current = online.get(deviceId);
      online.set(deviceId, {
        deviceId,
        online: true,
        lastSeenAt: new Date().toISOString(),
      });
      void current;
      return drain(toDesktop, deviceId);
    },
    async pushToBrowser(userId, message) {
      const full: RelayMessage = {
        ...message,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      };
      enqueue(toBrowser, userId, full);
      return full;
    },
    async pullForBrowser(userId) {
      return drain(toBrowser, userId);
    },
  };
}
