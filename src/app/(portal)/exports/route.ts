import { NextResponse, type NextRequest } from "next/server";

import { hasCapability, requireStaff } from "@/lib/access/core";
import { FALLBACK_LETTERHEAD, readCompany, type Letterhead } from "@/lib/api/company";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { createExport, type ExportFile } from "@/lib/api/reports";
import { onDemoService } from "@/lib/demo-figures";
import { loadDocumentAssets } from "@/lib/documents/assets";
import { stampLabel } from "@/lib/documents/cells";
import { buildTablePdf } from "@/lib/documents/pdf";
import { buildWorkbook } from "@/lib/documents/xlsx";
import {
  EXPORT_FORMATS,
  EXPORT_KINDS,
  exportColumns,
  exportView,
  safeReturnPath,
  safeReturnQuery,
  type ExportFormat,
  type ExportKind,
} from "@/lib/exports";
import { isViewExportKind, viewRecordIds } from "@/lib/lists/views";
import { SameOriginActionError, requireSameOriginServerAction } from "@/lib/security/action-origin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CONTENT_TYPES: Record<ExportFormat, string> = {
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
};

function attachment(body: BodyInit, format: ExportFormat, filename: string): NextResponse {
  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": CONTENT_TYPES[format],
      "content-disposition": `attachment; filename="${filename.replace(/[^A-Za-z0-9._-]/g, "_")}"`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

/**
 * A download: CSV, Excel or PDF. A route handler, not a server action, because an action
 * cannot answer with a file — so it re-checks everything an action would: same origin, a
 * live session, the export capability. The service adds the rest (fresh re-authentication,
 * a written reason, the day's quota, the audit row before the records leave) and returns
 * the records once; the spreadsheet and the PDF are laid out here from exactly those.
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
  const form = await request.formData();
  const returnPath = safeReturnPath(String(form.get("back") ?? ""));
  const context = await requireStaff(returnPath);
  const base = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin;
  // Back to the same view of the list, not the unfiltered one.
  const returnQuery = safeReturnQuery(String(form.get("back_query") ?? ""));
  const back = (outcome: string) => {
    const target = new URL(returnPath, base);
    for (const [key, value] of returnQuery) target.searchParams.append(key, value);
    target.searchParams.set("export", outcome);
    return NextResponse.redirect(target, 303);
  };
  if (!hasCapability(context, "crm:export")) return back("forbidden");

  const kind = String(form.get("kind") ?? "");
  const format = String(form.get("format") ?? "csv");
  const reason = String(form.get("reason") ?? "")
    .slice(0, 400)
    .trim();
  if (!(EXPORT_KINDS as readonly string[]).includes(kind)) return back("failed");
  if (!(EXPORT_FORMATS as readonly string[]).includes(format)) return back("failed");
  if (reason.length < 8) return back("reason");
  // The prospects export is of a view: the list's own filters travel with the request.
  const view = kind === "prospects" ? exportView(String(form.get("view_json") ?? "")) : {};
  if (view === null) return back("failed");
  // The columns, when the person chose them rather than taking every one.
  const columns =
    String(form.get("column_mode") ?? "") === "chosen"
      ? exportColumns(form.getAll("columns"))
      : undefined;
  if (columns !== undefined && columns.length === 0) return back("columns");

  let exported: ExportFile;
  try {
    // "This view": the records the page showed, in its order, read here as the person
    // asking with the page's own code — so the file is what was on the screen.
    const ids =
      String(form.get("scope") ?? "") === "view" && isViewExportKind(kind)
        ? await viewRecordIds(context.token, kind, returnQuery)
        : undefined;
    if (ids !== undefined && ids.length === 0) return back("empty");
    exported = await createExport(
      context.token,
      kind as ExportKind,
      reason,
      format as ExportFormat,
      {
        view,
        ...(ids ? { ids } : {}),
        ...(columns ? { columns } : {}),
      },
    );
  } catch (error) {
    if (error instanceof HqApiRequestError) {
      if (error.details["sudo_required"] === true) return back("sudo");
      if (error.details["reason"] === "export-quota") return back("quota");
      if (error.status === 403) return back("forbidden");
      if (typeof error.details["columns"] === "string") return back("columns");
      if (typeof error.details["ids"] === "string") return back("empty");
      return back("failed");
    }
    if (error instanceof HqApiUnavailableError) return back("failed");
    throw error;
  }

  // Records from the demo service on this machine leave marked as demo data, in the file's
  // name and title, so an export cannot pass for the company's own.
  if (onDemoService()) {
    exported = {
      ...exported,
      title: `${exported.title} (demo data)`,
      filename: exported.filename.replace(/(\.[a-z0-9]+)?$/i, "-demo-data$1"),
    };
  }

  if (exported.format === "csv") {
    // A byte-order mark first, so a spreadsheet opened on any machine reads ₹, é and — as written.
    return attachment(`﻿${exported.csv}`, "csv", exported.filename);
  }

  // The letterhead: the company's particulars as the service worked them out. The records
  // have already left the service by now, so a failed read prints the brand alone rather
  // than throwing the export away.
  let letterhead: Letterhead = FALLBACK_LETTERHEAD;
  try {
    letterhead = (await readCompany(context.token)).letterhead;
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const exportedBy = context.me.staff.display_name || context.me.staff.email;
  if (exported.format === "xlsx") {
    const workbook = buildWorkbook({
      title: exported.title,
      columns: exported.columns,
      rows: exported.table,
      author: exportedBy,
      company: letterhead.name,
      generatedAt: exported.generated_at,
      about: [
        ["Records", `${exported.title}: ${exported.rows.toLocaleString("en-GB")}`],
        [
          "Which records",
          exported.scope === "view"
            ? "The view on screen when it was exported, in its order"
            : "Every record in the list",
        ],
        ["Exported by", exportedBy],
        ["Exported", stampLabel(exported.generated_at)],
        ["What it is for", reason],
        ["Company", [letterhead.name, letterhead.numbers].filter(Boolean).join(" · ")],
        ["Times", "Dates and times are UTC."],
        ["Record", "Made in Quantify Terminal HQ and recorded in its audit log."],
      ],
    });
    return attachment(Buffer.from(workbook), "xlsx", exported.filename);
  }
  const pdf = await buildTablePdf(
    {
      title: exported.title,
      columns: exported.columns,
      rows: exported.table,
      letterhead,
      exportedBy,
      generatedAt: exported.generated_at,
      reason,
    },
    await loadDocumentAssets(),
  );
  return attachment(Buffer.from(pdf), "pdf", exported.filename);
}
