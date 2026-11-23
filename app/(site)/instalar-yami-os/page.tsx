import type { Metadata } from "next";
import { InstallGuide } from "@/components/install/InstallGuide";
import { YamiOsPromo } from "@/components/YamiOsPromo";
import { YAMI_OS_NAME } from "@/lib/yamios/brand";
import manifest from "@/lib/yamios/latest.json";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `Instalar o ${YAMI_OS_NAME}`,
  description: `Como baixar, conferir, gravar o pendrive e instalar o ${YAMI_OS_NAME}, em linguagem simples.`,
};

export default function InstalarYamiOsPage() {
  return (
    <>
      <YamiOsPromo source={manifest} />
      <InstallGuide source={manifest} />
    </>
  );
}
