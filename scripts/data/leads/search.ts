/**
 * All leads in Data's search (raise spec §7.5): the index's own find, every word in the
 * address, name, firm, title, place or batch, as the All leads page finds them. A hit
 * names the lead, says who they are and where they stand, and links to their page. The
 * count is exact; the hits are the best few, people whose name or address starts with
 * what was typed first.
 */

import { matchesTerms } from "../../../src/lib/merge/find";
import { LEAD_STATUSES } from "../../../src/lib/data/labels";
import type { DataCore } from "../core";
import { searchService, type DataSearchHit, type SearchSource } from "../raise-contracts";
import type { Lead } from "./build";
import type { LeadsModule } from "./index";

/**
 * How well a lead fits: 0 the address, its part before the "@", or the name exactly; 1 one
 * of them starts with the first word; 2 the rest.
 */
function rank(lead: Lead, query: string, first: string): number {
  const name = lead.name.toLowerCase();
  const local = lead.email.slice(0, lead.email.indexOf("@"));
  if (lead.email === query || local === query || name === query) return 0;
  if (local.startsWith(first) || name.startsWith(first)) return 1;
  return 2;
}

export function leadsSearch(leads: LeadsModule): SearchSource {
  return {
    search: ({ query, terms, kind, limit }) => {
      if ((kind !== null && kind !== "lead") || terms.length === 0) return [];
      const wanted = query.trim().toLowerCase();
      const first = terms[0] ?? "";
      const index = leads.index;
      const found: { lead: Lead; rank: number }[] = [];
      for (const lead of index.all) {
        if (!matchesTerms([lead.search], terms)) continue;
        found.push({ lead, rank: rank(lead, wanted, first) });
      }
      // Within a rank, by name then address: the same order every time.
      found.sort(
        (a, b) =>
          a.rank - b.rank ||
          a.lead.sort_name.localeCompare(b.lead.sort_name) ||
          a.lead.email.localeCompare(b.lead.email),
      );
      const context = leads.context();
      const hits: DataSearchHit[] = found.slice(0, Math.max(0, limit)).map(({ lead }) => {
        index.status(lead, context);
        return {
          kind: "lead",
          id: lead.lead_id,
          title: lead.name || lead.email,
          subtitle: [lead.fields.title, lead.fields.company, LEAD_STATUSES[lead.status].label]
            .filter(Boolean)
            .join(" · "),
          snippet: lead.email,
          href: `/data/leads/${lead.lead_id}`,
        };
      });
      return found.length ? [{ kind: "lead", count: found.length, hits }] : [];
    },
  };
}

/** Offered as `search:leads`; asked at request time, so the index is always the current one. */
export function registerLeadsSearch(core: DataCore, leads: LeadsModule): void {
  core.provide(searchService("leads"), leadsSearch(leads));
}
