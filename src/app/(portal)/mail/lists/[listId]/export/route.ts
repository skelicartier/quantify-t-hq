import { NextResponse, type NextRequest } from "next/server";

import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { exportList } from "@/lib/api/mail";
import { SameOriginActionError, requireSameOriginServerAction } from "@/lib/security/action-origin";

export const dynamic = "force-dynamic";

/**
 * A list as a CSV download. A route handler because an action cannot answer with a file,
 * so it re-checks what an action would: same origin, a live session, the export
 * capability. The service adds a fresh code, the reason and the audit row first.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ listId: string }> },
): Promise<NextResponse> {
  try {
    await requireSameOriginServerAction();
  } catch (error) {
    if (error instanceof SameOriginActionError) {
      return new NextResponse("Forbidden", { status: 403 });
    }
    throw error;
  }
  const { listId } = await params;
  const context = await requireStaff(`/mail/lists/${listId}`);
  const base = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin;
  const back = (outcome: string) =>
    NextResponse.redirect(
      new URL(`/mail/lists/${encodeURIComponent(listId)}?export=${outcome}`, base),
      303,
    );
  if (!hasCapability(context, "crm:export")) return back("forbidden");
  const form = await request.formData();
  const reason = String(form.get("reason") ?? "")
    .slice(0, 400)
    .trim();
  if (reason.length < 8) return back("reason");
  try {
    const exported = await exportList(context.token, listId, reason);
    const filename = exported.filename.replace(/[^A-Za-z0-9._-]/g, "_");
    return new NextResponse(exported.csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof HqApiRequestError) {
      if (error.details["sudo_required"] === true) return back("sudo");
      if (error.status === 403) return back("forbidden");
      return back("failed");
    }
    if (error instanceof HqApiUnavailableError) return back("failed");
    throw error;
  }
}
