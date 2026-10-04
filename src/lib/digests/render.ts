import "server-only";

import { readCompanies, readLeads } from "@/lib/api/crm";
import { readDealsBoard } from "@/lib/api/deals";
import { directoryOrNull, nameFor } from "@/lib/api/staff";
import { LEAD_STAGE_LABELS, LIFECYCLE_LABELS } from "@/lib/crm/vocabulary";
import { readMe } from "@/lib/api/auth";
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
import {
  formatReportValue,
  loadReport,
  parseDefinitionQuery,
  recordsHref,
  reportKindOfListKey,
  runReport,
  type ReportKind,
} from "@/lib/reports/builder";

export type DigestTable = {
  columns: string[];
  rows: { cells: string[]; path: string }[];
  total: number;
};

export const DIGEST_LISTS = [
  "companies",
  "leads",
  "deals",
  "report-companies",
  "report-leads",
  "report-deals",
  "report-tickets",
  "report-tasks",
] as const;
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
  const kind = reportKindOfListKey(listKey);
  if (kind) return renderReportDigest(token, kind, query);
  throw new Error(`no digest for the list ${listKey}`);
}

/**
 * A saved report, mailed: each group's figure with a link to its records, run as the
 * recipient — their reads, and money only if their role reads it.
 */
async function renderReportDigest(
  token: string,
  kind: ReportKind,
  query: string,
): Promise<DigestTable> {
  const definition = parseDefinitionQuery(query, kind);
  const [me, loaded] = await Promise.all([
    readMe(token),
    loadReport(token, definition, new Date().toISOString().slice(0, 10)),
  ]);
  const result = runReport(loaded, definition, me.capabilities.includes("revenue:read"));
  const counting = result.unit === "count";
  const format = (value: number | null) => formatReportValue(result, value);
  // The notes come first: the service keeps the first fifty rows, and what the figure must
  // be read with is never the part to lose. A time series keeps its latest months.
  const notes = [
    ...(result.refused ? [result.refused] : []),
    ...result.leftOut.map((line) => `Left out: ${line.count} ${line.why}`),
    ...result.notes,
  ];
  const room = MAX_ROWS - notes.length;
  const groups = result.groupLabel
    ? result.time
      ? result.groups.slice(-room)
      : result.groups.slice(0, room)
    : [{ key: "", label: "All matching records", value: result.total, count: result.matched }];
  return {
    columns: [result.groupLabel || "Report", result.measureLabel, ...(counting ? [] : ["Records"])],
    rows: [
      ...notes.map((note) => ({
        cells: [note, "", ...(counting ? [] : [""])],
        path: recordsHref(definition),
      })),
      ...groups.map((group) => ({
        cells: [group.label, format(group.value), ...(counting ? [] : [String(group.count)])],
        path: result.groupLabel ? recordsHref(definition, group.key) : recordsHref(definition),
      })),
    ],
    total: result.matched,
  };
}
