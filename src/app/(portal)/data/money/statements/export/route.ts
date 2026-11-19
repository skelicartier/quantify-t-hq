import { NextResponse, type NextRequest } from "next/server";

import { hasCapability, requireStaff } from "@/lib/access/core";
import { exportLines } from "@/lib/data/api/statements";
import { contentDisposition } from "@/lib/data/disposition";
import { isDataOwner } from "@/lib/data/owner";
import { isDataError } from "@/lib/data/read";
import { DataRequestError, dataConfigured } from "@/lib/data/socket";

export const dynamic = "force-dynamic";

const BOM = "﻿";

/**
 * "Download the lines (CSV)": a month's statement lines with their category, ledger and
 * match, for the CA (ws-notes/duties/spec.md §9.5). For the Owner only: anyone else gets
 * 403 before anything is asked.
 */
export async function GET(request: NextRequest): Promise<Response> {
  if (!dataConfigured()) return new NextResponse("Not found", { status: 404 });
  if (request.headers.get("sec-fetch-site") === "cross-site")
    return new NextResponse("Not from here.", { status: 403 });
  const context = await requireStaff("/data/money/statements");
  if (!hasCapability(context, "mail:send") || !isDataOwner(context))
    return new NextResponse("Forbidden", { status: 403 });
  const month = request.nextUrl.searchParams.get("month") ?? "";
  const account = request.nextUrl.searchParams.get("account") ?? "";
  try {
    const made = await exportLines(true, month, account);
    const body = new TextEncoder().encode(`${BOM}${made.csv}`);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-length": String(body.length),
        "content-disposition": contentDisposition("attachment", made.name),
        "cache-control": "private, no-store",
        "cross-origin-resource-policy": "same-origin",
      },
    });
  } catch (error) {
    if (error instanceof DataRequestError && error.status !== 503)
      return new NextResponse(error.message, { status: error.status });
    if (isDataError(error))
      return new NextResponse("The service on this computer is not running.", { status: 503 });
    throw error;
  }
}
