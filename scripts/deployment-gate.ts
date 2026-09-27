/**
 * Runs before every `next build`. A production build on Vercel is refused unless the
 * environment it will serve with is actually present — a portal that builds green and
 * then cannot reach its own service is the worse failure, because it looks deployed.
 * Local and preview builds pass freely.
 */

const isVercelProduction = process.env.VERCEL === "1" && process.env.VERCEL_ENV === "production";

const REQUIRED_IN_PRODUCTION = ["HQ_ACCOUNT_API_BASE_URL", "NEXT_PUBLIC_SITE_URL"] as const;

/** Server-held secrets that must never be configured on this app at all. */
const FORBIDDEN_EVERYWHERE = [
  "QT_HQ_TOKEN_SECRET",
  "QT_HQ_TOTP_ENCRYPTION_KEY",
  "AZURE_SQL_CONNECTION_STRING",
  "AZURE_AUTH_JWT_SECRET",
  "BREVO_API_KEY",
] as const;

let failed = false;

for (const name of FORBIDDEN_EVERYWHERE) {
  if (process.env[name]) {
    console.error(`[deployment-gate] ${name} must not be set on the HQ portal.`);
    failed = true;
  }
}

if (isVercelProduction) {
  for (const name of REQUIRED_IN_PRODUCTION) {
    if (!process.env[name]) {
      console.error(`[deployment-gate] ${name} is required for a production build.`);
      failed = true;
    }
  }
}

if (failed) {
  process.exit(1);
}
console.log(
  isVercelProduction
    ? "[deployment-gate] production environment verified."
    : "[deployment-gate] non-production build; gate passive.",
);
