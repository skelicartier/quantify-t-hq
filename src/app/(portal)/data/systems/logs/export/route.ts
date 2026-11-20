import { NextResponse, type NextRequest } from "next/server";

import { hasCapability, requireStaff } from "@/lib/access/core";
import { exportLogs } from "@/lib/data/api/logs";
import { contentDisposition } from "@/lib/data/disposition";
import { isDataError } from "@/lib/data/read";
import { DataRequestError, dataConfigured } from "@/lib/data/socket";

export const dynamic = "force-dynamic";

/**
 * The logs and time register as a CSV with a byte-order mark (ws-notes/security/spec.md §7.4). The
 * same gate as Logs and time. Nothing in it comes from the people ledger.
 */
export async function GET(request: NextRequest): Promise<Response> {
  if (!dataConfigured()) return new NextResponse("Not found", { status: 404 });
  if (request.headers.get("sec-fetch-site") === "cross-site")
    return new NextResponse("Not from here.", { status: 403 });
  const context = await requireStaff("/data/systems/logs");
  if (!hasCapability(context, "mail:send")) return new NextResponse("Forbidden", { status: 403 });
  try {
    const made = await exportLogs();
    const body = new TextEncoder().encode(made.csv);
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
