"use server";

import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readRecent, readSearch, type SearchKind } from "@/lib/api/search";
import { searchData, type DataSearchKindKey } from "@/lib/data/api/search";
import { isDataError } from "@/lib/data/read";
import { dataConfigured } from "@/lib/data/socket";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";

/** A hit from Data on this Mac (raise spec §7.5): All leads, Investors, Files, notes… */
export type DataHitKind = `data_${DataSearchKindKey}`;

export type SearchHit = {
  kind: SearchKind | DataHitKind;
  id: string;
  title: string;
  subtitle: string;
  href: string;
};

export type ViewedHit = SearchHit & { viewedAt: string | null };

const PER_KIND = 5;

/** Data's hits, first and in Data's group order: only for people allowed Data, where it is set up. */
async function dataHits(allowed: boolean, query: string): Promise<SearchHit[]> {
  if (!allowed) return [];
  try {
    const page = await searchData(query, { limit: PER_KIND });
    return page.groups.flatMap((group) =>
      group.hits.map((hit) => ({
        kind: `data_${hit.kind}` as const,
        id: hit.id,
        title: hit.title,
        subtitle: [hit.subtitle, hit.snippet].filter(Boolean).join(" · "),
        href: hit.href,
      })),
    );
  } catch (error) {
    if (isDataError(error)) return [];
    throw error;
  }
}

async function serviceHits(token: string, query: string): Promise<SearchHit[]> {
  try {
    const page = await readSearch(token, query, { limit: PER_KIND });
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

/**
 * The palette's record search: one call to the service's search, which reaches every
 * kind the caller's role reads — names, notes, tasks, meetings, money and help — five of
 * each. For someone allowed Data on this Mac, Data's own records come first, five of each
 * kind, asked at the same time. A failed read gives no hits rather than an error: the
 * palette is a shortcut, and a shortcut that errors is slower than the navigation it
 * replaces.
 */
export async function searchRecordsAction(rawQuery: string): Promise<SearchHit[]> {
  await requireSameOriginServerAction();
  const context = await requireStaff("/home");
  const query = rawQuery.trim().replace(/\s+/g, " ").slice(0, 120);
  if (query.length < 2) return [];
  const allowed = hasCapability(context, "mail:send") && dataConfigured();
  const [data, service] = await Promise.allSettled([
    dataHits(allowed, query),
    serviceHits(context.token, query),
  ]);
  if (service.status === "rejected") throw service.reason;
  if (data.status === "rejected") throw data.reason;
  return [...data.value, ...service.value];
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
