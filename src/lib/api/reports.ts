import "server-only";

import { z } from "zod";

import {
  EXPORT_COLUMN_TYPES,
  EXPORT_FORMATS,
  EXPORT_KINDS,
  type ExportFormat,
  type ExportKind,
} from "@/lib/exports";
import { fetchHqJson, postHqJson } from "@/lib/api/core";
import { moneyByCurrencySchema } from "@/lib/api/crm";

const okEnvelope = z.object({ ok: z.literal(true) });

const countSchema = z.object({ reason: z.string(), count: z.number() });

const weeklySchema = okEnvelope.extend({
  week: z.object({
    label: z.string(),
    starts_on: z.string(),
    ends_on: z.string(),
    previous: z.string(),
    next: z.string().nullable(),
    in_progress: z.boolean(),
  }),
  leads: z.object({
    received: z.number(),
    by_source: z.array(z.object({ source_key: z.string(), count: z.number() })),
    answered: z.number(),
    median_first_reply_minutes: z.number().nullable(),
    answered_within_target: z.number(),
    first_reply_target_minutes: z.number(),
    qualified: z.number(),
  }),
  meetings: z.object({
    demos_held: z.number(),
    demo_no_shows: z.number(),
    held: z.number(),
    no_shows: z.number(),
    outcomes_missing: z.number(),
  }),
  deals: z.object({
    created: z.number(),
    stage_moves: z.number(),
    won: z.object({ count: z.number(), mrr: moneyByCurrencySchema }),
    lost: z.object({ count: z.number(), reasons: z.array(countSchema) }),
  }),
  pipeline: z.object({
    stages: z.array(
      z.object({
        key: z.string(),
        label: z.string(),
        count: z.number(),
        mrr: moneyByCurrencySchema,
        weighted: moneyByCurrencySchema,
      }),
    ),
    open_count: z.number(),
    open_mrr: moneyByCurrencySchema,
    weighted: moneyByCurrencySchema,
  }),
  forecast: z.object({
    horizon_days: z.number(),
    commit_mrr: moneyByCurrencySchema,
    best_case_mrr: moneyByCurrencySchema,
    slipped: z.array(
      z.object({
        deal_id: z.string(),
        name: z.string(),
        company_name: z.string(),
        expected_close_date: z.string(),
        days_late: z.number(),
      }),
    ),
    slipped_count: z.number(),
  }),
  revenue: z.object({
    currency: z.string(),
    mrr_at_start: z.number(),
    mrr_at_end: z.number(),
    movements: z.record(z.string(), z.number()),
  }),
  losses_last_90_days: z.array(countSchema),
  /** The support desk's week; null until the desk runs on the database. */
  desk: z
    .object({
      opened: z.number(),
      answered: z.number(),
      median_first_reply_minutes: z.number().nullable(),
      replies_sent: z.number(),
      resolved: z.number(),
      resolved_on_first_reply: z.number(),
      resolved_after_reopen: z.number(),
      open_now: z.number(),
    })
    .nullable(),
  generated_at: z.string().nullable(),
});
export type WeeklyReport = z.infer<typeof weeklySchema>;

export function readWeeklyReport(token: string, week = "") {
  return fetchHqJson("hq/reports/weekly", weeklySchema, {
    token,
    query: week ? { week } : {},
  });
}

const exportColumnSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(EXPORT_COLUMN_TYPES),
});
export type ExportColumn = z.infer<typeof exportColumnSchema>;
export type ExportCell = string | number | boolean | null;

const exportSchema = okEnvelope.extend({
  filename: z.string(),
  rows: z.number(),
  marked: z.boolean(),
  /** Filled only for a CSV: the service writes it, every cell neutralised against formulas. */
  csv: z.string(),
  format: z.enum(EXPORT_FORMATS),
  title: z.string(),
  generated_at: z.string(),
  /** "view": the records a page showed, in its order; "all": every record of the kind. */
  scope: z.enum(["view", "all"]),
  columns: z.array(exportColumnSchema),
  /** The same records, typed, for the spreadsheet and the PDF the portal lays out. */
  table: z.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()]))),
});
export type ExportFile = z.infer<typeof exportSchema>;

export type ExportChoice = {
  /** For the prospects list: the view's own filters, applied by the service. */
  view?: Record<string, unknown>;
  /** The records a page shows, in its order; the file holds those and no others. */
  ids?: readonly string[];
  /** The columns chosen, by key, in the order wanted; every column when absent. */
  columns?: readonly string[];
};

