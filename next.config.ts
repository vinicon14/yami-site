import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Evita que o TypeScript da pasta de testes entre no build da Vercel.
  typescript: {
    ignoreBuildErrors: false,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
