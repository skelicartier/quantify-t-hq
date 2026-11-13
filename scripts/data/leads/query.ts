/**
 * Asking the leads index: a search (Mail merge's find: every word must match), the status
 * and reply filters, the facet filters, a sort, and a page of 100. The status counts, the
 * reply counts, the facets and the whole book's figures all come from one pass: each
 * dimension's counts are of the leads every *other* filter lets through, so a status link
 * or a select says how many it would show.
 */

import { findTerms, matchesTerms } from "../../../src/lib/merge/find";
import { LEAD_STATUS_ORDER, OUTCOME_ORDER } from "../../../src/lib/data/labels";
import { clean, wholeNumber } from "../guard";
import {
  REPLY_STATUSES,
  SORT_KEYS,
  type Lead,
  type LeadsIndex,
  type SortKey,
  type StatusContext,
} from "./build";
import type { LeadStatus, Outcome } from "./types";

export const PAGE = 100;
export const MAX_OFFSET = 200_000;
/** The facet value for "nothing given". */
export const NONE = "~";

export type LeadQuery = {
  q: string;
  terms: string[];
  /** "" (all), "replied", or one status. */
  status: string;
  /** With status "replied": one of the reply statuses. */
  reply: string;
  firm_type: string;
  country: string;
  email_kind: string;
  batch: string;
  source: string;
  tag: string;
  domain: string;
  sort: SortKey;
  offset: number;
};

const STATUS_VALUES = new Set<string>(["replied", ...LEAD_STATUS_ORDER]);

export function parseLeadQuery(params: URLSearchParams): LeadQuery {
  const q = clean(params.get("q"), 200);
  const status = clean(params.get("status"), 20);
  const reply = clean(params.get("reply"), 20);
  const sort = clean(params.get("sort"), 20) as SortKey;
  return {
    q,
    terms: findTerms(q),
    status: STATUS_VALUES.has(status) ? status : "",
    reply: REPLY_STATUSES.has(reply as LeadStatus) ? reply : "",
    firm_type: clean(params.get("firm_type"), 120),
    country: clean(params.get("country"), 120),
    email_kind: clean(params.get("email_kind"), 40),
    batch: clean(params.get("batch"), 64),
    source: clean(params.get("source"), 64),
    tag: clean(params.get("tag"), 40).toLowerCase(),
    domain: clean(params.get("domain"), 254).toLowerCase(),
    sort: SORT_KEYS.includes(sort) ? sort : "written",
    offset: Math.min(MAX_OFFSET, Math.max(0, wholeNumber(params.get("offset"), 0))),
  };
}

/** The query back as a search string: what a build or a Mail merge list is made from. */
export function queryString(query: LeadQuery): string {
  const params = new URLSearchParams();
  for (const key of [
    "q",
    "status",
    "reply",
    "firm_type",
    "country",
    "email_kind",
    "batch",
    "source",
    "tag",
    "domain",
  ] as const)
    if (query[key]) params.set(key, query[key]);
  if (query.sort !== "written") params.set("sort", query.sort);
  return params.toString();
}

export type FacetEntry = { value: string; label: string; count: number };
export type Facets = {
  firm_type: FacetEntry[];
  country: FacetEntry[];
  email_kind: FacetEntry[];
  batch: FacetEntry[];
  source: FacetEntry[];
  tag: FacetEntry[];
};

export type Book = {
  leads: number;
  written: number;
  not_sent: number;
  replied: number;
  held_back: number;
  stopped: number;
};

export type QueryResult = {
  /** Every match, in the sort's order (the page is a slice of it). */
  matches: Lead[];
  total: number;
  all: number;
  counts: { status: Record<LeadStatus | "replied", number>; reply: Record<Outcome, number> };
  book: Book;
  facets: Facets;
};

const EMAIL_KIND_LABELS: Record<string, string> = {
  named: "Named",
  role: "Shared",
  "personal-domain": "Free mail",
};

/** The dimensions a lead is filtered on, other than the search and the domain. */
const DIMS = ["status", "firm_type", "country", "email_kind", "batch", "source", "tag"] as const;
type Dim = (typeof DIMS)[number];

type Tally = Map<string, number>;

function bump(tally: Tally, key: string): void {
  tally.set(key, (tally.get(key) ?? 0) + 1);
}

