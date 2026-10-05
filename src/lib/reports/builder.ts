import "server-only";

import { readCompanies, readCrmSettings, readLeads, readTasks, type Task } from "@/lib/api/crm";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readDealsBoard } from "@/lib/api/deals";
import { directoryOrNull, nameFor, type DirectoryEntry } from "@/lib/api/staff";
import { readQueue, type TicketSummary } from "@/lib/api/tickets";
import {
  LEAD_STAGE_LABELS,
  LIFECYCLE_LABELS,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  sourceLabel,
  sourceNamesFrom,
} from "@/lib/crm/vocabulary";
import { formatMoney, formatMonth, formatNumber, formatSentence, formatWait } from "@/lib/format";
import {
  companyFilterFields,
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
import { applyFilters, parseFilters, type FilterField } from "@/lib/lists/filters";

/**
 * A report: one kind of record, the list's own filters, a grouping, a measure and a way to
 * draw it — carried as a query string, so a report is a saved view like any list's and is
 * saved, shared and mailed the way views are.
 *
 * It runs as the person reading it: the same reads their list pages make, so a record
 * their role cannot see was never counted, and money their role cannot read is never
 * summed (the measure says so instead of showing nothing as zero). Money is added up in
 * one currency at a time; records in other currencies are left out and counted.
 */

export const REPORT_KINDS = ["companies", "leads", "deals", "tickets", "tasks"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export const REPORT_KIND_LABELS: Record<ReportKind, string> = {
  companies: "Companies",
  leads: "Leads",
  deals: "Deals",
  tickets: "Support conversations",
  tasks: "Tasks",
};

/** What reading each kind takes — the capability of the list route it reads. */
export const REPORT_KIND_CAPABILITY: Record<ReportKind, string> = {
  companies: "crm:read",
  leads: "crm:read",
  deals: "deals:read",
  tickets: "tickets:read",
  tasks: "crm:read",
};

/** A saved report is a saved view on this list key. */
export function reportListKey(kind: ReportKind): string {
  return `report-${kind}`;
}

export function reportKindOfListKey(listKey: string): ReportKind | null {
  const kind = listKey.startsWith("report-") ? listKey.slice("report-".length) : "";
  return isReportKind(kind) ? kind : null;
}

export function isReportKind(kind: string): kind is ReportKind {
  return (REPORT_KINDS as readonly string[]).includes(kind);
}

export const CHARTS = ["bar", "line", "table"] as const;
export type Chart = (typeof CHARTS)[number];
export const CHART_LABELS: Record<Chart, string> = {
  bar: "Bars",
  line: "Line over time",
  table: "Table",
};

/** The statuses a deal or task report reads; the default is the list page's. */
export const REPORT_STATUSES: Partial<
  Record<ReportKind, readonly { value: string; label: string }[]>
> = {
  deals: [
    { value: "open", label: "Open" },
    { value: "won", label: "Won" },
    { value: "lost", label: "Lost" },
    { value: "all", label: "All" },
  ],
  tasks: [
    { value: "open", label: "Open" },
    { value: "done", label: "Done" },
    { value: "canceled", label: "Cancelled" },
    { value: "all", label: "All" },
  ],
};

export type ReportDefinition = {
  kind: ReportKind;
  /** `field:op:value` conditions, as the list pages carry them. */
  filters: string[];
  /** A grouping key, or "" for one figure. */
  by: string;
  /** "count", or "sum:<field>" / "avg:<field>". */
  measure: string;
  chart: Chart;
  /** The currency a money measure adds up in; "" picks the commonest. */
  currency: string;
  /** Deals and tasks: which ones (open, won, lost, done, cancelled, all). */
  status: string;
};

type Params = Readonly<Record<string, string | string[] | undefined>>;

function firstOf(params: Params, key: string): string {
  const value = params[key];
  return ((Array.isArray(value) ? value[0] : value) ?? "").trim();
}

function allOf(params: Params, key: string): string[] {
  const value = params[key];
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

/** A definition from a page's parameters (or a saved query); anything unknown falls back. */
export function parseDefinition(params: Params, kindOverride?: ReportKind): ReportDefinition {
  const asked = kindOverride ?? firstOf(params, "kind");
  const kind: ReportKind = isReportKind(asked) ? asked : "deals";
  const chart = firstOf(params, "chart");
  const statuses = REPORT_STATUSES[kind];
  const status = firstOf(params, "status");
  return {
    kind,
    filters: allOf(params, "f").slice(0, 8),
    by: firstOf(params, "by").slice(0, 40),
    measure: firstOf(params, "measure").slice(0, 40) || "count",
    chart: (CHARTS as readonly string[]).includes(chart) ? (chart as Chart) : "bar",
    currency: /^[A-Z]{3}$/.test(firstOf(params, "currency")) ? firstOf(params, "currency") : "",
    status: statuses?.some((option) => option.value === status)
      ? status
      : (statuses?.[0]?.value ?? ""),
  };
}

export function parseDefinitionQuery(query: string, kindOverride?: ReportKind): ReportDefinition {
  const params: Record<string, string | string[]> = {};
  const search = new URLSearchParams(query);
  for (const key of new Set(search.keys())) {
    const values = search.getAll(key);
    params[key] = values.length === 1 ? values[0]! : values;
  }
  return parseDefinition(params, kindOverride);
}

/** The definition as a query string (no leading `?`), with anything extra after it. */
export function definitionQuery(
  definition: ReportDefinition,
  extra: Readonly<Record<string, string>> = {},
): string {
  const params = new URLSearchParams();
  params.set("kind", definition.kind);
  for (const filter of definition.filters) params.append("f", filter);
  if (definition.by) params.set("by", definition.by);
  if (definition.measure !== "count") params.set("measure", definition.measure);
  if (definition.chart !== "bar") params.set("chart", definition.chart);
  if (definition.currency) params.set("currency", definition.currency);
  if (definition.status && definition.status !== REPORT_STATUSES[definition.kind]?.[0]?.value)
    params.set("status", definition.status);
  for (const [key, value] of Object.entries(extra)) if (value) params.set(key, value);
  return params.toString();
}

// -- what each kind offers ----------------------------------------------------------------

type Names = ReadonlyMap<string, DirectoryEntry> | null;
type GroupValue = { key: string; label: string };

export type Grouping<Row> = {
  key: string;
  label: string;
  /** Months, drawn in order with the empty ones between shown. */
  time?: boolean;
  /** Most rows are in one group; a ticket with two tags is in both. */
  read: (row: Row) => readonly GroupValue[];
};

export type MeasureField<Row> = {
  key: string;
  label: string;
  ops: readonly ("sum" | "avg")[];
  /** "money" adds up in one currency; "minutes" and "days" are durations. */
  unit: "money" | "number" | "minutes" | "days";
  /** The amount for a row (in `currency` for money), or null when it has none. */
  read: (row: Row, currency: string) => number | null;
  /** The currencies a row's money is in (money only). */
  currencies?: (row: Row) => readonly string[];
};

export type RecordLine = { id: string; title: string; path: string; cells: string[] };

type Source<Row> = {
  rows: Row[];
  fields: FilterField[];
  readField: (row: Row, field: string) => string | number | null | undefined;
  groupings: Grouping<Row>[];
  measures: MeasureField<Row>[];
  columns: string[];
  record: (row: Row) => RecordLine;
};

function one(key: string, label: string): GroupValue[] {
  return [{ key, label }];
}

function month(value: string | null | undefined, empty = "No date"): GroupValue[] {
  const key = /^\d{4}-\d{2}/.test(value ?? "") ? value!.slice(0, 7) : "";
  return one(key, key ? formatMonth(key) : empty);
}

function owner(names: Names, staffId: string, empty = "Unowned"): GroupValue[] {
  return one(staffId.toLowerCase(), staffId ? nameFor(names, staffId) : empty);
}

function yesNo(value: boolean): GroupValue[] {
  return one(value ? "yes" : "no", value ? "Yes" : "No");
}

function companiesSource(
  page: Awaited<ReturnType<typeof readCompanies>>,
  names: Names,
  sourceNames: ReadonlyMap<string, string>,
): Source<CompanyListRow> {
  const currency = mainCurrency(page.companies);
  return {
    rows: page.companies,
    fields: companyFilterFields(page, currency),
    readField: (row, field) => readCompanyField(row, field, names, currency),
    groupings: [
      {
        key: "lifecycle",
        label: "Lifecycle",
        read: (row) => one(row.lifecycle, LIFECYCLE_LABELS[row.lifecycle] ?? row.lifecycle),
      },
      {
        key: "type",
        label: "Type",
        read: (row) => one(row.firm_type, row.firm_type || "Type not known"),
      },
      { key: "owner", label: "Owner", read: (row) => owner(names, row.owner_staff_id) },
      {
        key: "country",
        label: "Country",
        read: (row) => one(row.country, row.country || "Country not known"),
      },
      {
        key: "source",
        label: "Source",
        read: (row) =>
          one(
            row.source_key,
            row.source_key ? sourceLabel(row.source_key, sourceNames) : "No source",
          ),
      },
      { key: "created", label: "Month added", time: true, read: (row) => month(row.created_at) },
      {
        key: "customer_since",
        label: "Month they became a customer",
        time: true,
        read: (row) => month(row.customer_since, "Not a customer"),
      },
    ],
    measures: [
      {
        key: "mrr",
        label: "MRR",
        ops: ["sum", "avg"],
        unit: "money",
        read: (row, currency) => row.mrr?.[currency] ?? null,
        currencies: (row) => Object.keys(row.mrr ?? {}),
      },
      {
        key: "people",
        label: "People",
        ops: ["sum", "avg"],
        unit: "number",
        read: (row) => row.people_count,
      },
      {
        key: "deals",
        label: "Open deals",
        ops: ["sum", "avg"],
        unit: "number",
        read: (row) => row.open_deals,
      },
    ],
    columns: ["Company", "Lifecycle", "Owner", "Open deals"],
    record: (row) => ({
      id: row.company_id,
      title: row.name,
      path: `/companies/${row.company_id}`,
      cells: [
        LIFECYCLE_LABELS[row.lifecycle] ?? row.lifecycle,
        row.owner_staff_id ? nameFor(names, row.owner_staff_id) : "Unowned",
        String(row.open_deals),
      ],
    }),
  };
}

function leadsSource(
  page: Awaited<ReturnType<typeof readLeads>>,
  names: Names,
  sources: readonly { key: string; label: string }[],
  sourceNames: ReadonlyMap<string, string>,
): Source<LeadListRow> {
  return {
    rows: page.leads,
    fields: leadFilterFields(page, sources),
    readField: (row, field) => readLeadField(row, field, names),
    groupings: [
      {
        key: "stage",
        label: "Stage",
        read: (row) => one(row.stage, LEAD_STAGE_LABELS[row.stage] ?? row.stage),
      },
      {
        key: "source",
        label: "Source",
        read: (row) =>
          one(
            row.source_key,
            row.source_key ? sourceLabel(row.source_key, sourceNames) : "No source",
          ),
      },
      { key: "owner", label: "Owner", read: (row) => owner(names, row.owner_staff_id) },
      {
        key: "received",
        label: "Month received",
        time: true,
        read: (row) => month(row.created_at),
      },
      {
        key: "overdue",
        label: "First reply overdue",
        read: (row) => yesNo(row.first_reply_overdue),
      },
    ],
    measures: [
      {
        key: "waiting",
        label: "Wait for a first reply",
        ops: ["avg"],
        unit: "minutes",
        read: (row) => row.waiting_minutes,
      },
    ],
    columns: ["Lead", "Stage", "Source", "Owner"],
    record: (row) => ({
      id: row.lead_id,
      title: row.full_name || row.email,
      path: `/leads/${row.lead_id}`,
      cells: [
        LEAD_STAGE_LABELS[row.stage] ?? row.stage,
        sourceLabel(row.source_key, sourceNames),
        row.owner_staff_id ? nameFor(names, row.owner_staff_id) : "Unowned",
      ],
    }),
  };
}

function dealStage(deal: DealListRow): GroupValue[] {
  if (deal.status === "won") return one("won", "Won");
  if (deal.status === "lost") return one("lost", "Lost");
  return one(deal.stage_key, deal.stage_label);
}

function dealsSource(
  board: Awaited<ReturnType<typeof readDealsBoard>>,
  names: Names,
  sourceNames: ReadonlyMap<string, string>,
): Source<DealListRow> {
  const money =
    (read: (deal: DealListRow) => number | null) => (deal: DealListRow, currency: string) =>
      deal.currency === currency ? read(deal) : null;
  return {
    rows: board.columns.flatMap((column) => column.deals),
    fields: dealFilterFields(board),
    readField: (row, field) => readDealField(row, field, names),
    groupings: [
      { key: "stage", label: "Stage", read: dealStage },
      {
        key: "status",
        label: "Open, won or lost",
        read: (deal) => one(deal.status, formatSentence(deal.status)),
      },
      { key: "owner", label: "Owner", read: (deal) => owner(names, deal.owner_staff_id) },
      {
        key: "source",
        label: "Source",
        read: (deal) =>
          one(
            deal.source_key,
            deal.source_key ? sourceLabel(deal.source_key, sourceNames) : "No source",
          ),
      },
      {
        key: "forecast",
        label: "Forecast category",
        read: (deal) =>
          one(deal.forecast_category, formatSentence(deal.forecast_category) || "None"),
      },
      {
        key: "loss_reason",
        label: "Loss reason",
        read: (deal) =>
          one(deal.loss_reason, deal.loss_reason ? formatSentence(deal.loss_reason) : "Not lost"),
      },
      { key: "created", label: "Month opened", time: true, read: (deal) => month(deal.created_at) },
      {
        key: "closed",
        label: "Month closed",
        time: true,
        read: (deal) => month(deal.closed_at, "Not closed"),
      },
      {
        key: "expected_close",
        label: "Expected close month",
        time: true,
        read: (deal) => month(deal.expected_close_date, "No close date"),
      },
    ],
    measures: [
      {
        key: "value",
        label: "Monthly value",
        ops: ["sum", "avg"],
        unit: "money",
        read: money((deal) => deal.mrr_amount),
        currencies: (deal) => (deal.mrr_amount === null ? [] : [deal.currency]),
      },
      {
        key: "weighted",
        label: "Weighted monthly value",
        ops: ["sum"],
        unit: "money",
        read: money((deal) => deal.weighted_mrr),
        currencies: (deal) => (deal.weighted_mrr === null ? [] : [deal.currency]),
      },
      {
        key: "age",
        label: "Days in stage",
        ops: ["avg"],
        unit: "days",
        read: (deal) => (deal.status === "open" ? deal.days_in_stage : null),
      },
      {
        key: "idle",
        label: "Days quiet",
        ops: ["avg"],
        unit: "days",
        read: (deal) => (deal.status === "open" ? deal.idle_days : null),
      },
      {
        key: "seats",
        label: "Seats",
        ops: ["sum", "avg"],
        unit: "number",
        read: (deal) => deal.seats,
      },
    ],
    columns: ["Deal", "Stage", "Owner", "Monthly value"],
    record: (deal) => ({
      id: deal.deal_id,
      title: deal.company_name || deal.name,
      path: `/deals/${deal.deal_id}`,
      cells: [
        dealStage(deal)[0]!.label,
        deal.owner_staff_id ? nameFor(names, deal.owner_staff_id) : "Unowned",
        deal.mrr_amount === null ? "—" : `${deal.currency} ${deal.mrr_amount.toLocaleString("en")}`,
      ],
    }),
  };
}

const TICKET_PRIORITIES = ["urgent", "high", "normal", "low"] as const;

export function ticketFilterFields(): FilterField[] {
  return [
    {
      key: "status",
      label: "Status",
      kind: "choice",
      choices: ["open", "pending", "resolved"].map((value) => ({
        value,
        label: formatSentence(value),
      })),
    },
    {
      key: "priority",
      label: "Priority",
      kind: "choice",
      choices: TICKET_PRIORITIES.map((value) => ({ value, label: formatSentence(value) })),
    },
    { key: "assignee", label: "Assignee", kind: "text" },
    { key: "tag", label: "Tags", kind: "text" },
    { key: "source", label: "Came in by", kind: "text" },
    {
      key: "sla",
      label: "Reply timer",
      kind: "choice",
      choices: ["healthy", "at-risk", "breached", "paused", "none"].map((value) => ({
        value,
        label: formatSentence(value),
      })),
    },
    { key: "messages", label: "Messages", kind: "number" },
    { key: "reopened", label: "Times reopened", kind: "number" },
  ];
}

function readTicketField(row: TicketSummary, field: string, names: Names): string | number | null {
  switch (field) {
    case "status":
      return row.status;
    case "priority":
      return row.priority;
    case "assignee":
      return row.assignee_staff_id ? nameFor(names, row.assignee_staff_id) : "";
    case "tag":
      return row.tags.join(",");
    case "source":
      return row.source;
    case "sla":
      return row.sla.status;
    case "messages":
      return row.message_count;
    case "reopened":
      return row.reopened_count;
    default:
      return null;
  }
}

function ticketsSource(rows: TicketSummary[], names: Names): Source<TicketSummary> {
  return {
    rows,
    fields: ticketFilterFields(),
    readField: (row, field) => readTicketField(row, field, names),
    groupings: [
      {
        key: "status",
        label: "Status",
        read: (row) => one(row.status, formatSentence(row.status)),
      },
      {
        key: "priority",
        label: "Priority",
        read: (row) => one(row.priority, formatSentence(row.priority)),
      },
      {
        key: "assignee",
        label: "Assignee",
        read: (row) => owner(names, row.assignee_staff_id, "Unassigned"),
      },
      {
        key: "tag",
        label: "Tag",
        read: (row) =>
          row.tags.length
            ? row.tags.map((tag) => ({ key: tag.toLowerCase(), label: tag }))
            : one("", "No tag"),
      },
      {
        key: "source",
        label: "Came in by",
        read: (row) => one(row.source, formatSentence(row.source) || "Not known"),
      },
      {
        key: "sla",
        label: "Reply timer",
        read: (row) => one(row.sla.status, formatSentence(row.sla.status)),
      },
      { key: "opened", label: "Month opened", time: true, read: (row) => month(row.created_at) },
    ],
    measures: [
      {
        key: "messages",
        label: "Messages",
        ops: ["sum", "avg"],
        unit: "number",
        read: (row) => row.message_count,
      },
      {
        key: "reopened",
        label: "Times reopened",
        ops: ["sum", "avg"],
        unit: "number",
        read: (row) => row.reopened_count,
      },
    ],
    columns: ["Conversation", "Status", "Priority", "Assignee"],
    record: (row) => ({
      id: row.id,
      title: row.subject || "(no subject)",
      path: `/support/${row.id}`,
      cells: [
        formatSentence(row.status),
        formatSentence(row.priority),
        row.assignee_staff_id ? nameFor(names, row.assignee_staff_id) : "Unassigned",
      ],
    }),
  };
}

export function taskFilterFields(): FilterField[] {
  return [
    {
      key: "status",
      label: "Status",
      kind: "choice",
      choices: [
        { value: "open", label: "Open" },
        { value: "done", label: "Done" },
        { value: "canceled", label: "Cancelled" },
      ],
    },
    {
      key: "priority",
      label: "Priority",
      kind: "choice",
      choices: TASK_PRIORITIES.map((value) => ({
        value,
        label: TASK_PRIORITY_LABELS[value] ?? value,
      })),
    },
    { key: "assignee", label: "Assignee", kind: "text" },
    { key: "record", label: "On the record", kind: "text" },
    { key: "origin", label: "Made by", kind: "text" },
    {
      key: "repeats",
      label: "Repeats",
      kind: "choice",
      choices: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
      ],
    },
    {
      key: "overdue",
      label: "Overdue",
      kind: "choice",
      choices: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
      ],
    },
  ];
}

function taskOverdue(task: Task, today: string): boolean {
  return task.status === "open" && Boolean(task.due_on) && task.due_on!.slice(0, 10) < today;
}

function readTaskField(
  task: Task,
  field: string,
  names: Names,
  today: string,
): string | number | null {
  switch (field) {
    case "status":
      return task.status;
    case "priority":
      return task.priority;
    case "assignee":
      return task.assignee_staff_id ? nameFor(names, task.assignee_staff_id) : "";
    case "record":
      return task.record_label;
    case "origin":
      return task.origin;
    case "repeats":
      return task.repeat_rule ? "yes" : "no";
    case "overdue":
      return taskOverdue(task, today) ? "yes" : "no";
    default:
      return null;
  }
}

function taskPath(task: Task): string {
  if (task.deal_id) return `/deals/${task.deal_id}`;
  if (task.lead_id) return `/leads/${task.lead_id}`;
  if (task.ticket_id) return `/support/${task.ticket_id}`;
  if (task.person_id) return `/people/${task.person_id}`;
  if (task.company_id) return `/companies/${task.company_id}`;
  return "/tasks?scope=all";
}

function tasksSource(rows: Task[], names: Names, today: string): Source<Task> {
  return {
    rows,
    fields: taskFilterFields(),
    readField: (row, field) => readTaskField(row, field, names, today),
    groupings: [
      {
        key: "status",
        label: "Status",
        read: (task) => one(task.status, formatSentence(task.status)),
      },
      {
        key: "priority",
        label: "Priority",
        read: (task) =>
          one(task.priority, TASK_PRIORITY_LABELS[task.priority] ?? formatSentence(task.priority)),
      },
      {
        key: "assignee",
        label: "Assignee",
        read: (task) => owner(names, task.assignee_staff_id, "Unassigned"),
      },
      {
        key: "origin",
        label: "Made by",
        read: (task) => one(task.origin, formatSentence(task.origin) || "Not known"),
      },
      { key: "overdue", label: "Overdue", read: (task) => yesNo(taskOverdue(task, today)) },
      {
        key: "due",
        label: "Month due",
        time: true,
        read: (task) => month(task.due_on, "No due date"),
      },
      {
        key: "done",
        label: "Month done",
        time: true,
        read: (task) => month(task.completed_at, "Not done"),
      },
      { key: "created", label: "Month added", time: true, read: (task) => month(task.created_at) },
    ],
    measures: [],
    columns: ["Task", "Status", "Due", "Assignee"],
    record: (task) => ({
      id: task.task_id,
      title: task.record_label ? `${task.title} · ${task.record_label}` : task.title,
      path: taskPath(task),
      cells: [
        formatSentence(task.status),
        task.due_on ? task.due_on.slice(0, 10) : "—",
        task.assignee_staff_id ? nameFor(names, task.assignee_staff_id) : "Unassigned",
      ],
    }),
  };
}

// -- reading and running ------------------------------------------------------------------

/** A kind's records as the reader sees them, and what a report over them can do. */
export type Loaded =
  | { kind: "companies"; source: Source<CompanyListRow> }
  | { kind: "leads"; source: Source<LeadListRow> }
  | { kind: "deals"; source: Source<DealListRow> }
  | { kind: "tickets"; source: Source<TicketSummary> }
  | { kind: "tasks"; source: Source<Task> };

async function sourceSettings(token: string) {
  try {
    return await readCrmSettings(token);
  } catch (error) {
    // Sources only name a group; without them the keys read as words.
    if (error instanceof HqApiUnavailableError || error instanceof HqApiRequestError) return null;
    throw error;
  }
}

/** Whether the report filters or groups on a person's name (owner, assignee). */
function readsNames(definition: ReportDefinition): boolean {
  return (
    definition.by === "owner" ||
    definition.by === "assignee" ||
    definition.filters.some(
      (filter) => filter.startsWith("owner:") || filter.startsWith("assignee:"),
    )
  );
}

/**
 * Reads the kind's records as the person behind `token`. Throws as the reads do — and
 * when the report goes by people's names and the staff directory could not be read, since
 * every name would then read "Name unavailable" and the figure would be wrong, not empty.
 */
export async function loadReport(
  token: string,
  definition: ReportDefinition,
  today: string,
): Promise<Loaded> {
  const names = await directoryOrNull(token);
  if (names === null && readsNames(definition))
    throw new HqApiUnavailableError("the staff directory could not be read");
  switch (definition.kind) {
    case "companies": {
      const [page, settings] = await Promise.all([readCompanies(token), sourceSettings(token)]);
      return { kind: "companies", source: companiesSource(page, names, sourceNamesFrom(settings)) };
    }
    case "leads": {
      const [page, settings] = await Promise.all([
        readLeads(token, { origin: "inbound" }),
        sourceSettings(token),
      ]);
      const sources = [...(settings?.sources ?? []), ...(settings?.archived_sources ?? [])];
      return {
        kind: "leads",
        source: leadsSource(page, names, sources, sourceNamesFrom(settings)),
      };
    }
    case "deals": {
      const [board, settings] = await Promise.all([
        readDealsBoard(token, definition.status || "open"),
        sourceSettings(token),
      ]);
      return { kind: "deals", source: dealsSource(board, names, sourceNamesFrom(settings)) };
    }
    case "tickets": {
      const queue = await readQueue(token, {});
      return { kind: "tickets", source: ticketsSource(queue.tickets, names) };
    }
    case "tasks": {
      const statuses =
        definition.status === "all" ? ["open", "done", "canceled"] : [definition.status || "open"];
      const pages = await Promise.all(
        statuses.map((status) => readTasks(token, { scope: "all", status })),
      );
      return {
        kind: "tasks",
        source: tasksSource(
          pages.flatMap((page) => page.tasks),
          names,
          today,
        ),
      };
    }
  }
}

/** `value` is null where there is nothing to average (or no money to add up): never 0. */
export type ReportGroup = { key: string; label: string; value: number | null; count: number };

export type ReportResult = {
  /** What is measured, in words: "Count", "Sum of monthly value". */
  measureLabel: string;
  unit: "count" | "money" | "number" | "minutes" | "days";
  currency: string;
  /** The currencies the measure could add up in, commonest first (money only). */
  currencies: string[];
  groupLabel: string;
  time: boolean;
  groups: ReportGroup[];
  /** The whole: every matching record counted once; null when there is nothing to measure. */
  total: number | null;
  /** How many records matched the filters. */
  matched: number;
  /** Records the measure could not use, and why — never silently zero. */
  leftOut: { count: number; why: string }[];
  /** Anything else the figure should be read with, as sentences. */
  notes: string[];
  /** Set when the measure asked for cannot be read by this role; the count is shown instead. */
  refused: string;
  /** A grouping whose rows sit in more than one group (tags) makes the groups add to more. */
  overlapping: boolean;
};

/**
 * The measures a kind offers, as `value`/`label` pairs for a picker. Money is offered only
 * to a role that reads it.
 */
export function measureOptions(
  loaded: Loaded,
  canReadMoney: boolean,
): { value: string; label: string }[] {
  const fields = (loaded.source.measures as MeasureField<unknown>[]).filter(
    (field) => canReadMoney || field.unit !== "money",
  );
  return [
    { value: "count", label: "How many" },
    ...fields.flatMap((field) =>
      field.ops.map((op) => ({
        value: `${op}:${field.key}`,
        label: `${op === "sum" ? "Total" : "Average"} ${field.label.toLowerCase()}`,
      })),
    ),
  ];
}

export function groupingOptions(loaded: Loaded): { value: string; label: string; time: boolean }[] {
  return (loaded.source.groupings as Grouping<unknown>[]).map((grouping) => ({
    value: grouping.key,
    label: grouping.label,
    time: Boolean(grouping.time),
  }));
}

export function filterFieldsOf(loaded: Loaded): FilterField[] {
  return loaded.source.fields;
}

function matchedRows<Row>(source: Source<Row>, definition: ReportDefinition): Row[] {
  return applyFilters(
    source.rows,
    parseFilters(definition.filters, source.fields),
    source.readField,
  );
}

/** The most months a report draws; past it the latest are kept and the cut is said. */
const MAX_MONTHS = 60;

function monthsBetween(first: string, last: string): string[] {
  const out: string[] = [];
  let [year, monthIndex] = first.split("-").map(Number) as [number, number];
  const [lastYear, lastMonth] = last.split("-").map(Number) as [number, number];
  while (year < lastYear || (year === lastYear && monthIndex <= lastMonth)) {
    out.push(`${year}-${String(monthIndex).padStart(2, "0")}`);
    monthIndex += 1;
    if (monthIndex > 12) {
      monthIndex = 1;
      year += 1;
    }
  }
  return out;
}

function runOver<Row>(
  source: Source<Row>,
  definition: ReportDefinition,
  canReadMoney: boolean,
): ReportResult {
  const rows = matchedRows(source, definition);
  const [op = "count", fieldKey = ""] = definition.measure.split(":");
  let field = source.measures.find((candidate) => candidate.key === fieldKey);
  let refused = "";
  if (field && !(field.ops as readonly string[]).includes(op)) field = undefined;
  if (field?.unit === "money" && !canReadMoney) {
    refused = "Your role does not read money, so this report counts records instead.";
    field = undefined;
  }
  const counting = !field || op === "count";
  const leftOut: ReportResult["leftOut"] = [];
  const notes: string[] = [];

  // Money adds up in one currency: the one asked for, else the commonest among the rows.
  let currency = "";
  let currencies: string[] = [];
  if (field?.unit === "money" && field.currencies) {
    const tally = new Map<string, number>();
    for (const row of rows)
      for (const code of field.currencies(row)) tally.set(code, (tally.get(code) ?? 0) + 1);
    currencies = [...tally.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([code]) => code);
    currency = currencies.includes(definition.currency)
      ? definition.currency
      : (currencies[0] ?? definition.currency);
  }

  const valueOf = (row: Row): number | null => (counting ? 1 : field!.read(row, currency));
  const values = new Map<Row, number | null>(rows.map((row) => [row, valueOf(row)]));
  const missing = counting ? 0 : rows.filter((row) => values.get(row) === null).length;
  if (missing > 0) {
    const otherCurrencies =
      field?.unit === "money" && field.currencies
        ? rows.filter((row) => values.get(row) === null && field!.currencies!(row).length > 0)
            .length
        : 0;
    if (otherCurrencies > 0)
      leftOut.push({ count: otherCurrencies, why: `in other currencies than ${currency}` });
    if (missing - otherCurrencies > 0)
      leftOut.push({
        count: missing - otherCurrencies,
        why: `with no ${field!.label.toLowerCase()}`,
      });
  }
  if (field?.unit === "money" && field.currencies) {
    // A company paying in two currencies is added in this one; the other part is not.
    const split = rows.filter(
      (row) =>
        values.get(row) !== null && field!.currencies!(row).some((code) => code !== currency),
    ).length;
    if (split > 0)
      notes.push(
        `${formatNumber(split)} ${split === 1 ? "record also has" : "records also have"} ${field.label} in another currency; only the ${currency} part is added.`,
      );
  }

  // Nothing to average, or no money to add up, is "—", never a figure of 0.
  const emptyValue = counting || (op === "sum" && field!.unit !== "money") ? 0 : null;
  const combine = (amounts: number[]): number | null => {
    if (counting) return amounts.length;
    if (amounts.length === 0) return emptyValue;
    const sum = amounts.reduce((total, amount) => total + amount, 0);
    return op === "avg" ? sum / amounts.length : sum;
  };
  const counted = (bucket: Row[]) =>
    bucket
      .map((row) => values.get(row))
      .filter((amount): amount is number => amount !== null && amount !== undefined);

  const grouping = source.groupings.find((candidate) => candidate.key === definition.by);
  let groups: ReportGroup[] = [];
  let overlapping = false;
  if (grouping) {
    const buckets = new Map<string, { label: string; rows: Row[] }>();
    for (const row of rows) {
      const memberships = grouping.read(row);
      if (memberships.length > 1) overlapping = true;
      for (const membership of memberships) {
        const bucket = buckets.get(membership.key) ?? { label: membership.label, rows: [] };
        bucket.rows.push(row);
        buckets.set(membership.key, bucket);
      }
    }
    groups = [...buckets.entries()].map(([key, bucket]) => ({
      key,
      label: bucket.label,
      value: combine(counted(bucket.rows)),
      count: bucket.rows.length,
    }));
    if (grouping.time) {
      const dated = groups
        .filter((group) => group.key !== "")
        .sort((a, b) => a.key.localeCompare(b.key));
      const undated = groups.filter((group) => group.key === "");
      if (dated.length > 0) {
        const byKey = new Map(dated.map((group) => [group.key, group]));
        const months = monthsBetween(dated[0]!.key, dated[dated.length - 1]!.key);
        const kept = months.slice(-MAX_MONTHS);
        if (kept.length < months.length)
          notes.push(
            `The ${formatNumber(months.length - kept.length)} earliest months are not drawn; their records are in the whole.`,
          );
        const filled = kept.map(
          (key) => byKey.get(key) ?? { key, label: formatMonth(key), value: emptyValue, count: 0 },
        );
        groups = [...filled, ...undated];
      } else groups = undated;
    } else {
      groups.sort(
        (a, b) =>
          (b.value ?? -Infinity) - (a.value ?? -Infinity) ||
          b.count - a.count ||
          a.label.localeCompare(b.label),
      );
    }
  }

  const unit: ReportResult["unit"] = counting ? "count" : field!.unit;
  return {
    measureLabel: counting
      ? "How many"
      : `${op === "sum" ? "Total" : "Average"} ${field!.label.toLowerCase()}`,
    unit,
    currency,
    currencies,
    groupLabel: grouping?.label ?? "",
    time: Boolean(grouping?.time),
    groups,
    total: combine(counted(rows)),
    matched: rows.length,
    leftOut,
    notes,
    refused,
    overlapping,
  };
}

export function runReport(
  loaded: Loaded,
  definition: ReportDefinition,
  canReadMoney: boolean,
): ReportResult {
  switch (loaded.kind) {
    case "companies":
      return runOver(loaded.source, definition, canReadMoney);
    case "leads":
      return runOver(loaded.source, definition, canReadMoney);
    case "deals":
      return runOver(loaded.source, definition, canReadMoney);
    case "tickets":
      return runOver(loaded.source, definition, canReadMoney);
    case "tasks":
      return runOver(loaded.source, definition, canReadMoney);
  }
}

function recordsOver<Row>(
  source: Source<Row>,
  definition: ReportDefinition,
  groupKey: string | null,
): { columns: string[]; lines: RecordLine[]; groupLabel: string } {
  const rows = matchedRows(source, definition);
  const grouping = source.groupings.find((candidate) => candidate.key === definition.by);
  if (!grouping || groupKey === null)
    return { columns: source.columns, lines: rows.map(source.record), groupLabel: "" };
  let groupLabel = "";
  const kept = rows.filter((row) => {
    const membership = grouping.read(row).find((candidate) => candidate.key === groupKey);
    if (membership) groupLabel = membership.label;
    return Boolean(membership);
  });
  return { columns: source.columns, lines: kept.map(source.record), groupLabel };
}

/** The records behind a figure: every match, or one group's. */
export function reportRecords(
  loaded: Loaded,
  definition: ReportDefinition,
  groupKey: string | null,
): { columns: string[]; lines: RecordLine[]; groupLabel: string } {
  switch (loaded.kind) {
    case "companies":
      return recordsOver(loaded.source, definition, groupKey);
    case "leads":
      return recordsOver(loaded.source, definition, groupKey);
    case "deals":
      return recordsOver(loaded.source, definition, groupKey);
    case "tickets":
      return recordsOver(loaded.source, definition, groupKey);
    case "tasks":
      return recordsOver(loaded.source, definition, groupKey);
  }
}

/** Where a figure's records are listed: the whole report's, or one group's. */
/**
 * Where a figure's records are listed. The group and where to go back come first, so a
 * link cut short (a digest keeps 200 characters) loses filters, not which group it was.
 */
export function recordsHref(
  definition: ReportDefinition,
  groupKey?: string,
  reportId = "",
  fromBuilder = false,
): string {
  const head = new URLSearchParams();
  if (groupKey !== undefined) head.set("g", groupKey === "" ? "~" : groupKey);
  if (reportId) head.set("report", reportId);
  if (fromBuilder) head.set("from", "builder");
  const lead = head.toString();
  return `/reports/records?${lead ? `${lead}&` : ""}${definitionQuery(definition)}`;
}

/** `g` as the records page receives it: "~" is the group of records with no value. */
export function groupKeyFromParam(raw: string | undefined): string | null {
  if (raw === undefined || raw === "") return null;
  return raw === "~" ? "" : raw;
}

/** A figure in the report's unit: a count, money in its currency, minutes or days. */
export function formatReportValue(
  result: Pick<ReportResult, "unit" | "currency">,
  value: number | null,
): string {
  if (value === null) return "—";
  const tenth = Math.round(value * 10) / 10;
  switch (result.unit) {
    case "count":
      return formatNumber(Math.round(value));
    case "money":
      return formatMoney(value, result.currency || "USD");
    case "minutes":
      return formatWait(value);
    case "days":
      return `${formatNumber(tenth)} ${tenth === 1 ? "day" : "days"}`;
    default:
      return formatNumber(tenth);
  }
}

/** Who a saved report reaches, in words. */
export function sharingWords(view: { shared: boolean; team_edits: boolean }): string {
  if (!view.shared) return "Only its owner";
  return view.team_edits ? "The team opens and changes it" : "The team opens it";
}
