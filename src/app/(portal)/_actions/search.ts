"use server";

import { hasCapability, requireStaff } from "@/lib/access/core";
import * as crmApi from "@/lib/api/crm";
import * as dealsApi from "@/lib/api/deals";
import * as ticketsApi from "@/lib/api/tickets";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";

export type SearchHit = {
  kind: "company" | "person" | "lead" | "deal" | "ticket";
  id: string;
  title: string;
  subtitle: string;
  href: string;
};

const PER_KIND = 5;

function contains(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle);
}

/**
 * The palette's record search: one call, every kind the caller may read, five of each.
 * Reads that fail are left out rather than failing the whole search — the palette is a
 * shortcut, and a shortcut that errors is slower than the navigation it replaces.
 */
export async function searchRecordsAction(rawQuery: string): Promise<SearchHit[]> {
  await requireSameOriginServerAction();
  const context = await requireStaff("/home");
  const query = rawQuery.trim().slice(0, 80);
  if (query.length < 2) return [];
  const needle = query.toLowerCase();
  const hits: SearchHit[] = [];
  const settle = async (work: Promise<void>) => {
    try {
      await work;
    } catch {
      // Left out on purpose; see above.
    }
  };
  const jobs: Promise<void>[] = [];
  if (hasCapability(context, "crm:read")) {
    jobs.push(
      settle(
        crmApi.readCompanies(context.token, query).then((page) => {
          for (const row of page.companies.slice(0, PER_KIND)) {
            hits.push({
              kind: "company",
              id: row.company_id,
              title: row.name,
              subtitle: [row.domain, row.lifecycle].filter(Boolean).join(" · "),
              href: `/companies/${row.company_id}`,
            });
          }
        }),
      ),
      settle(
        crmApi.readPeople(context.token, query).then((page) => {
          for (const row of page.people.slice(0, PER_KIND)) {
            hits.push({
              kind: "person",
              id: row.person_id,
              title: row.full_name || row.email,
              subtitle: [row.email, row.company_name].filter(Boolean).join(" · "),
              href: `/people/${row.person_id}`,
            });
          }
        }),
      ),
      settle(
        // One page of matches: the lead table holds a researched list as well as the inbox.
        crmApi.readLeads(context.token, { q: query, limit: PER_KIND }).then((page) => {
          for (const row of page.leads.slice(0, PER_KIND)) {
            hits.push({
              kind: "lead",
              id: row.lead_id,
              title: row.full_name || row.email || "Unnamed lead",
              subtitle: [row.company_name, row.email].filter(Boolean).join(" · "),
              href: `/leads/${row.lead_id}`,
            });
          }
        }),
      ),
    );
  }
  if (hasCapability(context, "deals:read")) {
    jobs.push(
      settle(
        dealsApi.readDealsBoard(context.token, "open").then((board) => {
          const matching = board.columns
            .flatMap((column) => column.deals)
            .filter((deal) => contains(`${deal.name} ${deal.company_name}`, needle))
            .slice(0, PER_KIND);
          for (const deal of matching) {
            hits.push({
              kind: "deal",
              id: deal.deal_id,
              title: deal.company_name || deal.name,
              subtitle: [deal.name, deal.stage_label].filter(Boolean).join(" · "),
              href: `/deals/${deal.deal_id}`,
            });
          }
        }),
      ),
    );
  }
  if (hasCapability(context, "tickets:read")) {
    jobs.push(
      settle(
        ticketsApi.readQueue(context.token, { q: query }).then((queue) => {
          for (const ticket of queue.tickets.slice(0, PER_KIND)) {
            hits.push({
              kind: "ticket",
              id: ticket.id,
              title: ticket.subject,
              subtitle: [ticket.contact_email, ticket.status].filter(Boolean).join(" · "),
              href: `/support/${ticket.id}`,
            });
          }
        }),
      ),
    );
  }
  await Promise.all(jobs);
  return hits;
}
