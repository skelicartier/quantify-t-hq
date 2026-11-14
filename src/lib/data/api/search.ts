import "server-only";

import { z } from "zod";

import { dataAsk, ok } from "@/lib/data/socket";

/**
 * Data's search (raise spec §7.5): All leads, Investors, Files, notes, the FAQ, decisions
 * and Contacts, every word having to match, grouped by kind in one fixed order with exact
 * counts. Only for people allowed Data: the caller checks before asking.
 */

export const DATA_SEARCH_KIND_KEYS = [
  "lead",
  "investor",
  "file",
  "note",
  "faq",
  "decision",
  "contact",
] as const;
export const dataSearchKindSchema = z.enum(DATA_SEARCH_KIND_KEYS);
export type DataSearchKindKey = z.infer<typeof dataSearchKindSchema>;

export const dataSearchHitSchema = z.object({
  kind: dataSearchKindSchema,
  id: z.string(),
  title: z.string(),
  subtitle: z.string(),
  snippet: z.string(),
  href: z.string(),
});
export type DataSearchHitView = z.infer<typeof dataSearchHitSchema>;

export const dataSearchSchema = ok.extend({
  query: z.string(),
  total: z.number(),
  groups: z.array(
    z.object({
      kind: dataSearchKindSchema,
      label: z.string(),
      count: z.number(),
      hits: z.array(dataSearchHitSchema),
    }),
  ),
});
export type DataSearchPage = z.infer<typeof dataSearchSchema>;

export function searchData(
  q: string,
  options: { kind?: DataSearchKindKey | undefined; limit?: number | undefined } = {},
) {
  const params = new URLSearchParams({ q: q.slice(0, 200) });
  if (options.kind) params.set("kind", options.kind);
  if (options.limit) params.set("limit", String(options.limit));
  return dataAsk(dataSearchSchema, "GET", `/data/search?${params.toString()}`);
}
