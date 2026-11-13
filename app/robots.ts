import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/config";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/admin", "/conta", "/entrar", "/painel", "/sucesso", "/checkout"] },
    sitemap: `${getSiteUrl()}/sitemap.xml`,
  };
}
