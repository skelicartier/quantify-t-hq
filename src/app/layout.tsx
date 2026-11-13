import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";

import { readHqTheme } from "@/lib/dal/theme";

import "./globals.css";

// The faces ship with the app (WOFF2, SIL OFL — see src/app/fonts), so the
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

// The wordmark's face ("quantify terminal." at the top of every screen and on every
// document), 600 and the 700 full stop. Preloaded: the rail draws it on every page.
const poppins = localFont({
  src: [
    { path: "./fonts/poppins-latin-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/poppins-latin-700.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  variable: "--font-wordmark",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://hq.quantifyterminal.com"),
  title: {
    default: "Quantify Terminal HQ",
    template: "%s | Quantify Terminal HQ",
  },
  description: "The staff portal for Quantify Terminal.",
  // Installable on a phone or a desk: the Quantify symbol, the November 2026 logo in its
  // light form (white square, black Q, violet dot). The tab takes the favicon; a desk or
  // phone, the app icon.
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/favicon-light.ico", sizes: "48x48 32x32 16x16" },
      { url: "/icons/favicon-light.svg", type: "image/svg+xml" },
      { url: "/icons/hq-icon-white-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/hq-apple-icon-light.png", sizes: "180x180", type: "image/png" }],
  },
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
      className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} ${poppins.variable}`}
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
