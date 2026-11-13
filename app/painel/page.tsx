import { getSessionUser } from "@/lib/auth";
import { getRelayProvider } from "@/lib/config";
import { getStore } from "@/lib/db";
import { userHasPaidLicense } from "@/lib/license-gate";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PainelApp } from "@/components/painel/PainelApp";
import { LicenseRequired } from "@/components/LicenseRequired";
import { PainelEmBreve } from "@/components/PainelEmBreve";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Painel remoto",
  description:
    "Use a YAMI do seu PC de casa a partir de outro computador. A conexão sai do aplicativo instalado.",
  robots: { index: false, follow: false },
};

export default async function PainelPage() {
  const jar = await cookies();
  const current = await getSessionUser(jar.get("yami_session")?.value);
  if (!current) redirect("/entrar?next=/painel");

  const store = await getStore();
  const licensed = await userHasPaidLicense(current.user.email, store);
  if (!licensed) {
    return <LicenseRequired variant="dark" />;
  }

  const relay = getRelayProvider();
  // Na Vercel o relé em memória não atravessa instâncias serverless.
  // Fora da Vercel (dev local) o relé em memória funciona neste processo.
  const relayReady =
    relay === "ably" || relay === "pusher" || (relay === "memory" && !process.env.VERCEL);
  if (!relayReady) {
    return <PainelEmBreve email={current.user.email} />;
  }

  return (
    <PainelApp
      user={{ id: current.user.id, email: current.user.email, name: current.user.name }}
    />
  );
}
