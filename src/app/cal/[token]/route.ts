import { NextResponse, type NextRequest } from "next/server";

import { readCalendarFeed } from "@/lib/data/api/calendar";
import { ICS_NAME, toIcs } from "@/lib/data/ics";
import { isDataError } from "@/lib/data/read";
import { DataRequestError, dataConfigured } from "@/lib/data/socket";

export const dynamic = "force-dynamic";

const TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** Nothing here, said the same way for every wrong address: no hint of what would work. */
const notFound = () =>
  new NextResponse(null, { status: 404, headers: { "cache-control": "no-store" } });

/**
 * The private calendar feed of Data on this Mac (raise spec §7.3.2). Calendar cannot send
 * the portal's session, so this is the one Data address with no sign-in: the token in the
 * path is the key, and the service compares only its SHA-256. Where Data is not set up
 * (the deployed portal) it does not exist. When the service is down the calendar is asked
 * to come back later and keeps the copy it has.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  if (!dataConfigured()) return notFound();
  const { token } = await params;
  if (!TOKEN.test(token)) return notFound();
  let feed: Awaited<ReturnType<typeof readCalendarFeed>>;
  try {
    feed = await readCalendarFeed(token);
  } catch (error) {
    if (error instanceof DataRequestError && error.status === 404) return notFound();
    if (error instanceof DataRequestError || isDataError(error))
      return new NextResponse(null, {
        status: 503,
        headers: { "retry-after": "300", "cache-control": "no-store" },
      });
    throw error;
  }
  const origin = (process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin).replace(/\/+$/, "");
  const text = toIcs({
    items: feed.items,
    today: feed.today,
    detail: feed.detail,
    origin,
    stamp: new Date().toISOString(),
    name: ICS_NAME,
  });
  return new NextResponse(text, {
    status: 200,
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "cache-control": "private, no-store",
      "x-robots-tag": "noindex",
      "content-disposition": 'inline; filename="hq.ics"',
    },
  });
}
