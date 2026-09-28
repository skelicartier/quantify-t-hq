import { NextResponse, type NextRequest } from "next/server";

import * as authApi from "@/lib/api/auth";
import { DEV_PERSONAS, devAutologinPersona, isDevPersona } from "@/lib/auth/dev-bypass";
import { sanitizeNextPath } from "@/lib/auth/route-policy";
import { setSessionCookie } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * `GET /dev/signin?as=<persona>&next=<path>`: signs in against the mock as that persona
 * — the mock takes one password and one code for everyone — and lands on `next`.
 * Development only; see `dev-bypass.ts`.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const flag = devAutologinPersona();
  if (!flag) return new NextResponse("Not found", { status: 404 });
  // Redirect to the host the browser used (localhost or 127.0.0.1): the cookie is set
  // for that host and nowhere else, and `nextUrl` reports the dev server's own name.
  const host = request.headers.get("host") ?? request.nextUrl.host;
  const origin = `${request.nextUrl.protocol}//${host}`;
  const requested = request.nextUrl.searchParams.get("as") ?? flag;
  const email = isDevPersona(requested) ? requested : DEV_PERSONAS[0].email;
  const next = sanitizeNextPath(request.nextUrl.searchParams.get("next"));
  try {
    const pending = await authApi.login(email, "password-123");
    if (pending.mfa !== "totp") {
      // An unenrolled persona goes through the real enrolment screens.
      return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(next)}`, origin));
    }
    const session = await authApi.verifyTotp(pending.pending_token, "000000");
    await setSessionCookie(session.token);
  } catch {
    return NextResponse.redirect(new URL("/login?notice=unavailable", origin));
  }
  // The host the person is on stays the host they land on: cookies are per host.
  return NextResponse.redirect(new URL(next, origin));
}
