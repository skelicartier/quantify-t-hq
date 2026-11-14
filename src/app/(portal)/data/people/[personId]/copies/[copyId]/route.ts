import { NextResponse, type NextRequest } from "next/server";

import { hasCapability, requireStaff } from "@/lib/access/core";
import { readCopy } from "@/lib/data/api/people";
import { contentDisposition, servedAs } from "@/lib/data/disposition";
import { DATA_OWNER_LINE, isDataOwner } from "@/lib/data/owner";
import { isDataError } from "@/lib/data/read";
import { DataRequestError, dataConfigured } from "@/lib/data/socket";

export const dynamic = "force-dynamic";

const ID = /^[A-Za-z0-9-]{1,64}$/;

/**
 * A signed copy from the people ledger (a letter, an agreement, a certificate), always as a
 * download. The ledger keeps its copies itself, never in Files, and only the Owner may have
 * them: anyone else is refused with the ledger's own line before the service is asked.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ personId: string; copyId: string }> },
): Promise<Response> {
  if (!dataConfigured()) return new NextResponse("Not found", { status: 404 });
  if (request.headers.get("sec-fetch-site") === "cross-site")
    return new NextResponse("Not from here.", { status: 403 });
  const { personId, copyId } = await params;
  if (!ID.test(personId) || !ID.test(copyId)) return new NextResponse("Not found", { status: 404 });
  const context = await requireStaff(`/data/people/${personId}`);
  if (!hasCapability(context, "mail:send") || !isDataOwner(context))
    return new NextResponse(DATA_OWNER_LINE, { status: 403 });
  try {
    const { copy, type, content } = await readCopy(personId, copyId);
    const bytes = Buffer.from(content, "base64");
    const served = servedAs(type, "attachment");
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "content-type": served.type,
        "content-length": String(bytes.length),
        "content-disposition": contentDisposition("attachment", copy.name),
        "cache-control": "private, no-store",
        "cross-origin-resource-policy": "same-origin",
      },
    });
  } catch (error) {
    if (error instanceof DataRequestError && error.status === 404)
      return new NextResponse("Not found", { status: 404 });
    if (error instanceof DataRequestError && error.status !== 503)
      return new NextResponse(error.message, { status: error.status });
    if (isDataError(error))
      return new NextResponse("The service on this computer is not running.", { status: 503 });
    throw error;
  }
}
