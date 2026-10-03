import { NextResponse, type NextRequest } from "next/server";

import { requireStaff } from "@/lib/access/core";
import { makeBackup } from "@/lib/api/backup";
import { FALLBACK_LETTERHEAD, readCompany } from "@/lib/api/company";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { backupFilename, buildBackupZip } from "@/lib/documents/backup-zip";
import { SameOriginActionError, requireSameOriginServerAction } from "@/lib/security/action-origin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The backup, as one zip. A route handler, not a server action, because an action cannot
 * answer with a file — so it re-checks what an action would: same origin, a live session,
 * an Owner. The service adds the rest (a fresh code, the second Owner's approval when one
 * exists, the audit row before a record leaves) and returns the records once.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    await requireSameOriginServerAction();
  } catch (error) {
    if (error instanceof SameOriginActionError)
      return new NextResponse("Forbidden", { status: 403 });
    throw error;
  }
  const context = await requireStaff("/admin/backup");
  const base = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin;
  const back = (outcome: string) =>
    NextResponse.redirect(new URL(`/admin/backup?backup=${outcome}`, base), 303);
  if (context.me.role !== "owner") return back("forbidden");
  const form = await request.formData();
  const approvalId = String(form.get("approval_id") ?? "").slice(0, 64);
  const reason = String(form.get("reason") ?? "")
    .slice(0, 400)
    .trim();
  if (!approvalId && reason.length < 8) return back("reason");

  let backup: Awaited<ReturnType<typeof makeBackup>>;
  try {
    backup = await makeBackup(context.token, approvalId ? { approvalId } : { reason });
  } catch (error) {
    if (error instanceof HqApiRequestError) {
      if (error.details["sudo_required"] === true) return back("sudo");
      if (typeof error.details["reason"] === "string" && error.status === 400)
        return back("reason");
      if (error.status === 403) return back("forbidden");
      if (error.status === 404) return back("approval");
      if (typeof error.details["status"] === "string") return back("lapsed");
      return back("failed");
    }
    if (error instanceof HqApiUnavailableError) return back("failed");
    throw error;
  }
  // The README names the company; the records have left the service already, so a failed
  // read of the particulars names it plainly rather than throwing the backup away.
  let company = FALLBACK_LETTERHEAD.name;
  try {
    company = (await readCompany(context.token)).letterhead.name || company;
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const zip = buildBackupZip(backup, company);
  return new NextResponse(Buffer.from(zip), {
    status: 200,
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${backupFilename(backup.generated_at)}"`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
