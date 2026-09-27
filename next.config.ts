import type { NextConfig } from "next";

const developmentScriptSource = process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "";

// No Turnstile frames here and no third-party scripts at all: HQ is staff-only, and the
// public certificate check is a plain page. The connect-src still names the Functions
// host because every read the portal renders comes from it server-side in production —
// but the browser itself never calls it, so this stays as tight as the console's.
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "font-src 'self' data:",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "img-src 'self' data: blob:",
  "object-src 'none'",
  `script-src 'self' 'unsafe-inline'${developmentScriptSource}`,
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
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
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  poweredByHeader: false,
  reactStrictMode: true,
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
