import { NextResponse, type NextRequest } from "next/server";

import { hasCapability, requireStaff } from "@/lib/access/core";
import { readStatementFile } from "@/lib/data/api/statements";
import { contentDisposition } from "@/lib/data/disposition";
import { isDataOwner } from "@/lib/data/owner";
import { isDataError } from "@/lib/data/read";
import { DataRequestError, dataConfigured } from "@/lib/data/socket";

export const dynamic = "force-dynamic";

/**
 * A statement's own file, or the bank's PDF kept beside it (ws-notes/duties/spec.md §9.5),
 * always as a download. For the Owner only: anyone else gets 403 before anything is asked.
 * The service answers the bytes as base64, as the people ledger's copies are answered, since
 * the host streams only Files' and builds' bytes.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ statementId: string }> },
): Promise<Response> {
  if (!dataConfigured()) return new NextResponse("Not found", { status: 404 });
  if (request.headers.get("sec-fetch-site") === "cross-site")
    return new NextResponse("Not from here.", { status: 403 });
  const { statementId } = await params;
  const context = await requireStaff(`/data/money/statements`);
  if (!hasCapability(context, "mail:send") || !isDataOwner(context))
    return new NextResponse("Forbidden", { status: 403 });
  const which = request.nextUrl.searchParams.get("which") === "copy" ? "copy" : "file";
  try {
    const file = await readStatementFile(true, statementId, which);
    const bytes = Buffer.from(file.content, "base64");
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "content-type": file.type,
        "content-length": String(bytes.length),
        "content-disposition": contentDisposition("attachment", file.name),
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
