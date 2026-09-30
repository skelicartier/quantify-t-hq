import { NextResponse, type NextRequest } from "next/server";

import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { EXPORT_KINDS, createExport, type ExportKind } from "@/lib/api/reports";
import { SameOriginActionError, requireSameOriginServerAction } from "@/lib/security/action-origin";

export const dynamic = "force-dynamic";

/**
 * A CSV download. A route handler, not a server action, because an action cannot answer
 * with a file — so it re-checks everything an action would: same origin, a live
 * session, the export capability. The service adds the rest (fresh re-authentication, a
 * written reason, the audit row before the file leaves).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    await requireSameOriginServerAction();
  } catch (error) {
    if (error instanceof SameOriginActionError) {
      return new NextResponse("Forbidden", { status: 403 });
    }
    throw error;
  }
  const context = await requireStaff("/reports");
  const base = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin;
  const back = (outcome: string) =>
    NextResponse.redirect(new URL(`/reports?export=${outcome}`, base), 303);
  if (!hasCapability(context, "crm:export")) return back("forbidden");

  const form = await request.formData();
  const kind = String(form.get("kind") ?? "");
  const reason = String(form.get("reason") ?? "")
    .slice(0, 400)
    .trim();
  if (!(EXPORT_KINDS as readonly string[]).includes(kind)) return back("failed");
  if (reason.length < 8) return back("reason");

  try {
    const exported = await createExport(context.token, kind as ExportKind, reason);
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
      if (error.details["reason"] === "export-quota") return back("quota");
      if (error.status === 403) return back("forbidden");
      return back("failed");
    }
    if (error instanceof HqApiUnavailableError) return back("failed");
    throw error;
  }
}
