import "server-only";

import { Readable } from "node:stream";

import { NextResponse, type NextRequest } from "next/server";

import { hasCapability, requireStaff } from "@/lib/access/core";
import { openBuild, startBuild, waitForBuild } from "@/lib/data/api/builds";
import { contentDisposition } from "@/lib/data/disposition";
import { staffOf } from "@/lib/data/gate";
import { isDataError } from "@/lib/data/read";
import { DataRequestError, dataConfigured } from "@/lib/data/socket";

/**
 * One of Money's CSVs for the CA (ws-notes/duties/spec.md §8.4), made as a build in the
 * service and streamed back with a byte-order mark: the purchase register, vendors, the
 * ledger map, export invoices. The same gate as Money's pages; a slow build sends the
 * browser to the downloads page.
 */
export async function moneyCsv(
  request: NextRequest,
  input: { kind: string; path: string; fallback: string; fy?: boolean },
): Promise<Response> {
  if (!dataConfigured()) return new NextResponse("Not found", { status: 404 });
  if (request.headers.get("sec-fetch-site") === "cross-site")
    return new NextResponse("Not from here.", { status: 403 });
  const context = await requireStaff(input.path);
  if (!hasCapability(context, "mail:send")) return new NextResponse("Forbidden", { status: 403 });
  const asked = request.nextUrl.searchParams.get("fy") ?? "";
  const fy = input.fy && /^\d{4}-\d{2}$/.test(asked) ? asked : "";
  try {
    const started = await startBuild({
      kind: input.kind,
      by: staffOf(context),
      ...(fy ? { fy } : {}),
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
          file.name || build.name || input.fallback,
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
