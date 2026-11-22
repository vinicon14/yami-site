import { getSessionUser } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { publicHistoryItem } from "@/lib/admin-release";
import { getStore } from "@/lib/db";
import { getCurrentManifest } from "@/lib/release-store";
import { toPublicManifest } from "@/lib/release";
import { AdminPanel } from "@/components/admin/AdminPanel";
import { AdminRequestsPanel } from "@/components/admin/AdminRequestsPanel";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  const jar = await cookies();
  const current = await getSessionUser(jar.get("yami_session")?.value);
  if (!current) redirect("/entrar?next=/admin");
  if (!isAdminEmail(current.user.email)) notFound();

  const store = await getStore();
  const manifest = await getCurrentManifest(store);
  const history = await store.listReleaseHistory(undefined, 40);
  const requests = await store.listFeatureRequests();

  return (
    <>
      <AdminPanel
        email={current.user.email}
        manifest={manifest ? toPublicManifest(manifest) : null}
        history={history.map(publicHistoryItem)}
      />
      <AdminRequestsPanel items={requests} />
    </>
  );
}
