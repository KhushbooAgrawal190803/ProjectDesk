import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { NavigationEvents } from "@/components/navigation-events";
import { PageLoadingIndicator } from "@/components/page-loading-indicator";
import { Suspense } from "react";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Level Up Buildcon - Booking Registry",
  description: "Internal booking form registry for Level Up Buildcon",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased bg-zinc-50`}>
        <Suspense fallback={null}>
          <NavigationEvents />
          <PageLoadingIndicator />
        </Suspense>
        {children}
        <Toaster position="top-right" />
      </body>
    </html>
  );
}
