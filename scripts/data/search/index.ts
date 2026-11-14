/**
 * Data's search (raise spec §7.5): one question asked of every searchable module
 * (`search:<name>`) at request time, every word having to match somewhere in a record, as
 * Mail merge's find does. The answer is grouped by kind in one fixed order (leads,
 * investors, files, notes, the FAQ, decisions, contacts, then the company batch's meetings,
 * agreements and members), each group with its exact count
 * and its best few hits. A module that is not loaded is skipped; one that fails is logged
 * and skipped, so search never fails for one part of Data.
 */

import { Refused } from "../../mail-merge/engine";
import type { DataCore } from "../core";
import { LIMITS, clean, wholeNumber } from "../guard";
import { findTerms, matchesTerms } from "../../../src/lib/merge/find";
import { DATA_SEARCH_KINDS } from "../../../src/lib/data/labels";
import {
  SEARCH_SOURCES,
  searchService,
  type DataSearchHit,
  type DataSearchKind,
  type SearchSource,
  type SearchSourceName,
} from "../raise-contracts";

export const KIND_ORDER: readonly DataSearchKind[] = [
  "lead",
  "investor",
  "file",
  "note",
  "faq",
  "decision",
  "contact",
  "meeting",
  "agreement",
  "member",
];
const KINDS: ReadonlySet<string> = new Set(KIND_ORDER);
export const OVERVIEW_LIMIT = 5;
export const MAX_LIMIT = 50;

/** Which kinds each source answers for, for the stand-ins. */
const SOURCE_KINDS: Record<SearchSourceName, readonly DataSearchKind[]> = {
  leads: ["lead"],
  investors: ["investor"],
  files: ["file"],
  notes: ["note", "faq", "decision"],
  contacts: ["contact"],
  meetings: ["meeting"],
  agreements: ["agreement"],
  members: ["member"],
};

const isKind = (value: unknown): value is DataSearchKind =>
  typeof value === "string" && KINDS.has(value);

/** One hit as a source gave it, checked; anything malformed is left out. */
function hitOf(value: unknown, kind: DataSearchKind): DataSearchHit | null {
  const hit = value as Partial<DataSearchHit> | null;
  if (!hit || typeof hit !== "object") return null;
  if (typeof hit.id !== "string" || typeof hit.title !== "string") return null;
  if (typeof hit.href !== "string" || !/^\/data(?:[/#?]|$)/.test(hit.href)) return null;
  return {
    kind,
    id: hit.id.slice(0, 200),
    title: hit.title.slice(0, 300),
    subtitle: typeof hit.subtitle === "string" ? hit.subtitle.slice(0, 300) : "",
    snippet: typeof hit.snippet === "string" ? hit.snippet.slice(0, 400) : "",
    href: hit.href.slice(0, 400),
  };
}

export type SearchGroup = {
  kind: DataSearchKind;
  label: string;
  count: number;
  hits: DataSearchHit[];
};

export function register(core: DataCore): void {
  core.route("GET", "/data/search", (ctx) => {
    const query = clean(ctx.query.get("q"), LIMITS.search);
    const askedKind = clean(ctx.query.get("kind"), 20);
    const kind = isKind(askedKind) ? askedKind : null;
    const fallback = kind ? MAX_LIMIT : OVERVIEW_LIMIT;
    const limit = Math.min(MAX_LIMIT, Math.max(1, wholeNumber(ctx.query.get("limit"), fallback)));
    if (query.length < 2) return { query, total: 0, groups: [] };
    const terms = findTerms(query);
    const merged = new Map<DataSearchKind, { count: number; hits: DataSearchHit[] }>();
    for (const name of SEARCH_SOURCES) {
      const source = core.need<SearchSource>(searchService(name));
      if (!source) continue;
      let answer: unknown;
      try {
        answer = source.search({ query, terms, kind, limit });
      } catch (error) {
        core.log(
          `a search source failed: ${name}, ${error instanceof Error ? error.name : "error"}`,
        );
        continue;
      }
      for (const raw of Array.isArray(answer) ? answer : []) {
        const group = raw as { kind?: unknown; count?: unknown; hits?: unknown } | null;
        if (!group || !isKind(group.kind) || (kind && group.kind !== kind)) continue;
        const hits = (Array.isArray(group.hits) ? group.hits : [])
          .map((hit) => hitOf(hit, group.kind as DataSearchKind))
          .filter((hit): hit is DataSearchHit => hit !== null);
        const count = Math.max(
          hits.length,
          typeof group.count === "number" && Number.isFinite(group.count)
            ? Math.trunc(group.count)
            : 0,
        );
        const known = merged.get(group.kind) ?? { count: 0, hits: [] };
        known.count += count;
        known.hits.push(...hits);
        merged.set(group.kind, known);
      }
    }
    const groups: SearchGroup[] = KIND_ORDER.flatMap((each) => {
      const found = merged.get(each);
      return found && found.count > 0
        ? [
            {
              kind: each,
              label: DATA_SEARCH_KINDS[each],
              count: found.count,
              hits: found.hits.slice(0, limit),
            },
          ]
        : [];
    });
    return { query, total: groups.reduce((sum, group) => sum + group.count, 0), groups };
  });

  // ---------------------------------------------------------------- test routes

  if (core.testRoutes) {
    // Stand-ins for the sources other units add (raise spec §7.7); never over a real one.
    const fakes = new Map<string, SearchSource>();
    core.route("POST", "/data/_test/search/source", (ctx) => {
      ctx.staff();
      const name = clean(ctx.body.name, 40) as SearchSourceName;
      if (!SEARCH_SOURCES.includes(name))
        throw new Refused(400, "invalid", "That is not a search source.");
      const service = searchService(name);
      const current = core.need<SearchSource>(service);
      const mine = fakes.get(name);
      if (ctx.body.on === false) {
        if (mine && current === mine) core.provide(service, null);
        fakes.delete(name);
        return { installed: false };
      }
      if (current && current !== mine) return { installed: false, real: true };
      const throws = ctx.body.throws === true;
      // The hits as given, or one invented hit of each kind the source answers for.
      const given = Array.isArray(ctx.body.groups)
        ? (ctx.body.groups as unknown[])
        : SOURCE_KINDS[name].map((each) => ({
            kind: each,
            hits: [
              {
                id: `walk-stand-in-${each}`,
                title: `Walk stand-in ${each}`,
                subtitle: "Walk Stand-in Fund",
                snippet: "",
                href:
                  each === "investor"
                    ? "/data/investors"
                    : each === "file"
                      ? "/data/files"
                      : "/data",
              },
            ],
          }));
      const groups = given.flatMap((raw) => {
        const group = raw as { kind?: unknown; hits?: unknown } | null;
        if (!group || !isKind(group.kind)) return [];
        const kind = group.kind;
        const hits = (Array.isArray(group.hits) ? group.hits : [])
          .map((hit) => hitOf(hit, kind))
          .filter((hit): hit is DataSearchHit => hit !== null);
        return [{ kind, hits }];
      });
      const fake: SearchSource = {
        search: ({ terms, kind, limit }) => {
          if (throws) throw new Error("a stand-in that fails");
          return groups
            .filter((group) => !kind || group.kind === kind)
            .map((group) => {
              const found = group.hits.filter((hit) =>
                matchesTerms([hit.title, hit.subtitle, hit.snippet], terms),
              );
              return { kind: group.kind, count: found.length, hits: found.slice(0, limit) };
            })
            .filter((group) => group.count > 0);
        },
      };
      fakes.set(name, fake);
      core.provide(service, fake);
      return { installed: true, groups: groups.length };
    });
  }
}
