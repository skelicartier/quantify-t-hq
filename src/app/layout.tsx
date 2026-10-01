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

// The wordmark's face ("quantify terminal." on letterheads and printed pages), 600 and
// the 700 full stop. Not preloaded: most screens never draw it.
const poppins = localFont({
  src: [
    { path: "./fonts/poppins-latin-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/poppins-latin-700.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  variable: "--font-wordmark",
  preload: false,
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
