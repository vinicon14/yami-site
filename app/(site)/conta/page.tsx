import { getSessionUser } from "@/lib/auth";
import { getStore } from "@/lib/db";
import { AccountPanel } from "@/components/AccountPanel";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Sua conta",
  robots: { index: false, follow: false },
};

export default async function ContaPage() {
  const jar = await cookies();
  const raw = jar.get("yami_session")?.value;
  const current = await getSessionUser(raw);
  if (!current) redirect("/entrar?next=/conta");

  const store = await getStore();
  const licenses = await store.getLicensesByEmail(current.user.email);
  const orders = await store.getOrdersByEmail(current.user.email);
  const devices = await store.listDevices(current.user.id);
  const audit = await store.listAudit(current.user.id, 20);

  return (
    <article className="mx-auto max-w-2xl px-5 py-12 md:px-8 md:py-16">
      <p className="kicker">Conta</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">
        Olá{current.user.name ? `, ${current.user.name}` : ""}
      </h1>
      <p className="mt-2 text-sm text-muted">{current.user.email}</p>
      <AccountPanel
        licenses={licenses.map((l) => ({
          id: l.id,
          key: l.key,
          orderId: l.orderId,
          createdAt: l.createdAt,
        }))}
        orders={orders.map((o) => ({
          id: o.id,
          status: o.status,
          amountBrl: o.amountBrl,
          paidAt: o.paidAt,
          createdAt: o.createdAt,
        }))}
        devices={devices.map((d) => ({
          id: d.id,
          name: d.name,
          createdAt: d.createdAt,
          lastSeenAt: d.lastSeenAt,
          revoked: Boolean(d.revokedAt),
        }))}
        audit={audit.map((a) => ({
          id: a.id,
          action: a.action,
          createdAt: a.createdAt,
          meta: a.meta,
        }))}
      />
    </article>
  );
}