export function runQuery(
  index: LeadsIndex,
  query: LeadQuery,
  context: StatusContext,
  labels: { source: (id: string) => string },
): QueryResult {
  const ordered = index.sorted(query.sort, context);
  // A batch holds who is on it now; a list deleted in Mail merge, who was on it when it went.
  const inBatch = (member: Lead["lists"][number]): boolean =>
    !member.gone || index.goneLists.has(member.list_id);
  const active: Dim[] = DIMS.filter((dim) =>
    dim === "status" ? Boolean(query.status) : Boolean(query[dim]),
  );
  const statusCounts = Object.fromEntries(
    [...LEAD_STATUS_ORDER, "replied"].map((key) => [key, 0]),
  ) as Record<LeadStatus | "replied", number>;
  const replyCounts = Object.fromEntries(OUTCOME_ORDER.map((key) => [key, 0])) as Record<
    Outcome,
    number
  >;
  const book: Book = { leads: 0, written: 0, not_sent: 0, replied: 0, held_back: 0, stopped: 0 };
  const tallies: Record<Exclude<Dim, "status">, Tally> = {
    firm_type: new Map(),
    country: new Map(),
    email_kind: new Map(),
    batch: new Map(),
    source: new Map(),
    tag: new Map(),
  };
  const tagLabels = new Map<string, string>();
  const matches: Lead[] = [];

  const matchesDim = (lead: Lead, dim: Dim): boolean => {
    switch (dim) {
      case "status": {
        const fits =
          query.status === "replied"
            ? REPLY_STATUSES.has(lead.status)
            : lead.status === query.status;
        return fits && (!query.reply || lead.status === query.reply);
      }
      case "firm_type":
        return (lead.fields.firm_type || NONE) === query.firm_type;
      case "country":
        return (lead.fields.country || NONE) === query.country;
      case "email_kind":
        return (lead.fields.email_kind || NONE) === query.email_kind;
      case "batch":
        return lead.lists.some((member) => member.list_id === query.batch && inBatch(member));
      case "source":
        return lead.files.some((ref) => ref.source_id === query.source);
      case "tag":
        return lead.tags.some((tag) => tag.toLowerCase() === query.tag);
    }
  };

  const countDim = (lead: Lead, dim: Dim): void => {
    switch (dim) {
      case "status":
        statusCounts[lead.status] += 1;
        if (REPLY_STATUSES.has(lead.status)) {
          statusCounts.replied += 1;
          const outcome = context.marks.get(lead.email)?.outcome;
          if (outcome) replyCounts[outcome] += 1;
        }
        return;
      case "firm_type":
        bump(tallies.firm_type, lead.fields.firm_type || NONE);
        return;
      case "country":
        bump(tallies.country, lead.fields.country || NONE);
        return;
      case "email_kind":
        bump(tallies.email_kind, lead.fields.email_kind || NONE);
        return;
      case "batch":
        for (const member of lead.lists) if (inBatch(member)) bump(tallies.batch, member.list_id);
        return;
      case "source":
        for (const ref of lead.files) bump(tallies.source, ref.source_id);
        return;
      case "tag":
        for (const tag of lead.tags) {
          const key = tag.toLowerCase();
          if (!tagLabels.has(key)) tagLabels.set(key, tag);
          bump(tallies.tag, key);
        }
        return;
    }
  };

  for (const lead of ordered) {
    index.status(lead, context);
    book.leads += 1;
    if (lead.times > 0) book.written += 1;
    if (lead.status === "not_sent") book.not_sent += 1;
    else if (lead.status === "held_back") book.held_back += 1;
    else if (lead.status === "stopped") book.stopped += 1;
    else if (REPLY_STATUSES.has(lead.status)) book.replied += 1;

    if (query.domain && lead.domain !== query.domain) continue;
    if (query.terms.length && !matchesTerms([lead.search], query.terms)) continue;
    let failed: Dim | null = null;
    let fails = 0;
    for (const dim of active) {
      if (matchesDim(lead, dim)) continue;
      fails += 1;
      failed = dim;
      if (fails > 1) break;
    }
    if (fails > 1) continue;
    if (fails === 1) {
      countDim(lead, failed!);
      continue;
    }
    matches.push(lead);
    for (const dim of DIMS) countDim(lead, dim);
  }

  const entries = (dim: Exclude<Dim, "status">, label: (value: string) => string) =>
    [...tallies[dim].entries()]
      .map(([value, count]) => ({ value, label: label(value), count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  return {
    matches,
    total: matches.length,
    all: index.size,
    counts: { status: statusCounts, reply: replyCounts },
    book,
    facets: {
      firm_type: entries("firm_type", (value) => (value === NONE ? "Not given" : value)),
      country: entries("country", (value) => (value === NONE ? "Not given" : value)),
      email_kind: entries("email_kind", (value) =>
        value === NONE ? "Not judged" : (EMAIL_KIND_LABELS[value] ?? value),
      ),
      batch: entries("batch", (value) => {
        const name = index.listNames.get(value);
        if (!name) return "A list no longer there";
        return index.goneLists.has(value) ? `${name} (gone)` : name;
      }),
      source: entries("source", (value) => labels.source(value)),
      tag: entries("tag", (value) => tagLabels.get(value) ?? value),
    },
  };
}
