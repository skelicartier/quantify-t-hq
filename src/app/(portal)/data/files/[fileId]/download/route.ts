import { Readable } from "node:stream";

import { NextResponse, type NextRequest } from "next/server";

import { hasCapability, requireStaff } from "@/lib/access/core";
import { openFileBytes } from "@/lib/data/api/files";
import { contentDisposition, servedAs } from "@/lib/data/disposition";
import { staffOf } from "@/lib/data/gate";
import { isDataError } from "@/lib/data/read";
import { DataRequestError, dataConfigured } from "@/lib/data/socket";

export const dynamic = "force-dynamic";

const ID = /^[A-Za-z0-9-]{1,64}$/;

/**
 * A file's bytes as a download, always: the current version, or `?version=n`. Each one is
 * written on the file's activity as "Downloaded", except the share sheet's own fetch
 * (`?quiet=1`), which is written down as a share instead.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> },
): Promise<Response> {
  if (!dataConfigured()) return new NextResponse("Not found", { status: 404 });
  if (request.headers.get("sec-fetch-site") === "cross-site")
    return new NextResponse("Not from here.", { status: 403 });
  const { fileId } = await params;
  if (!ID.test(fileId)) return new NextResponse("Not found", { status: 404 });
  const context = await requireStaff(`/data/files/${fileId}`);
  if (!hasCapability(context, "mail:send")) return new NextResponse("Forbidden", { status: 403 });
  const search = request.nextUrl.searchParams;
  const version = Number.parseInt(search.get("version") ?? "", 10);
  const quiet = search.get("quiet") === "1";
  try {
    const file = await openFileBytes(
      fileId,
      {
        ...(Number.isSafeInteger(version) && version > 0 ? { version } : {}),
        ...(quiet ? {} : { log: "download" as const, by: staffOf(context) }),
      },
      request.signal,
    );
    const served = servedAs(file.type, "attachment");
    return new NextResponse(Readable.toWeb(file.body) as ReadableStream<Uint8Array>, {
      status: 200,
      headers: {
        "content-type": served.type,
        "content-length": String(file.size),
        "content-disposition": contentDisposition("attachment", file.name),
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
