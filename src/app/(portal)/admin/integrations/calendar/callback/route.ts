import { NextResponse, type NextRequest } from "next/server";

import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { completeCalendarConnect } from "@/lib/api/integrations";

export const dynamic = "force-dynamic";

/**
 * Where the calendar's consent screen sends the browser back. The one-time code is
 * relayed to the service with this staff member's own session; the service checks the
 * `state` names them. Nothing is decided here beyond where to send them next.
 *
 * The redirect base is the configured site URL, not the request's Host header, so a
 * forged host cannot turn this into a redirect somewhere else.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const context = await requireStaff("/admin/integrations");
  const base = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin;
  const back = (outcome: string) =>
    NextResponse.redirect(new URL(`/admin/integrations?calendar=${outcome}`, base), 303);

  if (!hasCapability(context, "hq:admin")) return back("forbidden");
  const params = request.nextUrl.searchParams;
  if (params.get("error")) return back("denied");
  const code = (params.get("code") ?? "").slice(0, 1024);
  const state = (params.get("state") ?? "").slice(0, 2048);
  if (!code || !state) return back("failed");
  try {
    await completeCalendarConnect(context.token, code, state);
  } catch (error) {
    if (error instanceof HqApiRequestError) {
      const reason = error.details["reason"];
      if (reason === "calendar-scope-missing") return back("scope");
      if (reason === "state") return back("expired");
      return back("failed");
    }
    if (error instanceof HqApiUnavailableError) return back("failed");
    throw error;
  }
  return back("connected");
}
