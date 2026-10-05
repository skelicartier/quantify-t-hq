import "server-only";

import {
  readCompanies,
  readCrmSettings,
  readLeads,
  readPeople,
  type CompaniesPage,
  type LeadsPage,
} from "@/lib/api/crm";
import { readDealsBoard, type DealsBoard } from "@/lib/api/deals";
import { directoryOrNull, nameFor, type DirectoryEntry } from "@/lib/api/staff";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import {
  LEAD_STAGES,
  LEAD_STAGE_LABELS,
  LIFECYCLE_LABELS,
  sourceLabel,
} from "@/lib/crm/vocabulary";
import {
  companyFilterFields,
  companyMrrIn,
  dealFilterFields,
  leadFilterFields,
  mainCurrency,
  readCompanyField,
  readDealField,
  readLeadField,
  type CompanyListRow,
  type DealListRow,
  type LeadListRow,
} from "@/lib/lists/definitions";
import { applyFilters, parseFilters } from "@/lib/lists/filters";
import { parseSort, sortRows, type SortAccessor } from "@/lib/lists/sort";

/**
 * The rows a list page shows, in the order it shows them — one copy, used by the page
 * that draws them and by the export that writes them, so "this view" in a file is
 * exactly the view on the screen: the same reads, the same filters, the same sort, and
 * the grouping's order when the page groups.
 */

type Names = ReadonlyMap<string, DirectoryEntry> | null;
export type ViewParams = Readonly<Record<string, string | string[] | undefined>>;

function first(params: ViewParams, key: string): string {
  const value = params[key];
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

/** A query string as the parameters a page receives. */
export function paramsOf(query: URLSearchParams): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const key of new Set(query.keys())) {
    const values = query.getAll(key);
    out[key] = values.length === 1 ? values[0]! : values;
  }
  return out;
}

function grouped<Row>(rows: Row[], group: string, label: (row: Row) => string): Row[] {
  // Grouping is a category row before each run of the same label, in the current sort.
  return group ? [...rows].sort((a, b) => label(a).localeCompare(label(b))) : rows;
}

// -- companies ---------------------------------------------------------------------------

export const COMPANY_SORT_KEYS = [
  "company",
  "lifecycle",
  "type",
  "people",
  "deals",
  "mrr",
  "owner",
  "updated",
] as const;
export const COMPANY_GROUPS: Record<string, string> = {
  lifecycle: "Lifecycle",
  type: "Type",
  owner: "Owner",
  country: "Country",
};

/** `currency` is the page's main one (`mainCurrency`): MRR sorts in it, never summed. */
export function companySorts(
  names: Names,
  currency = "",
): Record<string, SortAccessor<CompanyListRow>> {
  return {
    company: (row) => row.name,
    lifecycle: (row) => LIFECYCLE_LABELS[row.lifecycle] ?? row.lifecycle,
    type: (row) => row.firm_type,
    people: (row) => row.people_count,
    deals: (row) => row.open_deals,
    mrr: (row) => companyMrrIn(row, currency),
    owner: (row) => (row.owner_staff_id ? nameFor(names, row.owner_staff_id) : null),
    updated: (row) => row.updated_at,
  };
}

export function companyGroupLabel(row: CompanyListRow, group: string, names: Names): string {
  switch (group) {
    case "lifecycle":
      return LIFECYCLE_LABELS[row.lifecycle] ?? row.lifecycle;
    case "type":
      return row.firm_type || "Type not known";
    case "owner":
      return row.owner_staff_id ? nameFor(names, row.owner_staff_id) : "Unowned";
    case "country":
      return row.country || "Country not known";
    default:
      return "";
  }
}

/** The companies the page shows: the lifecycle tab, the conditions, the sort, the grouping. */
export function companiesView(
  page: Pick<CompaniesPage, "companies" | "custom_fields">,
  params: ViewParams,
  names: Names,
): { rows: CompanyListRow[]; ordered: CompanyListRow[] } {
  const lifecycle = first(params, "lifecycle");
  const sort = parseSort(first(params, "sort") || undefined, COMPANY_SORT_KEYS);
  const group = COMPANY_GROUPS[first(params, "group")] ? first(params, "group") : "";
  const currency = mainCurrency(page.companies);
  const rows = sortRows(
    applyFilters(
      page.companies.filter((row) => !lifecycle || row.lifecycle === lifecycle),
      parseFilters(params.f, companyFilterFields(page, currency)),
      (row, field) => readCompanyField(row, field, names, currency),
    ),
    sort,
    companySorts(names, currency),
  );
  return { rows, ordered: grouped(rows, group, (row) => companyGroupLabel(row, group, names)) };
}

// -- leads -------------------------------------------------------------------------------

export const LEAD_SORT_KEYS = ["lead", "source", "stage", "clock", "owner", "received"] as const;
export const LEAD_GROUPS: Record<string, string> = {
  stage: "Stage",
  source: "Source",
  owner: "Owner",
};

export function leadSorts(
  names: Names,
  sourceNames: ReadonlyMap<string, string>,
): Record<string, SortAccessor<LeadListRow>> {
  return {
    lead: (lead) => lead.full_name || lead.email,
    source: (lead) => sourceLabel(lead.source_key, sourceNames),
    stage: (lead) => LEAD_STAGES.indexOf(lead.stage as (typeof LEAD_STAGES)[number]),
    clock: (lead) => lead.waiting_minutes,
    owner: (lead) => (lead.owner_staff_id ? nameFor(names, lead.owner_staff_id) : null),
    received: (lead) => lead.created_at,
  };
}

