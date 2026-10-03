import { NextResponse, type NextRequest } from "next/server";

import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { completeMailboxConnect } from "@/lib/api/mail";

export const dynamic = "force-dynamic";

/** What the service's refusal reasons mean on the page the browser returns to. */
const OUTCOMES: Record<string, string> = {
  "mail-scope-missing": "scope",
  state: "expired",
  "address-in-use": "address",
  "someone-else's": "address",
  "not-configured": "configured",
};

/**
 * Where a mailbox's consent screen sends the browser back. The one-time code is relayed
 * to the service with this staff member's own session; the service checks the `state`
 * names them, exchanges the code and seals what it gets. Nothing is decided here beyond
 * where to send them next.
 *
 * The redirect base is the configured site URL, not the request's Host header, so a
 * forged host cannot turn this into a redirect somewhere else.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const context = await requireStaff("/mail/mailboxes");
  const base = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin;
  const back = (outcome: string) =>
    NextResponse.redirect(new URL(`/mail/mailboxes?connected=${outcome}`, base), 303);

  if (!hasCapability(context, "crm:write")) return back("forbidden");
  const params = request.nextUrl.searchParams;
  if (params.get("error")) return back("denied");
  const code = (params.get("code") ?? "").slice(0, 2048);
  const state = (params.get("state") ?? "").slice(0, 2048);
  if (!code || !state) return back("failed");
  try {
    await completeMailboxConnect(context.token, code, state);
  } catch (error) {
    if (error instanceof HqApiRequestError) {
      const reason = error.details["reason"];
      return back((typeof reason === "string" && OUTCOMES[reason]) || "failed");
    }
    if (error instanceof HqApiUnavailableError) return back("failed");
    throw error;
  }
  return back("connected");
}
