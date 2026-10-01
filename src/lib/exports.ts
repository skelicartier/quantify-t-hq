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
