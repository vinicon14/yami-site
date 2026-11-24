"use client";

import { useEffect, useState } from "react";

type AccountSnapshot = {
  userId: string;
  email: string;
  name: string | null;
  savedAt: string;
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

async function saveSnapshot(snapshot: AccountSnapshot): Promise<void> {
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
  const [status, setStatus] = useState<"saving" | "saved" | "unavailable">("saving");

  useEffect(() => {
    let active = true;
    void saveSnapshot({
      userId,
      email,
      name,
      savedAt: new Date().toISOString(),
    }).then(
      () => active && setStatus("saved"),
      () => active && setStatus("unavailable"),
    );
    return () => {
      active = false;
    };
  }, [userId, email, name]);

  return (
    <p className="mt-3 text-xs text-muted" role="status" aria-live="polite">
      {status === "saving" && "Salvando uma cópia local dos dados básicos desta conta…"}
      {status === "saved" && "Cópia local dos dados básicos salva neste dispositivo (IndexedDB)."}
      {status === "unavailable" && "O navegador não permitiu salvar a cópia local desta conta."}
    </p>
  );
}
