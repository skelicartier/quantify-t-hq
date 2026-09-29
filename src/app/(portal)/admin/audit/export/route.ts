import { NextResponse, type NextRequest } from "next/server";

import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { exportAudit } from "@/lib/api/staff";
import { SameOriginActionError, requireSameOriginServerAction } from "@/lib/security/action-origin";

export const dynamic = "force-dynamic";

/**
 * A signed JSONL download of the audit log for a date range. A route handler, not a
 * server action, because an action cannot answer with a file — so it re-checks what an
 * action would: same origin, a live session, the audit capability. The service adds the
 * rest: a fresh re-authentication, a written reason, and the audit row before the file.
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
  const context = await requireStaff("/admin/audit");
  const base = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin;
  const back = (outcome: string) =>
    NextResponse.redirect(new URL(`/admin/audit?export=${outcome}`, base), 303);
  if (!hasCapability(context, "audit:read")) return back("forbidden");

  const form = await request.formData();
  const from = String(form.get("from") ?? "").trim();
  const to = String(form.get("to") ?? "").trim();
  const reason = String(form.get("reason") ?? "")
    .slice(0, 400)
    .trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return back("dates");
  if (reason.length < 8) return back("reason");

  try {
    const exported = await exportAudit(context.token, { from, to, reason });
    const filename = exported.filename.replace(/[^A-Za-z0-9._-]/g, "_");
    return new NextResponse(exported.jsonl, {
      status: 200,
      headers: {
        "content-type": "application/x-ndjson; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "x-hq-audit-sha256": exported.sha256,
      },
    });
  } catch (error) {
    if (error instanceof HqApiRequestError) {
      if (error.details["sudo_required"] === true) return back("sudo");
      if (error.status === 403) return back("forbidden");
      if (error.code === "malformed_request") return back("dates");
      return back("failed");
    }
    if (error instanceof HqApiUnavailableError) return back("failed");
    throw error;
  }
}
