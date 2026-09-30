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

// "/u/": the recipient's stop page and the one-click endpoint mailbox providers POST to.
// "/report/": "this wasn't me" from a security mail — the person may be locked out.
const PUBLIC_PREFIXES = ["/verify/", "/u/", "/report/"];

export function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * Where sign-in returns to. Only in-portal absolute paths survive; anything else —
 * another origin, a protocol-relative `//`, the sign-in pages themselves — falls back
 * to home.
 *
 * Judged by resolving it the way the browser will, not by looking at its first two
 * characters: a URL parser reads `/\evil.com` as `https://evil.com/` (a backslash is a
 * slash in web URLs) and strips a tab or newline before it looks, so `/\t//evil.com`
 * leaves the site too. Sign-in is the one moment a person has just typed their
 * password and a code, and where they land next must be here.
 */
const PORTAL_STAND_IN = "https://portal.invalid";

export function sanitizeNextPath(raw: string | null | undefined): string {
  const value = (raw ?? "").trim();
  if (!value.startsWith("/") || value.startsWith("//")) return "/home";
  let resolved: URL;
  try {
    resolved = new URL(value, PORTAL_STAND_IN);
  } catch {
    return "/home";
  }
  if (resolved.origin !== PORTAL_STAND_IN) return "/home";
  const path = `${resolved.pathname}${resolved.search}`;
  if (path === "/" || isPublicPath(resolved.pathname) || resolved.pathname.startsWith("/login")) {
    return "/home";
  }
  return path;
}

export function buildLoginRedirectUrl(current: URL): URL {
  const target = new URL("/login", current.origin);
  const next = `${current.pathname}${current.search}`;
  if (next && next !== "/") target.searchParams.set("next", next);
  return target;
}
