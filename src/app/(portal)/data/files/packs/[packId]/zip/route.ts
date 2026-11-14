import { Readable } from "node:stream";

import { NextResponse, type NextRequest } from "next/server";

import { hasCapability, requireStaff } from "@/lib/access/core";
import { openBuild, startBuild, waitForBuild } from "@/lib/data/api/builds";
import { contentDisposition } from "@/lib/data/disposition";
import { staffOf } from "@/lib/data/gate";
import { isDataError } from "@/lib/data/read";
import { DataRequestError, dataConfigured } from "@/lib/data/socket";

export const dynamic = "force-dynamic";

const ID = /^[A-Za-z0-9-]{1,64}$/;

/**
 * "Download the zip": the pack's files numbered in order, with `00 Index.txt` first and
 * `manifest-sha256.txt` last. Made by the service while this waits (up to 55 s); a zip
 * still being made after that sends the browser to its downloads page. Nothing is sent
 * anywhere: he sends the zip from his own mailbox.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ packId: string }> },
): Promise<Response> {
  if (!dataConfigured()) return new NextResponse("Not found", { status: 404 });
  if (request.headers.get("sec-fetch-site") === "cross-site")
    return new NextResponse("Not from here.", { status: 403 });
  const { packId } = await params;
  if (!ID.test(packId)) return new NextResponse("Not found", { status: 404 });
  const context = await requireStaff(`/data/files/packs/${packId}`);
  if (!hasCapability(context, "mail:send")) return new NextResponse("Forbidden", { status: 403 });
  try {
    const started = await startBuild({ kind: "pack_zip", pack_id: packId, by: staffOf(context) });
    const build = await waitForBuild(started.build.build_id);
    if (build.state === "building") {
      const base = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin;
      return NextResponse.redirect(new URL(`/data/downloads/${build.build_id}`, base), 303);
    }
    if (build.state === "failed")
      return new NextResponse(build.detail || "The zip could not be made.", { status: 409 });
    const file = await openBuild(build.build_id, request.signal);
    return new NextResponse(Readable.toWeb(file.body) as ReadableStream<Uint8Array>, {
      status: 200,
      headers: {
        "content-type": "application/zip",
        "content-length": String(file.size),
        "content-disposition": contentDisposition(
          "attachment",
          file.name || build.name || "Data room.zip",
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
