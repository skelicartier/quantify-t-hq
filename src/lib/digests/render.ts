import "server-only";

import { readCompanies, readLeads } from "@/lib/api/crm";
import { readDealsBoard } from "@/lib/api/deals";
import { directoryOrNull, nameFor } from "@/lib/api/staff";
import { LEAD_STAGE_LABELS, LIFECYCLE_LABELS } from "@/lib/crm/vocabulary";
import { formatMrr, formatWait } from "@/lib/format";
import {
  companyFilterFields,
  dealFilterFields,
  leadFilterFields,
  readCompanyField,
  readDealField,
  readLeadField,
} from "@/lib/lists/definitions";
import { applyFilters, parseFilters } from "@/lib/lists/filters";

export type DigestTable = {
  columns: string[];
  rows: { cells: string[]; path: string }[];
  total: number;
};

export const DIGEST_LISTS = ["companies", "leads", "deals"] as const;
const MAX_ROWS = 50;

/**
 * A saved view's rows as the reader behind `token` would see them on the list page: the
 * same read, the same filters, the same money gate. What leaves here is cells and paths,
 * never markup — the service escapes and lays them out.
 */
export async function renderDigest(
  token: string,
  listKey: string,
  query: string,
): Promise<DigestTable> {
  const params = new URLSearchParams(query);
  const filters = params.getAll("f");
  const names = await directoryOrNull(token);
  if (listKey === "companies") {
    const page = await readCompanies(token, params.get("q") ?? "");
    const lifecycle = params.get("lifecycle") ?? "";
    const matched = applyFilters(
      page.companies.filter((row) => !lifecycle || row.lifecycle === lifecycle),
      parseFilters(filters, companyFilterFields(page)),
      (row, field) => readCompanyField(row, field, names),
    );
    return {
      columns: ["Company", "Lifecycle", "Owner", "Open deals"],
      rows: matched.slice(0, MAX_ROWS).map((row) => ({
        cells: [
          row.name,
          LIFECYCLE_LABELS[row.lifecycle] ?? row.lifecycle,
          row.owner_staff_id ? nameFor(names, row.owner_staff_id) : "Unowned",
          String(row.open_deals),
        ],
        path: `/companies/${row.company_id}`,
      })),
      total: matched.length,
    };
  }
  if (listKey === "leads") {
    // The Leads list is the people who wrote in; prospects are their own list.
    const page = await readLeads(token, {
      origin: "inbound",
      stage: params.get("stage") ?? "",
      source: params.get("source") ?? "",
      q: params.get("q") ?? "",
    });
    const matched = applyFilters(
      page.leads,
      parseFilters(filters, leadFilterFields(page, [])),
      (lead, field) => readLeadField(lead, field, names),
    );
    return {
      columns: ["Lead", "Company", "Stage", "Waiting"],
      rows: matched.slice(0, MAX_ROWS).map((lead) => ({
        cells: [
          lead.full_name || lead.email || "Someone",
          lead.company_name || "—",
          LEAD_STAGE_LABELS[lead.stage] ?? lead.stage,
          lead.waiting_minutes === null ? "—" : formatWait(lead.waiting_minutes),
        ],
        path: `/leads/${lead.lead_id}`,
      })),
      total: matched.length,
    };
  }
  if (listKey === "deals") {
    const status = params.get("status") ?? "open";
    const board = await readDealsBoard(token, status);
    const labels = new Map(board.columns.map((column) => [column.key, column.label]));
    const matched = applyFilters(
      board.columns.flatMap((column) => column.deals),
      parseFilters(filters, dealFilterFields(board)),
      (deal, field) => readDealField(deal, field, names),
    );
    return {
      columns: ["Deal", "Company", "Stage", "Monthly value", "Next step due"],
      rows: matched.slice(0, MAX_ROWS).map((deal) => ({
        cells: [
          deal.name,
          deal.company_name || "—",
          labels.get(deal.stage_key) ?? deal.stage_key,
          deal.mrr_amount === null ? "—" : formatMrr(deal.mrr_amount, deal.currency),
          deal.next_step_due ?? "—",
        ],
        path: `/deals/${deal.deal_id}`,
      })),
      total: matched.length,
    };
  }
  throw new Error(`no digest for the list ${listKey}`);
}
