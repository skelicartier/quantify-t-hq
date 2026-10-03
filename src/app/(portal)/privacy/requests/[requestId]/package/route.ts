import { NextResponse, type NextRequest } from "next/server";

import { hasCapability, requireStaff } from "@/lib/access/core";
import { FALLBACK_LETTERHEAD, readCompany } from "@/lib/api/company";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { makePrivacyPackage } from "@/lib/api/privacy";
import { buildPrivacyZip, privacyFilename } from "@/lib/documents/privacy-zip";
import { SameOriginActionError, requireSameOriginServerAction } from "@/lib/security/action-origin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The copy of a person's data an access or portability request needs, as one zip. A route
 * handler because an action cannot answer with a file: same origin, a live session and the
 * desk's capability are checked here; the service checks the rest (a fresh code, the kind,
 * the request open, identity settled) and writes the request's timeline and the audit row
 * before the records leave.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> },
): Promise<NextResponse> {
  try {
    await requireSameOriginServerAction();
  } catch (error) {
    if (error instanceof SameOriginActionError)
      return new NextResponse("Forbidden", { status: 403 });
    throw error;
  }
  const { requestId } = await params;
  const id = /^[0-9a-fA-F-]{36}$/.test(requestId) ? requestId : "";
  const path = `/privacy/requests/${id}`;
  const context = await requireStaff(id ? path : "/privacy");
  const base = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin;
  const back = (outcome: string) =>
    NextResponse.redirect(new URL(`${id ? path : "/privacy"}?package=${outcome}#copy`, base), 303);
  if (!id) return back("failed");
  if (!hasCapability(context, "privacy:write")) return back("forbidden");

  let pack: Awaited<ReturnType<typeof makePrivacyPackage>>;
  try {
    pack = await makePrivacyPackage(context.token, id);
  } catch (error) {
    if (error instanceof HqApiRequestError) {
      if (error.details["sudo_required"] === true) return back("sudo");
      if (typeof error.details["identity"] === "string") return back("identity");
      if (error.status === 403) return back("forbidden");
      return back("failed");
    }
    if (error instanceof HqApiUnavailableError) return back("failed");
    throw error;
  }
  let company = FALLBACK_LETTERHEAD.name;
  try {
    company = (await readCompany(context.token)).letterhead.name || company;
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  return new NextResponse(Buffer.from(buildPrivacyZip(pack, company)), {
    status: 200,
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${privacyFilename(pack.reference)}"`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