export function createExport(
  token: string,
  kind: ExportKind,
  reason: string,
  format: ExportFormat = "csv",
  choice: ExportChoice = {},
) {
  return postHqJson(`hq/exports/${kind}`, exportSchema, {
    token,
    body: {
      ...(choice.view ?? {}),
      ...(choice.ids ? { ids: choice.ids } : {}),
      ...(choice.columns ? { columns: choice.columns } : {}),
      reason,
      format,
    },
  });
}

const exportColumnsSchema = okEnvelope.extend({
  kind: z.enum(EXPORT_KINDS),
  title: z.string(),
  /** The kind's own columns, then the custom fields this role may read. */
  columns: z.array(exportColumnSchema.extend({ custom: z.boolean() })),
});
export type ExportColumns = z.infer<typeof exportColumnsSchema>;

/** What a file of this kind can carry, for the export's column choice. */
export function readExportColumns(token: string, kind: ExportKind) {
  return fetchHqJson(`hq/exports/${kind}/columns`, exportColumnsSchema, { token });
}

const funnelSchema = okEnvelope.extend({
  days: z.number(),
  since: z.string(),
  deals_moved: z.number(),
  stages: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      entered: z.number(),
      advanced: z.number(),
      won_from_here: z.number(),
      lost_from_here: z.number(),
      still_here: z.number(),
      /** Of those that left the stage, the share that went forward; null until one left. */
      conversion: z.number().nullable(),
      median_days: z.number().nullable(),
    }),
  ),
  closed: z.object({ won: z.number(), lost: z.number(), win_rate: z.number().nullable() }),
  generated_at: z.string().nullable(),
});
export type FunnelReport = z.infer<typeof funnelSchema>;

/** What happened to every deal that entered each stage in the window. */
export function readFunnel(token: string, days = 90) {
  return fetchHqJson("hq/reports/funnel", funnelSchema, { token, query: { days: String(days) } });
}

const pipelineHistorySchema = okEnvelope.extend({
  days: z.number(),
  currency: z.string(),
  points: z.array(
    z.object({
      day: z.string(),
      open_count: z.number(),
      open_mrr_cents: z.number(),
      weighted_cents: z.number(),
      by_stage: z.array(
        z.object({
          key: z.string(),
          label: z.string(),
          position: z.number(),
          count: z.number(),
          mrr_cents: z.number(),
          weighted_cents: z.number(),
        }),
      ),
    }),
  ),
});
export type PipelineHistory = z.infer<typeof pipelineHistorySchema>;

/** The nightly pipeline snapshots for a window, oldest first. */
export function readPipelineHistory(token: string, days = 90) {
  return fetchHqJson("hq/reports/pipeline-history", pipelineHistorySchema, {
    token,
    query: { days: String(days) },
  });
}

const attributionSchema = okEnvelope.extend({
  days: z.number(),
  /** Leads who wrote in during the window; prospects found by the team are not counted. */
  leads: z.number(),
  /** Of those, how many said how they heard of us. */
  answered: z.number(),
  /** The service's own names for its channels, by key. */
  channels: z.record(z.string(), z.string()),
  /** What they said ("not_said" when nothing), each against what their visits showed. */
  matrix: z.array(
    z.object({
      said: z.string(),
      seen: z.array(z.object({ channel: z.string(), count: z.number() })),
    }),
  ),
  /** Each channel — what a lead said, else what its visit showed — followed on to won. */
  chain: z.array(
    z.object({
      channel: z.string(),
      leads: z.number(),
      qualified: z.number(),
      met: z.number(),
      deals: z.number(),
      won: z.number(),
      won_mrr: moneyByCurrencySchema,
    }),
  ),
  /** The same chain per form — the lead's own source — with what its people said. */
  by_source: z.array(
    z.object({
      source_key: z.string(),
      label: z.string(),
      leads: z.number(),
      qualified: z.number(),
      met: z.number(),
      deals: z.number(),
      won: z.number(),
      won_mrr: moneyByCurrencySchema,
      said: z.array(z.object({ channel: z.string(), count: z.number() })),
    }),
  ),
  months: z.array(
    z.object({
      month: z.string(),
      leads: z.number(),
      answered: z.number(),
      qualified: z.number(),
      met: z.number(),
      won: z.number(),
    }),
  ),
  generated_at: z.string(),
});
export type AttributionReport = z.infer<typeof attributionSchema>;

/** Where the leads of a window came from, what they said and what their visit showed. */
export function readAttribution(token: string, days = 90) {
  return fetchHqJson("hq/reports/attribution", attributionSchema, {
    token,
    query: { days: String(days) },
  });
}
