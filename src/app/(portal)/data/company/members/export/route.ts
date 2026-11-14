import { Readable } from "node:stream";

import { NextResponse, type NextRequest } from "next/server";

import { hasCapability, requireStaff } from "@/lib/access/core";
import { openBuild, startBuild, waitForBuild } from "@/lib/data/api/builds";
import { contentDisposition } from "@/lib/data/disposition";
import { staffOf } from "@/lib/data/gate";
import { isDataError } from "@/lib/data/read";
import { DataRequestError, dataConfigured } from "@/lib/data/socket";

export const dynamic = "force-dynamic";

/**
 * The register of members as a CSV with a byte-order mark, one line per entry (a member
 * with none has one line): the sheet to hand the CS. The same gate as Members.
 */
export async function GET(request: NextRequest): Promise<Response> {
  if (!dataConfigured()) return new NextResponse("Not found", { status: 404 });
  if (request.headers.get("sec-fetch-site") === "cross-site")
    return new NextResponse("Not from here.", { status: 403 });
  const context = await requireStaff("/data/company/members");
  if (!hasCapability(context, "mail:send")) return new NextResponse("Forbidden", { status: 403 });
  try {
    const started = await startBuild({ kind: "members_csv", by: staffOf(context) });
    const build = await waitForBuild(started.build.build_id);
    if (build.state === "building") {
      const base = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin;
      return NextResponse.redirect(new URL(`/data/downloads/${build.build_id}`, base), 303);
    }
    if (build.state === "failed")
      return new NextResponse(build.detail || "The download could not be made.", { status: 409 });
    const file = await openBuild(build.build_id, request.signal);
    return new NextResponse(Readable.toWeb(file.body) as ReadableStream<Uint8Array>, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-length": String(file.size),
        "content-disposition": contentDisposition(
          "attachment",
          file.name || build.name || "Register of members.csv",
        ),
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
