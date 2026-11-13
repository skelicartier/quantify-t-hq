import { Readable } from "node:stream";

import { NextResponse, type NextRequest } from "next/server";

import { hasCapability, requireStaff } from "@/lib/access/core";
import { openBuild, startBuild, waitForBuild } from "@/lib/data/api/builds";
import { staffOf } from "@/lib/data/gate";
import { isDataError } from "@/lib/data/read";
import { DataRequestError, dataConfigured } from "@/lib/data/socket";

export const dynamic = "force-dynamic";

const ROUTE_ID = /^[A-Za-z0-9-]{1,64}$/;

/** RFC 6266 and 5987: an ASCII name for every browser, then the exact one. */
function contentDisposition(name: string): string {
  const exact =
    name
      .replace(/\p{Cc}/gu, "")
      .replace(/[\\/]/g, "_")
      .trim() || "download.csv";
  const ascii =
    exact
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .replace(/[^A-Za-z0-9._ ()-]/g, "_") || "download.csv";
  const encoded = encodeURIComponent(exact).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/**
 * All leads' downloads: "This view" (every lead the view matches, not the page), "The old
 * tracker" (every lead, in the founder's old columns and words), and a source's rows left
 * out. The service makes the file and writes the export ledger; this streams it. No
 * service, 404; a cross-site fetch or the wrong role, 403; the service down, 503; a file
 * not ready in 55 s, the downloads page.
 */
export async function GET(request: NextRequest): Promise<Response> {
  if (!dataConfigured()) return new NextResponse("Not found", { status: 404 });
  if (request.headers.get("sec-fetch-site") === "cross-site")
    return new NextResponse("Not from here.", { status: 403 });
  const context = await requireStaff("/data/leads");
  if (!hasCapability(context, "mail:send")) return new NextResponse("Forbidden", { status: 403 });
  const params = new URLSearchParams(request.nextUrl.searchParams);
  const view = params.get("view") ?? "this";
  params.delete("view");
  params.delete("offset");
  const source = params.get("source") ?? "";
  if (view === "left_out" && !ROUTE_ID.test(source))
    return new NextResponse("Not found", { status: 404 });
  try {
    const started = await startBuild({
      kind:
        view === "tracker" ? "leads_tracker" : view === "left_out" ? "leads_left_out" : "leads_csv",
      query: view === "this" ? params.toString().slice(0, 2_000) : "",
      by: staffOf(context),
      ...(view === "left_out" ? { source_id: source } : {}),
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
        "content-disposition": contentDisposition(file.name || build.name || "All leads.csv"),
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
