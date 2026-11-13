import { Readable } from "node:stream";

import { NextResponse, type NextRequest } from "next/server";

import { hasCapability, requireStaff } from "@/lib/access/core";
import { noteBackupDownloaded } from "@/lib/data/api/backup";
import { openBuild, startBuild, waitForBuild } from "@/lib/data/api/builds";
import { contentDisposition } from "@/lib/data/disposition";
import { staffOf } from "@/lib/data/gate";
import { isDataError } from "@/lib/data/read";
import { DataRequestError, dataConfigured } from "@/lib/data/socket";
import { SameOriginActionError, requireSameOriginServerAction } from "@/lib/security/action-origin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * "Download a backup" on the overview: one zip of every file and version, Data's records
 * and Mail merge's lists and logs, never the provider key. A form post, not a link, so it
 * re-checks what an action would (this portal, signed in, may send mail). The service
 * makes it; a backup still being made after 55 s sends the browser to the downloads page.
 * Once the bytes start on their way, the overview says when it was last downloaded.
 */
export async function POST(request: NextRequest): Promise<Response> {
  if (!dataConfigured()) return new NextResponse("Not found", { status: 404 });
  if (request.headers.get("sec-fetch-site") === "cross-site")
    return new NextResponse("Not from here.", { status: 403 });
  try {
    await requireSameOriginServerAction();
  } catch (error) {
    if (error instanceof SameOriginActionError)
      return new NextResponse("Not from here.", { status: 403 });
    throw error;
  }
  const context = await requireStaff("/data");
  if (!hasCapability(context, "mail:send")) return new NextResponse("Forbidden", { status: 403 });
  const by = staffOf(context);
  try {
    const started = await startBuild({ kind: "backup", by });
    const build = await waitForBuild(started.build.build_id);
    if (build.state === "building") {
      const base = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin;
      return NextResponse.redirect(new URL(`/data/downloads/${build.build_id}`, base), 303);
    }
    if (build.state === "failed")
      return new NextResponse(build.detail || "The backup could not be made.", { status: 409 });
    const file = await openBuild(build.build_id, request.signal);
    try {
      await noteBackupDownloaded(build.build_id, by);
    } catch (error) {
      // The bytes still go: only the overview's line waits for the next one.
      if (!isDataError(error)) throw error;
    }
    return new NextResponse(Readable.toWeb(file.body) as ReadableStream<Uint8Array>, {
      status: 200,
      headers: {
        "content-type": "application/zip",
        "content-length": String(file.size),
        "content-disposition": contentDisposition(
          "attachment",
          file.name || build.name || "HQ Data backup.zip",
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
