"use client";

import { useState } from "react";

export function CopyButton({
  value,
  label = "Copiar",
}: {
  value: string;
  label?: string;
}) {
  const [done, setDone] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    } catch {
      setDone(false);
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="border border-line px-2.5 py-1 font-mono text-xs text-ink-soft hover:border-ink hover:text-ink"
    >
      {done ? "Copiado" : label}
    </button>
  );
}
