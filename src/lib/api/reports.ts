import "server-only";

import { z } from "zod";

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
  generated_at: z.string().nullable(),
});
export type WeeklyReport = z.infer<typeof weeklySchema>;

export function readWeeklyReport(token: string, week = "") {
  return fetchHqJson("hq/reports/weekly", weeklySchema, {
    token,
    query: week ? { week } : {},
  });
}

export const EXPORT_KINDS = ["companies", "people", "leads", "deals", "contracts"] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

const exportSchema = okEnvelope.extend({
  filename: z.string(),
  rows: z.number(),
  csv: z.string(),
});

export function createExport(token: string, kind: ExportKind, reason: string) {
  return postHqJson(`hq/exports/${kind}`, exportSchema, { token, body: { reason } });
}
