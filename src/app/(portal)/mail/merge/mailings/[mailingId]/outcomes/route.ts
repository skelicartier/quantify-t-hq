import { NextResponse, type NextRequest } from "next/server";

import { toCsv } from "@/lib/crm/csv-download";
import { hasCapability, requireStaff } from "@/lib/access/core";
import {
  MergeRequestError,
  MergeUnavailableError,
  mergeConfigured,
  readMergeOutcomes,
} from "@/lib/merge/api";

export const dynamic = "force-dynamic";

/** Who was written to and what happened, as a file to keep. Same rule as the screen. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ mailingId: string }> },
): Promise<NextResponse> {
  if (!mergeConfigured()) return new NextResponse("Not found", { status: 404 });
  const { mailingId } = await params;
  const context = await requireStaff(`/mail/merge/mailings/${mailingId}`);
  if (!hasCapability(context, "mail:send")) return new NextResponse("Forbidden", { status: 403 });
  try {
    const answer = await readMergeOutcomes(mailingId);
    const csv = toCsv(
      ["email", "name", "list", "state", "reason", "at"],
      answer.rows.map((row) => [row.email, row.name, row.list, row.state, row.reason, row.at]),
    );
    const name = answer.name.replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 60) || "mailing";
    return new NextResponse(`﻿${csv}`, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${name}-outcomes.csv"`,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof MergeRequestError && error.status === 404)
      return new NextResponse("Not found", { status: 404 });
    if (error instanceof MergeRequestError || error instanceof MergeUnavailableError)
      return new NextResponse("The sender is not running.", { status: 503 });
    throw error;
  }
}
