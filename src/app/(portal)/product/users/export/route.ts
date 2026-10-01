import { NextResponse } from "next/server";

import {
  ADMIN_USER_STATUS_FILTERS,
  AccountApiRequestError,
  fetchAccountApiAdminUsers,
  type AccountApiAdminUserFilters,
} from "@/lib/product/account-api";
import { getAdminUsersExportAccess } from "@/lib/product/access";
import { usersCsv, usersCsvFilename, type AdminUserSummary } from "@/lib/product/users-csv";

export const dynamic = "force-dynamic";

/** Pages of 100 up to this many rows; a larger tenancy gets the first 5,000 and a header note. */
const EXPORT_ROW_LIMIT = 5_000;
const PAGE_SIZE = 100;

function filtersFrom(url: URL): AccountApiAdminUserFilters {
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 120);
  const rawStatus = (url.searchParams.get("status") ?? "").trim().toLowerCase();
  const status = (ADMIN_USER_STATUS_FILTERS as readonly string[]).includes(rawStatus)
    ? (rawStatus as AccountApiAdminUserFilters["status"])
    : undefined;
  return { ...(q ? { q } : {}), ...(status ? { status } : {}) };
}

/**
 * GET /product/users/export?q=&status= — the directory as CSV, for the same people who can
 * read it in HQ. Same gates as the page (signed in, administration capability,
 * verified second factor for privileged roles); the file streams straight back and is
 * never stored.
 */
export async function GET(request: Request): Promise<Response> {
  const access = await getAdminUsersExportAccess();
  if (access.status === "unauthenticated") {
    return NextResponse.redirect(new URL("/login?next=%2Fproduct%2Fusers", request.url), 303);
  }
  if (access.status !== "authorized") {
    return NextResponse.json({ error: access.status }, { status: 403 });
  }

  const filters = filtersFrom(new URL(request.url));
  const rows: AdminUserSummary[] = [];
  let offset = 0;
  let truncated = false;
  try {
    for (;;) {
      const page = await fetchAccountApiAdminUsers(access.accessToken, {
        limit: PAGE_SIZE,
        offset,
        ...filters,
      });
      rows.push(...page.users);
      if (!page.pagination.has_more || page.pagination.next_offset === null) break;
      if (rows.length >= EXPORT_ROW_LIMIT) {
        truncated = true;
        break;
      }
      offset = page.pagination.next_offset;
    }
  } catch (error) {
    if (error instanceof AccountApiRequestError && error.status === 401) {
      return NextResponse.redirect(new URL("/login?next=%2Fproduct%2Fusers", request.url), 303);
    }
    return NextResponse.json({ error: "directory_unavailable" }, { status: 503 });
  }

  const body = usersCsv(rows.slice(0, EXPORT_ROW_LIMIT));
  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${usersCsvFilename(new Date())}"`,
      "cache-control": "no-store",
      "x-export-rows": String(Math.min(rows.length, EXPORT_ROW_LIMIT)),
      ...(truncated ? { "x-export-truncated": "true" } : {}),
    },
  });
}
