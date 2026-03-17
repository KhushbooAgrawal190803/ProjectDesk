import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['nodemailer', 'pdfkit', 'archiver'],
};

export default nextConfig;
