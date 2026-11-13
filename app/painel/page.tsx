import { getSessionUser } from "@/lib/auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PainelApp } from "@/components/painel/PainelApp";
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
  return (
    <PainelApp
      user={{ id: current.user.id, email: current.user.email, name: current.user.name }}
    />
  );
}
