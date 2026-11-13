import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/config";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getSiteUrl();
  const paths = ["", "/precos", "/faq", "/requisitos", "/termos", "/privacidade"];
  return paths.map((path) => ({
    url: `${base}${path || "/"}`,
    changeFrequency: "weekly" as const,
    priority: path === "" ? 1 : 0.6,
  }));
}
