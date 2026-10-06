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
  // Document uploads use a Server Action (FormData). Default limit is 1 MB.
  experimental: {
    serverActions: {
      bodySizeLimit: '12mb',
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
