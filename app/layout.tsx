import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { PagesAssetPrefix, PagesPreviewNote } from "@/components/pages/PagesBuild";
import { MotionProvider } from "@/components/ui/MotionProvider";
import { Footer } from "@/components/ui/Footer";
import "./globals.css";

/** D-DIN (Datto, SIL OFL 1.1). Kiosk and HUD headlines only. See app/fonts/d-din/OFL-1.1.txt. */
const dDin = localFont({
  src: [
    { path: "./fonts/d-din/D-DIN.woff2", weight: "400", style: "normal" },
    { path: "./fonts/d-din/D-DIN-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-d-din",
  display: "swap",
  fallback: ["Arial Narrow", "Arial", "sans-serif"],
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: "Teardown",
  description: "Bringing rocket science down to Earth.",
};

export const viewport: Viewport = {
  themeColor: "#0A0A0A",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} ${dDin.variable}`}>
      <head>
        <PagesAssetPrefix />
      </head>
      <body>
        <PagesPreviewNote />
        <MotionProvider>
          {children}
          <Footer />
        </MotionProvider>
      </body>
    </html>
  );
}
