import "server-only";

import type { CompaniesPage, LeadsPage } from "@/lib/api/crm";
import type { DealsBoard } from "@/lib/api/deals";
import { nameFor, type DirectoryEntry } from "@/lib/api/staff";
import { LEAD_STAGES, LEAD_STAGE_LABELS, LIFECYCLES, LIFECYCLE_LABELS } from "@/lib/crm/vocabulary";
import { customFilterFields, readCustom } from "@/lib/lists/custom";
import type { FilterField } from "@/lib/lists/filters";

/**
 * What each list's filter builder offers, and how a row answers each field — one copy,
 * used by the list pages and by the digests the portal renders from saved views, so a
 * digest matches exactly the rows the page shows its reader.
 */

type Names = ReadonlyMap<string, DirectoryEntry> | null;

export type CompanyListRow = CompaniesPage["companies"][number];
export type LeadListRow = LeadsPage["leads"][number];
export type DealListRow = DealsBoard["columns"][number]["deals"][number];

export function companyFilterFields(
  page: Pick<CompaniesPage, "custom_fields"> | null,
): FilterField[] {
  return [
    {
      key: "lifecycle",
      label: "Lifecycle",
      kind: "choice",
      choices: LIFECYCLES.map((value) => ({ value, label: LIFECYCLE_LABELS[value] ?? value })),
    },
    { key: "type", label: "Type", kind: "text" },
    { key: "country", label: "Country", kind: "text" },
    { key: "domain", label: "Web domain", kind: "text" },
    { key: "owner", label: "Owner", kind: "text" },
    { key: "people", label: "People", kind: "number" },
    { key: "deals", label: "Open deals", kind: "number" },
    { key: "mrr", label: "MRR", kind: "number" },
    ...customFilterFields(page?.custom_fields ?? []),
  ];
}

export function readCompanyField(
  row: CompanyListRow,
  field: string,
  names: Names,
): string | number | null {
  switch (field) {
    case "lifecycle":
      return row.lifecycle;
    case "type":
      return row.firm_type;
    case "country":
      return row.country;
    case "domain":
      return row.domain;
    case "owner":
      return row.owner_staff_id ? nameFor(names, row.owner_staff_id) : "";
    case "people":
      return row.people_count;
    case "deals":
      return row.open_deals;
    case "mrr":
      return row.mrr ? Object.values(row.mrr).reduce((sum, amount) => sum + amount, 0) : null;
    default:
      return readCustom(row.custom, field) ?? null;
  }
}

export function leadFilterFields(
  page: Pick<LeadsPage, "custom_fields"> | null,
  sources: readonly { key: string; label: string }[],
): FilterField[] {
  return [
    {
      key: "stage",
      label: "Stage",
      kind: "choice",
      choices: LEAD_STAGES.map((value) => ({ value, label: LEAD_STAGE_LABELS[value] ?? value })),
    },
    {
      key: "source",
      label: "Source",
      kind: "choice",
      choices: sources.map((source) => ({ value: source.key, label: source.label })),
    },
    { key: "owner", label: "Owner", kind: "text" },
    { key: "company", label: "Company", kind: "text" },
    { key: "email", label: "Email", kind: "text" },
    { key: "waiting", label: "Waiting (minutes)", kind: "number" },
    {
      key: "overdue",
      label: "First reply overdue",
      kind: "choice",
      choices: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
      ],
    },
    ...customFilterFields(page?.custom_fields ?? []),
  ];
}

export function readLeadField(
  lead: LeadListRow,
  field: string,
  names: Names,
): string | number | null {
  switch (field) {
    case "stage":
      return lead.stage;
    case "source":
      return lead.source_key;
    case "owner":
      return lead.owner_staff_id ? nameFor(names, lead.owner_staff_id) : "";
    case "company":
      return lead.company_name;
    case "email":
      return lead.email;
    case "waiting":
      return lead.waiting_minutes;
    case "overdue":
      return lead.first_reply_overdue ? "yes" : "no";
    default:
      return readCustom(lead.custom, field) ?? null;
  }
}

export function dealFilterFields(board: DealsBoard | null): FilterField[] {
  return [
    {
      key: "stage",
      label: "Stage",
      kind: "choice",
      choices: (board?.columns ?? []).map((column) => ({ value: column.key, label: column.label })),
    },
    { key: "owner", label: "Owner", kind: "text" },
    { key: "company", label: "Company", kind: "text" },
    { key: "value", label: "Monthly value", kind: "number" },
    { key: "weighted", label: "Weighted", kind: "number" },
    { key: "age", label: "Days in stage", kind: "number" },
    { key: "idle", label: "Days quiet", kind: "number" },
    { key: "next", label: "Next step", kind: "text" },
    { key: "due", label: "Next step due", kind: "text" },
    { key: "flags", label: "Flags", kind: "text" },
    ...customFilterFields(board?.custom_fields ?? []),
  ];
}

export function readDealField(
  deal: DealListRow,
  field: string,
  names: Names,
): string | number | null {
  switch (field) {
    case "stage":
      return deal.stage_key;
    case "owner":
      return deal.owner_staff_id ? nameFor(names, deal.owner_staff_id) : "";
    case "company":
      return deal.company_name || deal.name;
    case "value":
      return deal.mrr_amount;
    case "weighted":
      return deal.weighted_mrr;
    case "age":
      return deal.days_in_stage;
    case "idle":
      return deal.idle_days;
    case "next":
      return deal.next_step;
    case "due":
      return deal.next_step_due;
    case "flags":
      return deal.flags.join(",");
    default:
      return readCustom(deal.custom, field) ?? null;
  }
}
