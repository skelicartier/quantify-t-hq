import type { NextConfig } from "next";

// The content security policy is not here: it carries a fresh script nonce on every
// request, so the proxy writes it (`src/lib/security/csp.ts`). Next's own assets, which
// the proxy skips, are scripts and styles the policy governs, not documents that need one.

const securityHeaders = [
  // "same-origin", not "no-referrer": under no-referrer a browser sends `Origin: null` on
  // a plain same-origin form POST (the CSV export), which the same-origin check must then
  // refuse. same-origin still sends nothing to other sites, so record URLs never leave.
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

// A staff portal has no cacheable page. Everything is either an auth screen or a view
// over live data, so no-store is the rule rather than the exception; only the public
// certificate check escapes with plain defaults.
const noStore = [{ key: "Cache-Control", value: "private, no-store, max-age=0" }];

const nextConfig: NextConfig = {
  // The dev badge landed in every review screenshot; the harness is the indicator.
  devIndicators: false,
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  poweredByHeader: false,
  reactStrictMode: true,
  // The export route reads the PDF typefaces from disk; trace them into it.
  outputFileTracingIncludes: {
    "/exports": ["./assets/pdf-fonts/**/*"],
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/", headers: noStore },
      { source: "/login", headers: noStore },
      { source: "/login/:path*", headers: noStore },
      { source: "/forgot-password", headers: noStore },
      { source: "/reset-password", headers: noStore },
      { source: "/home", headers: noStore },
      { source: "/me/:path*", headers: noStore },
      { source: "/admin/:path*", headers: noStore },
    ];
  },
};

export default nextConfig;
