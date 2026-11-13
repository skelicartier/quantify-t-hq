import { Readable } from "node:stream";

import { NextResponse, type NextRequest } from "next/server";

import { hasCapability, requireStaff } from "@/lib/access/core";
import { noteBackupDownloaded } from "@/lib/data/api/backup";
import { openBuild, waitForBuild } from "@/lib/data/api/builds";
import { isDataError } from "@/lib/data/read";
import { staffOf } from "@/lib/data/gate";
import { DataRequestError, dataConfigured } from "@/lib/data/socket";

export const dynamic = "force-dynamic";

const ID = /^[A-Za-z0-9-]{1,64}$/;

/** RFC 6266 and 5987: an ASCII name for every browser, then the exact one. Header values stay ASCII. */
function contentDisposition(name: string): string {
  const exact =
    name
      .replace(/\p{Cc}/gu, "")
      .replace(/[\\/]/g, "_")
      .trim() || "download";
  const ascii =
    exact
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .replace(/[^A-Za-z0-9._ ()-]/g, "_") || "download";
  const encoded = encodeURIComponent(exact).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/**
 * The bytes of a finished download, streamed from the service. The same gate as the page:
 * no service, 404; a cross-site fetch or the wrong role, 403; the service down, 503. A
 * build still being made after the wait sends the browser back to the downloads page.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ buildId: string }> },
): Promise<Response> {
  if (!dataConfigured()) return new NextResponse("Not found", { status: 404 });
  if (request.headers.get("sec-fetch-site") === "cross-site")
    return new NextResponse("Not from here.", { status: 403 });
  const { buildId } = await params;
  if (!ID.test(buildId)) return new NextResponse("Not found", { status: 404 });
  const context = await requireStaff(`/data/downloads/${buildId}`);
  if (!hasCapability(context, "mail:send")) return new NextResponse("Forbidden", { status: 403 });
  try {
    const build = await waitForBuild(buildId);
    if (build.state === "building") {
      const base = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin;
      return NextResponse.redirect(new URL(`/data/downloads/${buildId}`, base), 303);
    }
    if (build.state === "failed")
      return new NextResponse(build.detail || "The download could not be made.", { status: 409 });
    const file = await openBuild(buildId, request.signal);
    // A backup that took longer than the wait is downloaded here: the overview says so (Unit 5).
    if (build.kind === "backup")
      await noteBackupDownloaded(buildId, staffOf(context)).catch(() => undefined);
    return new NextResponse(Readable.toWeb(file.body) as ReadableStream<Uint8Array>, {
      status: 200,
      headers: {
        "content-type": file.type,
        "content-length": String(file.size),
        "content-disposition": contentDisposition(file.name || build.name || "download"),
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
