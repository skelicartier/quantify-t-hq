/**
 * Which paths exist without a session. DEFAULT-DENY: everything not listed here is
 * behind sign-in, which inverts the console's positive matcher on purpose — a staff
 * portal's failure mode must be "locked out", never "accidentally public". Adding a
 * public page means adding a line here, out loud, in review.
 */

const PUBLIC_EXACT = new Set([
  "/login",
  "/login/verify",
  "/login/enroll",
  "/forgot-password",
  "/reset-password",
]);

const PUBLIC_PREFIXES = ["/verify/"];

export function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * Where sign-in returns to. Only in-portal absolute paths survive; anything else —
 * another origin, a protocol-relative `//`, the sign-in pages themselves — falls back
 * to home.
 */
export function sanitizeNextPath(raw: string | null | undefined): string {
  const value = (raw ?? "").trim();
  if (!value.startsWith("/") || value.startsWith("//")) return "/home";
  if (value === "/" || isPublicPath(value) || value.startsWith("/login")) return "/home";
  return value;
}

export function buildLoginRedirectUrl(current: URL): URL {
  const target = new URL("/login", current.origin);
  const next = `${current.pathname}${current.search}`;
  if (next && next !== "/") target.searchParams.set("next", next);
  return target;
}
