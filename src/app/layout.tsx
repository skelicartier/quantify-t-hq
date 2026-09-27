import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";

import { readHqTheme } from "@/lib/dal/theme";

import "./globals.css";

// Both faces ship with the app (variable WOFF2, SIL OFL — see src/app/fonts), so the
// build never depends on Google Fonts and the strict `font-src 'self'` CSP holds.
const spaceGrotesk = localFont({
  src: "./fonts/space-grotesk-latin-wght.woff2",
  weight: "300 700",
  display: "swap",
  variable: "--font-space-grotesk",
});

const jetbrainsMono = localFont({
  src: "./fonts/jetbrains-mono-latin-wght.woff2",
  weight: "100 800",
  display: "swap",
  variable: "--font-jetbrains-mono",
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  metadataBase: new URL("https://hq.quantifyterminal.com"),
  title: {
    default: "Quantify Terminal HQ",
    template: "%s | Quantify HQ",
  },
  description: "The staff portal for Quantify Terminal.",
  robots: {
    index: false,
    follow: false,
  },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#030404",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  // The signed-in portal's theme; the sign-in pages ignore it, the error and not-found
  // pages follow it so a light portal never drops someone onto a black screen.
  const theme = await readHqTheme();
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${jetbrainsMono.variable}`}
      data-theme={theme}
    >
      <body>
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
