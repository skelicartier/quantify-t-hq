import { NextResponse } from "next/server";

import { AccountApiRequestError, fetchAccountApiAdminUsers } from "@/lib/product/account-api";
import { getAdminRecipientSearchAccess } from "@/lib/product/access";

export const dynamic = "force-dynamic";

/** One page is plenty for a picker; a longer list means the search is too broad. */
const RESULT_LIMIT = 20;

const NO_STORE = { "cache-control": "no-store" } as const;

function json(body: unknown, status = 200): Response {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

/**
 * GET /admin/users/search?q= — the directory reduced to what a recipient picker needs
 * (id, email, name, active flag), for the people who can queue notifications and email.
 * Same gates as the email page: signed in, administration capability, verified second
 * factor for privileged roles, and the notifications capability. Nothing is stored and
 * nothing is cached.
 */
export async function GET(request: Request): Promise<Response> {
  const access = await getAdminRecipientSearchAccess();
  if (access.status === "unauthenticated") return json({ error: "unauthenticated" }, 401);
  if (access.status !== "authorized") return json({ error: access.status }, 403);

  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 120);
  try {
    const page = await fetchAccountApiAdminUsers(access.accessToken, {
      limit: RESULT_LIMIT,
      offset: 0,
      ...(q ? { q } : {}),
    });
    return json({
      accounts: page.users.map(({ user }) => ({
        id: user.user_id,
        email: user.email,
        name: user.display_name || `${user.first_name} ${user.last_name}`.trim(),
        active: user.is_active,
      })),
      has_more: page.pagination.has_more,
    });
  } catch (error) {
    if (error instanceof AccountApiRequestError && error.status === 401) {
      return json({ error: "unauthenticated" }, 401);
    }
    return json({ error: "directory_unavailable" }, 503);
  }
}
