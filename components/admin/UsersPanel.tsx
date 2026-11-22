"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type AdminUser = {
  id: string;
  email: string;
  name: string | null;
  status: string;
  licenseId: string | null;
  createdAt: string;
};

export function UsersPanel() {
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [message, setMessage] = useState("");
  const [passwordById, setPasswordById] = useState<Record<string, string>>({});

  async function load() {
    const res = await fetch("/api/admin/users");
    const data = await res.json().catch(() => ({}));
    if (res.ok) setUsers(data.users ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function update(id: string, body: Record<string, unknown>) {
    setMessage("");
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(data.error ?? "Não foi possível atualizar.");
      return;
    }
    setPasswordById((current) => ({ ...current, [id]: "" }));
    setMessage("Usuário atualizado.");
    await load();
    router.refresh();
  }

  return (
    <section className="card mx-auto mt-8 max-w-3xl p-6">
      <h2 className="text-2xl font-semibold">Usuários</h2>
      {message ? <p className="mt-3 text-sm" role="status">{message}</p> : null}
      <ul className="mt-5 space-y-3">
        {users.map((user) => (
          <li key={user.id} className="rounded-lg border border-line p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">{user.name || user.email}</p>
                <p className="text-xs text-muted">{user.email} · {user.status} · licença {user.licenseId ? "ativa" : "nenhuma"}</p>
              </div>
              <button
                className="btn-ghost text-xs"
                onClick={() => void update(user.id, { status: user.status === "ativo" ? "bloqueado" : "ativo" })}
              >
                {user.status === "ativo" ? "Bloquear" : "Desbloquear"}
              </button>
            </div>
            <div className="mt-3 flex gap-2">
              <input
                className="field w-full"
                type="password"
                minLength={8}
                placeholder="Nova senha (opcional)"
                value={passwordById[user.id] ?? ""}
                onChange={(e) => setPasswordById((current) => ({ ...current, [user.id]: e.target.value }))}
              />
              <button
                className="btn-ghost text-xs"
                disabled={!passwordById[user.id]}
                onClick={() => void update(user.id, { password: passwordById[user.id] })}
              >
                Redefinir
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
