import { NextResponse, type NextRequest } from "next/server";

import { hasCapability, requireStaff } from "@/lib/access/core";
import { readCalendarItems } from "@/lib/data/api/calendar";
import { ICS_NAME, toIcs } from "@/lib/data/ics";
import { isDataError } from "@/lib/data/read";
import { DataRequestError, dataConfigured } from "@/lib/data/socket";

export const dynamic = "force-dynamic";

/**
 * Today's calendar as a file, for a phone or another computer: the same events the feed
 * gives, as a snapshot that does not update. The same gate as the Calendar page: no
 * service, 404; a cross-site fetch or the wrong role, 403; the service down, 503.
 */
export async function GET(request: NextRequest): Promise<Response> {
  if (!dataConfigured()) return new NextResponse("Not found", { status: 404 });
  if (request.headers.get("sec-fetch-site") === "cross-site")
    return new NextResponse("Not from here.", { status: 403 });
  const context = await requireStaff("/data/calendar");
  if (!hasCapability(context, "mail:send")) return new NextResponse("Forbidden", { status: 403 });
  try {
    const feed = await readCalendarItems();
    const origin = (process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin).replace(/\/+$/, "");
    const text = toIcs({
      items: feed.items,
      today: feed.today,
      detail: feed.detail,
      origin,
      stamp: new Date().toISOString(),
      name: ICS_NAME,
    });
    const name = `HQ dates ${feed.today}.ics`;
    return new NextResponse(text, {
      status: 200,
      headers: {
        "content-type": "text/calendar; charset=utf-8",
        "content-disposition": `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
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
