/**
 * Query-string helpers for the paginated admin pages.
 *
 * Every page that paginates used to carry its own copy of these; the exact parameter
 * order in `buildPageHref` is part of the UI contract (tests assert the hrefs), so it
 * lives in one place.
 */

export type SearchParamValue = string | string[] | undefined;
export type SearchParams = Record<string, SearchParamValue>;

export function firstSearchValue(value: SearchParamValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function boundedInteger(value: string | undefined, fallback: number, max: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, max);
}

export type PaginationBounds = {
  defaultLimit: number;
  maxLimit: number;
  maxOffset: number;
};

export const ADMIN_PAGINATION_BOUNDS: PaginationBounds = {
  defaultLimit: 50,
  maxLimit: 100,
  maxOffset: 100_000,
};

export function parsePagination(
  params: SearchParams,
  bounds: PaginationBounds = ADMIN_PAGINATION_BOUNDS,
): { limit: number; offset: number } {
  return {
    limit: Math.max(
      1,
      boundedInteger(firstSearchValue(params.limit), bounds.defaultLimit, bounds.maxLimit),
    ),
    offset: boundedInteger(firstSearchValue(params.offset), 0, bounds.maxOffset),
  };
}

/** `offset` first, then `limit`, then filters — the order the pagination links promise. */
export function buildPageHref(
  path: string,
  offset: number,
  limit: number,
  filters: Readonly<Record<string, string | undefined>> = {},
): string {
  const params = new URLSearchParams({
    offset: String(Math.max(0, offset)),
    limit: String(limit),
  });
  for (const [name, value] of Object.entries(filters)) {
    const cleaned = String(value ?? "").trim();
    if (cleaned) params.set(name, cleaned);
  }
  return `${path}?${params.toString()}`;
}

export type UserDirectoryFilters = {
  q?: string | undefined;
  status?: "active" | "inactive" | undefined;
};

/** The directory's search box and status filter; anything unrecognised is dropped. */
export function parseUserFilters(params: SearchParams): UserDirectoryFilters {
  const q = (firstSearchValue(params.q) ?? "").trim().slice(0, 120);
  const rawStatus = (firstSearchValue(params.status) ?? "").trim().toLowerCase();
  const status = rawStatus === "active" || rawStatus === "inactive" ? rawStatus : undefined;
  return { ...(q ? { q } : {}), ...(status ? { status } : {}) };
}
