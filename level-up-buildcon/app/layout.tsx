import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { NavigationEvents } from "@/components/navigation-events";
import { PageLoadingIndicator } from "@/components/page-loading-indicator";
import { Suspense } from "react";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
});

export const metadata: Metadata = {
  title: "Level Up Buildcon - Booking Registry",
  description: "Internal booking form registry for Level Up Buildcon",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover" as const,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${plusJakarta.variable} font-sans antialiased`}>
        <Suspense fallback={null}>
          <NavigationEvents />
          <PageLoadingIndicator />
        </Suspense>
        {children}
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
