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
 * A year's holidays as a CSV with a byte-order mark (duties spec §7.4). A build, as every CSV
 * in Data is; the same gate as the Holidays page.
 */
export async function GET(request: NextRequest): Promise<Response> {
  if (!dataConfigured()) return new NextResponse("Not found", { status: 404 });
  if (request.headers.get("sec-fetch-site") === "cross-site")
    return new NextResponse("Not from here.", { status: 403 });
  const context = await requireStaff("/data/registers/holidays");
  if (!hasCapability(context, "mail:send")) return new NextResponse("Forbidden", { status: 403 });
  const asked = Number(request.nextUrl.searchParams.get("year") ?? "");
  const year = Number.isInteger(asked) && asked >= 2020 && asked <= 2040 ? asked : undefined;
  try {
    const started = await startBuild({
      kind: "holidays_csv",
      by: staffOf(context),
      ...(year ? { year } : {}),
    });
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
          file.name || build.name || "Holidays.csv",
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
