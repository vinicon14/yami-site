"use client";

import { useCallback, useEffect, useState } from "react";

type AccountSnapshot = {
  userId: string;
  email: string;
  name: string | null;
  savedAt: string;
  pendingName?: string;
};

const DB_NAME = "yami-local";
const STORE_NAME = "account-snapshots";
const DB_VERSION = 1;

function openAccountDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB indisponível neste navegador."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "userId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Falha ao abrir o armazenamento local."));
  });
}

async function readSnapshot(userId: string): Promise<AccountSnapshot | null> {
  const db = await openAccountDb();
  const value = await new Promise<AccountSnapshot | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(userId);
    request.onsuccess = () => resolve((request.result as AccountSnapshot | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error("Falha ao ler a cópia local."));
  });
  db.close();
  return value;
}

async function writeSnapshot(snapshot: AccountSnapshot): Promise<void> {
  const db = await openAccountDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(snapshot);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Falha ao salvar cópia local."));
    tx.onabort = () => reject(tx.error ?? new Error("Gravação local cancelada."));
  });
  db.close();
}

export function AccountLocalPersistence({
  userId,
  email,
  name,
}: {
  userId: string;
  email: string;
  name: string | null;
}) {
  const [status, setStatus] = useState<"saving" | "saved" | "pending" | "unavailable">("saving");

  const syncPending = useCallback(async () => {
    if (!navigator.onLine) return;
    try {
      const current = await readSnapshot(userId);
      if (!current || current.pendingName === undefined) return;
      const response = await fetch("/api/conta", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: current.pendingName }),
      });
      if (!response.ok) throw new Error("Não foi possível sincronizar o nome.");
      await writeSnapshot({
        userId,
        email,
        name: current.pendingName,
        savedAt: new Date().toISOString(),
      });
      setStatus("saved");
    } catch {
      setStatus("pending");
    }
  }, [userId, email]);

  useEffect(() => {
    let active = true;
    const initialize = async () => {
      try {
        const previous = await readSnapshot(userId);
        const snapshot: AccountSnapshot = {
          userId,
          email,
          name,
          savedAt: new Date().toISOString(),
          ...(previous?.pendingName !== undefined ? { pendingName: previous.pendingName } : {}),
        };
        await writeSnapshot(snapshot);
        if (active) setStatus(snapshot.pendingName !== undefined ? "pending" : "saved");
        if (snapshot.pendingName !== undefined) void syncPending();
      } catch {
        if (active) setStatus("unavailable");
      }
    };

    const queueName = (event: Event) => {
      const detail = (event as CustomEvent<{ name: string }>).detail;
      if (!detail || typeof detail.name !== "string") return;
      void (async () => {
        try {
          const previous = await readSnapshot(userId);
          await writeSnapshot({
            userId,
            email,
            name: previous?.name ?? name,
            savedAt: new Date().toISOString(),
            pendingName: detail.name.trim().slice(0, 80),
          });
          if (active) setStatus("pending");
        } catch {
          if (active) setStatus("unavailable");
        }
      })();
    };

    void initialize();
    window.addEventListener("online", syncPending);
    window.addEventListener("yami:queue-account-name", queueName);
    return () => {
      active = false;
      window.removeEventListener("online", syncPending);
      window.removeEventListener("yami:queue-account-name", queueName);
    };
  }, [userId, email, name, syncPending]);

  return (
    <p className="mt-3 text-xs text-muted" role="status" aria-live="polite">
      {status === "saving" && "Salvando uma cópia local dos dados básicos desta conta…"}
      {status === "saved" && "Dados básicos salvos neste dispositivo e sincronizados com sua conta."}
      {status === "pending" && "Alteração salva localmente; aguardando conexão para sincronizar com o servidor."}
      {status === "unavailable" && "O navegador não permitiu salvar a cópia local desta conta."}
    </p>
  );
}
