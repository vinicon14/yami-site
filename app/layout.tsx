import type { Metadata } from "next";
import localFont from "next/font/local";
import { PRODUCT } from "@/lib/config";
import "./globals.css";

const outfit = localFont({
  src: "./fonts/outfit-latin-wght-normal.woff2",
  variable: "--font-outfit",
  display: "swap",
  weight: "100 900",
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
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icon-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/icon-512.png", sizes: "512x512", type: "image/png" }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${outfit.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-canvas text-ink font-sans">
        {children}
      </body>
    </html>
  );
}
