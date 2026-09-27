import { NextResponse, type NextRequest } from "next/server";

import { buildLoginRedirectUrl, isPublicPath } from "@/lib/auth/route-policy";
import { HQ_SESSION_COOKIE } from "@/lib/auth/session";

/**
 * Default-deny at the edge: no session cookie, no page, except the short public
 * allow-list. This is presence-only on purpose — the real verdict on a token belongs
 * to the service, and every loader gets it on its first read, redirecting to sign-in
 * on a refusal. What the proxy guarantees is cheaper and absolute: an unauthenticated
 * crawler or a mistyped route never renders anything at all.
 */
export function proxy(request: NextRequest): NextResponse {
  if (isPublicPath(request.nextUrl.pathname)) return NextResponse.next();
  const token = request.cookies.get(HQ_SESSION_COOKIE)?.value ?? "";
  if (token.startsWith("hq_")) return NextResponse.next();
  return NextResponse.redirect(buildLoginRedirectUrl(request.nextUrl));
}

export const config = {
  // Everything except Next's own assets and the icon files. The public pages are
  // allow-listed inside the handler, where the list is reviewable as code.
  matcher: ["/((?!_next/|favicon\\.ico|icon\\.png|apple-icon\\.png|robots\\.txt|brand/).*)"],
};
