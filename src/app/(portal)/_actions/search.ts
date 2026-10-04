"use server";

import { requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readRecent, readSearch, type SearchKind } from "@/lib/api/search";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";

export type SearchHit = {
  kind: SearchKind;
  id: string;
  title: string;
  subtitle: string;
  href: string;
};

export type ViewedHit = SearchHit & { viewedAt: string | null };

const PER_KIND = 5;

/**
 * The palette's record search: one call to the service's search, which reaches every
 * kind the caller's role reads — names, notes, tasks, meetings, money and help — five of
 * each. A failed read gives no hits rather than an error: the palette is a shortcut, and
 * a shortcut that errors is slower than the navigation it replaces.
 */
export async function searchRecordsAction(rawQuery: string): Promise<SearchHit[]> {
  await requireSameOriginServerAction();
  const context = await requireStaff("/home");
  const query = rawQuery.trim().replace(/\s+/g, " ").slice(0, 120);
  if (query.length < 2) return [];
  try {
    const page = await readSearch(context.token, query, { limit: PER_KIND });
    return page.groups.flatMap((group) =>
      group.results.map((hit) => ({
        kind: hit.kind,
        id: hit.id,
        title: hit.title,
        subtitle: [hit.archived ? "Archived" : "", hit.subtitle, hit.snippet]
          .filter(Boolean)
          .join(" · "),
        href: hit.href,
      })),
    );
  } catch (error) {
    if (error instanceof HqApiRequestError || error instanceof HqApiUnavailableError) return [];
    throw error;
  }
}

/** What this person opened lately, for the palette before they type. */
export async function recentlyViewedAction(): Promise<ViewedHit[]> {
  await requireSameOriginServerAction();
  const context = await requireStaff("/home");
  try {
    const page = await readRecent(context.token);
    return page.recent.map((row) => ({
      kind: row.kind,
      id: row.id,
      title: row.title,
      subtitle: row.label,
      href: row.href,
      viewedAt: row.viewed_at,
    }));
  } catch (error) {
    if (error instanceof HqApiRequestError || error instanceof HqApiUnavailableError) return [];
    throw error;
  }
}
