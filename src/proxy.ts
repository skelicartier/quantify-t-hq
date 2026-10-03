import { NextResponse, type NextRequest } from "next/server";

import { devAutologinPersona } from "@/lib/auth/dev-bypass";
import { buildLoginRedirectUrl, isPublicPath } from "@/lib/auth/route-policy";
import { HQ_SESSION_COOKIE } from "@/lib/auth/session";
import { NONCE_HEADER, contentSecurityPolicy, newNonce } from "@/lib/security/csp";

/**
 * Let the request through with this request's script nonce: Next reads the policy from
 * the request headers to stamp its own scripts, and the browser enforces the copy on the
 * response.
 */
function pass(request: NextRequest): NextResponse {
  const nonce = newNonce();
  const policy = contentSecurityPolicy(nonce, {
    development: process.env.NODE_ENV === "development",
  });
  const headers = new Headers(request.headers);
  headers.set(NONCE_HEADER, nonce);
  // Where the page is, for a read the service refuses mid-render to come back to.
  headers.set("x-hq-path", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  headers.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

/**
 * Default-deny at the edge: no session cookie, no page, except the short public
 * allow-list. This is presence-only on purpose — the real verdict on a token belongs
 * to the service, and every loader gets it on its first read, redirecting to sign-in
 * on a refusal. What the proxy guarantees is cheaper and absolute: an unauthenticated
 * crawler or a mistyped route never renders anything at all.
 */
export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const bypass = devAutologinPersona();
  if (bypass && pathname === "/dev/signin") return pass(request);
  if (isPublicPath(pathname)) return pass(request);
  const token = request.cookies.get(HQ_SESSION_COOKIE)?.value ?? "";
  if (token.startsWith("hq_")) return pass(request);
  if (bypass) {
    // Development only: straight in as the configured persona, back to this page.
    const target = new URL("/dev/signin", request.nextUrl.origin);
    target.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(target);
  }
  return NextResponse.redirect(buildLoginRedirectUrl(request.nextUrl));
}

export const config = {
  // Everything except Next's own assets and the icon files. The public pages are
  // allow-listed inside the handler, where the list is reviewable as code.
  matcher: [
    "/((?!_next/|favicon\\.ico|icon\\.png|apple-icon\\.png|robots\\.txt|brand/|icons/|manifest\\.webmanifest|sw\\.js).*)",
  ],
};