export function leadGroupLabel(
  lead: LeadListRow,
  group: string,
  names: Names,
  sourceNames: ReadonlyMap<string, string>,
): string {
  switch (group) {
    case "stage":
      return LEAD_STAGE_LABELS[lead.stage] ?? lead.stage;
    case "source":
      return sourceLabel(lead.source_key, sourceNames);
    case "owner":
      return lead.owner_staff_id ? nameFor(names, lead.owner_staff_id) : "Unowned";
    default:
      return "";
  }
}

/**
 * The leads the page shows: the service has applied stage, source and search; here the
 * set-aside tab, the conditions, the sort and the grouping.
 */
export function leadsView(
  page: Pick<LeadsPage, "leads" | "custom_fields">,
  params: ViewParams,
  names: Names,
  sources: readonly { key: string; label: string }[],
): { rows: LeadListRow[]; ordered: LeadListRow[] } {
  const sourceNames = new Map(sources.map((source) => [source.key, source.label]));
  const sort = parseSort(first(params, "sort") || undefined, LEAD_SORT_KEYS);
  const group = LEAD_GROUPS[first(params, "group")] ? first(params, "group") : "";
  // A lead set aside is off the working list until its day; "Set aside" shows only those.
  const setAside = first(params, "nurturing") === "1";
  const rows = sortRows(
    applyFilters(
      page.leads.filter((lead) => lead.nurturing === setAside),
      parseFilters(params.f, leadFilterFields(page, sources)),
      (lead, field) => readLeadField(lead, field, names),
    ),
    sort,
    leadSorts(names, sourceNames),
  );
  return {
    rows,
    ordered: grouped(rows, group, (lead) => leadGroupLabel(lead, group, names, sourceNames)),
  };
}

// -- deals -------------------------------------------------------------------------------

export const DEAL_STATUSES = ["open", "won", "lost", "all"] as const;
export const DEAL_SORT_KEYS = [
  "deal",
  "stage",
  "value",
  "weighted",
  "next",
  "owner",
  "age",
] as const;
export const DEAL_GROUPS: Record<string, string> = { stage: "Stage", owner: "Owner" };

export function dealStatusOf(params: ViewParams): string {
  const requested = first(params, "status") || "open";
  return (DEAL_STATUSES as readonly string[]).includes(requested) ? requested : "open";
}

export function dealSorts(names: Names): Record<string, SortAccessor<DealListRow>> {
  return {
    deal: (deal) => deal.company_name || deal.name,
    stage: (deal) => deal.stage_label,
    value: (deal) => deal.mrr_amount,
    weighted: (deal) => (deal.status === "open" ? deal.weighted_mrr : null),
    next: (deal) => deal.next_step_due || null,
    owner: (deal) => (deal.owner_staff_id ? nameFor(names, deal.owner_staff_id) : null),
    age: (deal) => (deal.status === "open" ? deal.days_in_stage : null),
  };
}

export function dealGroupLabel(deal: DealListRow, group: string, names: Names): string {
  switch (group) {
    case "stage":
      return deal.status === "won" ? "Won" : deal.status === "lost" ? "Lost" : deal.stage_label;
    case "owner":
      return deal.owner_staff_id ? nameFor(names, deal.owner_staff_id) : "Unowned";
    default:
      return "";
  }
}

/** The deals the table shows for a status: the conditions, the sort, the grouping. */
export function dealsView(
  board: DealsBoard,
  params: ViewParams,
  names: Names,
): { rows: DealListRow[]; ordered: DealListRow[] } {
  const sort = parseSort(first(params, "sort") || undefined, DEAL_SORT_KEYS);
  const group = DEAL_GROUPS[first(params, "group")] ? first(params, "group") : "";
  const rows = sortRows(
    applyFilters(
      board.columns.flatMap((column) => column.deals),
      parseFilters(params.f, dealFilterFields(board)),
      (deal, field) => readDealField(deal, field, names),
    ),
    sort,
    dealSorts(names),
  );
  return { rows, ordered: grouped(rows, group, (deal) => dealGroupLabel(deal, group, names)) };
}

// -- the export's side -------------------------------------------------------------------

/** The lists whose export can be the view on screen rather than every record. */
export const VIEW_EXPORT_KINDS = ["companies", "people", "leads", "deals"] as const;
export type ViewExportKind = (typeof VIEW_EXPORT_KINDS)[number];

export function isViewExportKind(kind: string): kind is ViewExportKind {
  return (VIEW_EXPORT_KINDS as readonly string[]).includes(kind);
}

/**
 * The ids of the records a list page shows for this query, in its order — read as the
 * person asking, so a record their role cannot see was never a candidate.
 */
export async function viewRecordIds(
  token: string,
  kind: ViewExportKind,
  query: URLSearchParams,
): Promise<string[]> {
  const params = paramsOf(query);
  if (kind === "people") {
    return (await readPeople(token, first(params, "q"))).people.map((person) => person.person_id);
  }
  const names = await directoryOrNull(token);
  if (kind === "companies") {
    const page = await readCompanies(token, first(params, "q"));
    return companiesView(page, params, names).ordered.map((row) => row.company_id);
  }
  if (kind === "leads") {
    const page = await readLeads(token, {
      origin: "inbound",
      stage: first(params, "stage"),
      source: first(params, "source"),
      q: first(params, "q"),
    });
    let settings: Awaited<ReturnType<typeof readCrmSettings>> | null = null;
    try {
      settings = await readCrmSettings(token);
    } catch (error) {
      // Sources only name a sort or a group; without them the keys read as words.
      if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
        throw error;
    }
    const sources = [...(settings?.sources ?? []), ...(settings?.archived_sources ?? [])];
    return leadsView(page, params, names, sources).ordered.map((lead) => lead.lead_id);
  }
  const board = await readDealsBoard(token, dealStatusOf(params));
  return dealsView(board, params, names).ordered.map((deal) => deal.deal_id);
}
