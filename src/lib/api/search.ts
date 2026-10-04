import "server-only";

import { z } from "zod";

import { fetchHqJson } from "@/lib/api/core";

const okEnvelope = z.object({ ok: z.literal(true) });

export const SEARCH_KINDS = [
  "company",
  "person",
  "lead",
  "deal",
  "ticket",
  "meeting",
  "task",
  "note",
  "contract",
  "invoice",
  "quote",
  "article",
] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];

const hitSchema = z.object({
  kind: z.enum(SEARCH_KINDS),
  id: z.string(),
  title: z.string(),
  subtitle: z.string(),
  href: z.string(),
  /** The text around the match, for a note or a body; "" when the title matched. */
  snippet: z.string(),
  archived: z.boolean(),
  at: z.string().nullable(),
});
export type SearchResult = z.infer<typeof hitSchema>;

const searchSchema = okEnvelope.extend({
  q: z.string(),
  kind: z.string(),
  /** Only the kinds this person's role reads, in the order they are shown. */
  groups: z.array(
    z.object({
      kind: z.enum(SEARCH_KINDS),
      label: z.string(),
      count: z.number(),
      /** The kind had more matches than are counted. */
      more: z.boolean(),
      results: z.array(hitSchema),
    }),
  ),
  total: z.number(),
});
export type SearchPage = z.infer<typeof searchSchema>;

export function readSearch(
  token: string,
  q: string,
  options: { kind?: SearchKind | ""; limit?: number } = {},
) {
  const query: Record<string, string> = { q };
  if (options.kind) query.kind = options.kind;
  if (options.limit) query.limit = String(options.limit);
  return fetchHqJson("hq/search", searchSchema, { token, query });
}

const recentSchema = okEnvelope.extend({
  recent: z.array(
    z.object({
      kind: z.enum(SEARCH_KINDS),
      id: z.string(),
      title: z.string(),
      href: z.string(),
      label: z.string(),
      viewed_at: z.string().nullable(),
    }),
  ),
  days: z.number(),
});
export type RecentlyViewed = z.infer<typeof recentSchema>;

/** The records this person opened lately, newest first, from their own read log. */
export function readRecent(token: string) {
  return fetchHqJson("hq/me/recent", recentSchema, { token });
}
