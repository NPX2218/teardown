// app/layout.tsx
import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { Barlow, Barlow_Semi_Condensed, Roboto_Mono } from "next/font/google";
import { MotionProvider } from "@/components/ui/MotionProvider";
import "./globals.css";

const display = Barlow_Semi_Condensed({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--nf-display",
  display: "swap",
});
const body = Barlow({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--nf-body",
  display: "swap",
});
const mono = Roboto_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--nf-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Teardown",
  description: "Bringing rocket science down to Earth.",
};

export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <MotionProvider>
          {children}
          <footer className="legal">
            <span>Made by Neel Bansal and Anders Haroldson</span>
            <span>Student project. Not affiliated with SpaceX or xAI.</span>
            <span>
              Model: &ldquo;Falcon 9 - SpaceX&rdquo; by Stanley Creative,{" "}
              <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>
            </span>
          </footer>
        </MotionProvider>
      </body>
    </html>
  );
}
