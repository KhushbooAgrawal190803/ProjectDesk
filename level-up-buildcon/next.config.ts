import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

const nextConfigDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * Local dev: pin Turbopack root to this app so a stray lockfile higher up isn't chosen.
 * Vercel: omit — platform sets `outputFileTracingRoot`; `turbopack.root` must match or Next warns.
 */
const nextConfig: NextConfig = {
  serverExternalPackages: ['archiver'],
  // Uploads go straight to Supabase Storage, so server actions only carry form data.
  // Kept under Vercel's 4.5 MB request limit.
  experimental: {
    serverActions: {
      bodySizeLimit: '4mb',
    },
  },
  ...(process.env.VERCEL
    ? {}
    : {
        turbopack: {
          root: nextConfigDir,
        },
      }),
};

export default nextConfig;
