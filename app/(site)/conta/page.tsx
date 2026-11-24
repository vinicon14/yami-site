import { getSessionUser } from "@/lib/auth";
import { getStore } from "@/lib/db";
import { toPublicFeatureRequest } from "@/lib/feature-requests";
import { AccountPanel } from "@/components/AccountPanel";
import { AccountLocalPersistence } from "@/components/AccountLocalPersistence";
import { FeatureRequestsPanel } from "@/components/FeatureRequestsPanel";
import { MeusAppsPanel } from "@/components/MeusAppsPanel";
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
  const requests = await store.listFeatureRequests(current.user.id);

  return (
    <article className="mx-auto max-w-2xl px-5 py-12 md:px-8 md:py-16">
      <p className="kicker">Conta</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">
        Olá{current.user.name ? `, ${current.user.name}` : ""}
      </h1>
      <p className="mt-2 text-sm text-muted">{current.user.email}</p>
      <AccountLocalPersistence
        userId={current.user.id}
        email={current.user.email}
        name={current.user.name}
      />
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
      <MeusAppsPanel />
      <FeatureRequestsPanel items={requests.map(toPublicFeatureRequest)} />
    </article>
  );
}
