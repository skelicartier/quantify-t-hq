import { NextResponse, type NextRequest } from "next/server";

import { HqApiRequestError } from "@/lib/api/core";
import { unsubscribe } from "@/lib/api/mail";

export const dynamic = "force-dynamic";

/**
 * RFC 8058 one-click unsubscribe: the mailbox provider POSTs
 * `List-Unsubscribe=One-Click` here when a person presses its Unsubscribe button. No
 * page, no confirmation, no cookie — the stop is recorded and an empty 200 goes back.
 * A GET is a person or a link scanner: it is sent to the page, which changes nothing
 * until its button is pressed.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  try {
    await unsubscribe(token, "one_click");
  } catch (error) {
    // A token that names nothing gets the same empty answer: no oracle for guessing.
    if (error instanceof HqApiRequestError && error.status === 404) {
      return new NextResponse(null, { status: 200 });
    }
    // Anything else (the service asleep, a network fault): tell the provider to retry.
    return new NextResponse(null, { status: 503, headers: { "Retry-After": "60" } });
  }
  return new NextResponse(null, { status: 200 });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  return NextResponse.redirect(
    new URL(`/u/${encodeURIComponent(token)}`, request.nextUrl.origin),
    303,
  );
}
