/**
 * The exports HQ can make, shared by the pages that offer them and the route that makes
 * them. The service decides what each kind holds and who may take it; this table only
 * names them, says which capability the records themselves need (so a page does not
 * offer what will be refused) and where each one is offered.
 */

export const EXPORT_KINDS = [
  "companies",
  "people",
  "leads",
  "prospects",
  "deals",
  "contracts",
  "quotes",
  "invoices",
  "tasks",
  "meetings",
  "tickets",
  "vendors",
  "expenses",
  "controls",
] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

export const EXPORT_LABELS: Record<ExportKind, string> = {
  companies: "Companies",
  people: "People",
  leads: "Leads",
  prospects: "Prospects",
  deals: "Deals",
  contracts: "Contracts",
  quotes: "Quotes",
  invoices: "Invoices",
  tasks: "Tasks",
  meetings: "Meetings",
  tickets: "Support tickets",
  vendors: "Vendors",
  expenses: "Expense claims",
  controls: "Controls",
};

/** Beyond `crm:export`, what the records need — the service checks the same. */
export const EXPORT_NEEDS: Record<ExportKind, string | null> = {
  companies: null,
  people: null,
  leads: null,
  prospects: null,
  deals: "deals:read",
  contracts: "revenue:read",
  quotes: "revenue:read",
  invoices: "revenue:read",
  tasks: null,
  meetings: null,
  tickets: "tickets:read",
  vendors: "revenue:write",
  expenses: "revenue:write",
  controls: "audit:read",
};

export const EXPORT_FORMATS = ["csv", "xlsx", "pdf"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const FORMAT_LABELS: Record<ExportFormat, { label: string; hint: string }> = {
  csv: { label: "CSV", hint: "Plain text any tool opens" },
  xlsx: { label: "Excel", hint: "A spreadsheet with numbers kept as numbers" },
  pdf: { label: "PDF", hint: "A document on the letterhead, to read or send" },
};

export const EXPORT_COLUMN_TYPES = [
  "text",
  "number",
  "money",
  "percent",
  "date",
  "datetime",
  "bool",
] as const;
export type ExportColumnType = (typeof EXPORT_COLUMN_TYPES)[number];

/** What a refused or failed export says when the page comes back, keyed by `?export=`. */
export const EXPORT_OUTCOMES: Record<string, string> = {
  sudo: "Confirm it's you first, then export again.",
  reason: "Say what the export is for, in a sentence.",
  forbidden: "Your role cannot export these records.",
  failed: "The export could not be made. Nothing left HQ.",
  quota:
    "That is more than you can export today. An owner can lift your limit for a day on Privileged access.",
};

export function canExport(capabilities: readonly string[], kind: ExportKind): boolean {
  const needs = EXPORT_NEEDS[kind];
  return capabilities.includes("crm:export") && (needs === null || capabilities.includes(needs));
}

/**
 * Where to send someone back to: a path of this portal and nothing else, so the field
 * cannot become an open redirect.
 */
export function safeReturnPath(value: string, fallback = "/reports"): string {
  return /^\/(?!\/)[A-Za-z0-9/_-]*$/.test(value) ? value : fallback;
}

const RETURN_QUERY_KEYS = new Set(["f", "stage", "q", "sort", "offset", "view"]);

/**
 * The list's own query, carried so a refused export comes back to the same view and not
 * to the unfiltered list. Only a list's filter keys survive, each of bounded length: the
 * path is checked separately, so this can only ever choose a view of that page.
 */
export function safeReturnQuery(value: string): URLSearchParams {
  const kept = new URLSearchParams();
  if (value.length > 4_000) return kept;
  for (const [key, item] of new URLSearchParams(value))
    if (RETURN_QUERY_KEYS.has(key) && item.length <= 200) kept.append(key, item);
  return kept;
}

/** A list view as an export's request carries it; anything else in the field is dropped. */
export function exportView(raw: string): Record<string, unknown> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw || "{}");
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const view = parsed as Record<string, unknown>;
  return {
    conditions: Array.isArray(view.conditions)
      ? view.conditions.filter((item): item is string => typeof item === "string").slice(0, 8)
      : [],
    stage_filter: typeof view.stage_filter === "string" ? view.stage_filter.slice(0, 20) : "",
    q: typeof view.q === "string" ? view.q.slice(0, 120) : "",
  };
}
