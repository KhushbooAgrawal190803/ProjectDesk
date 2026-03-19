import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

/** Fixes Turbopack picking a parent folder when multiple package-lock files exist (ensures correct app root). */
const turbopackRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  serverExternalPackages: ['nodemailer', 'pdfkit', 'archiver'],
  turbopack: {
    root: turbopackRoot,
  },
};

export default nextConfig;
