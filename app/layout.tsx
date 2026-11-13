import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Newsreader } from "next/font/google";
import { PRODUCT } from "@/lib/config";
import "./globals.css";

const serif = Newsreader({
  subsets: ["latin", "latin-ext"],
  variable: "--font-newsreader",
  display: "swap",
  style: ["normal", "italic"],
  weight: ["400", "500", "600", "700"],
});

const sans = IBM_Plex_Sans({
  subsets: ["latin", "latin-ext"],
  variable: "--font-ibm-sans",
  display: "swap",
  weight: ["400", "500", "600"],
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-ibm-mono",
  display: "swap",
  weight: ["400", "500"],
});

const title = "YAMI — seu agente de IA para Windows";
const description =
  `A YAMI ${PRODUCT.version} é um assistente de IA que roda no seu Windows. Conversa, publica conteúdo com o Forage e pode ser usada de outro computador pelo navegador, enquanto o programa continua no seu PC. Pagamento único.`;

export const metadata: Metadata = {
  title: {
    default: title,
    template: "%s · YAMI",
  },
  description,
  applicationName: "YAMI",
  openGraph: {
    title,
    description,
    locale: "pt_BR",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "YAMI — seu agente de IA",
    description,
  },
  robots: { index: true, follow: true },
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="pt-BR"
      className={`${serif.variable} ${sans.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-paper text-ink font-sans">
        {children}
      </body>
    </html>
  );
}
