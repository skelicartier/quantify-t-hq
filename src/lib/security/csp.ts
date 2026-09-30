/**
 * The page's content security policy, minted per request by the proxy.
 *
 * Scripts run only when they carry this request's nonce (`'strict-dynamic'` lets a
 * trusted script load the chunks it needs, and nothing else). The portal renders text
 * that outsiders wrote — ticket bodies, intake leads, mail replies — so an injected
 * `<script>` or `onerror=` in one of them must meet a policy that refuses it; with
 * `'unsafe-inline'` it would run with a staff member's session. Every page renders per
 * request (the root layout reads the theme cookie), which is what lets Next attach the
 * nonce to its own scripts. Inline styles stay allowed: charts and layout set them, and a
 * style cannot run code.
 */

export const NONCE_HEADER = "x-nonce";

export function newNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text);
}

export function contentSecurityPolicy(
  nonce: string,
  { development }: { development: boolean },
): string {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "font-src 'self' data:",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data: blob:",
    "object-src 'none'",
    // React reconstructs server stacks with eval in development only.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "connect-src 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
}
