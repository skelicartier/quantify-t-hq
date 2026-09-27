import "server-only";

import { z } from "zod";

import { fetchHqJson, postHqJson } from "@/lib/api/core";
import {
  activitySchema,
  companySchema,
  dealSummarySchema,
  personSchema,
  taskSchema,
} from "@/lib/api/crm";

const okEnvelope = z.object({ ok: z.literal(true) });

const boardColumnSchema = z.object({
  key: z.string(),
  label: z.string(),
  win_probability: z.number(),
  stale_after_days: z.number(),
  outcome: z.string(),
  exit_criteria: z.string(),
  deals: z.array(dealSummarySchema.extend({ company_name: z.string() })),
  mrr_total: z.number(),
  weighted_total: z.number(),
});
export type BoardColumn = z.infer<typeof boardColumnSchema>;

const boardSchema = okEnvelope.extend({
  columns: z.array(boardColumnSchema),
  totals: z.object({
    open_count: z.number(),
    open_mrr: z.number(),
    weighted_mrr: z.number(),
  }),
  attention: z.object({
    neglected: z.number(),
    rotting: z.number(),
    no_next_step: z.number(),
  }),
});
export type DealsBoard = z.infer<typeof boardSchema>;

export function readDealsBoard(token: string, status = "open") {
  return fetchHqJson("hq/deals", boardSchema, { token, query: { status } });
}

const dealDetailSchema = okEnvelope.extend({
  deal: dealSummarySchema.extend({ notes: z.string() }),
  company: companySchema.nullable(),
  primary_person: personSchema.nullable(),
  stage_history: z.array(
    z.object({
      from_stage_key: z.string(),
      to_stage_key: z.string(),
      at: z.string().nullable(),
      staff_id: z.string(),
    }),
  ),
  activities: z.array(activitySchema),
  open_tasks: z.array(taskSchema),
  stages: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      outcome: z.string(),
      exit_criteria: z.string(),
    }),
  ),
  loss_reasons: z.array(z.string()),
});
export type DealDetail = z.infer<typeof dealDetailSchema>;

export function readDeal(token: string, dealId: string) {
  return fetchHqJson(`hq/deals/${dealId}`, dealDetailSchema, { token });
}

const dealEnvelope = okEnvelope.extend({ deal: dealSummarySchema });

export function createDeal(token: string, input: Record<string, unknown>) {
  return postHqJson("hq/deals/create", dealEnvelope, { token, body: input });
}

export function updateDeal(token: string, dealId: string, input: Record<string, unknown>) {
  return postHqJson(`hq/deals/${dealId}/update`, dealEnvelope, { token, body: input });
}

export function moveDealStage(
  token: string,
  dealId: string,
  input: { stage_key: string; next_step: string; next_step_due: string },
) {
  return postHqJson(`hq/deals/${dealId}/stage`, dealEnvelope, { token, body: input });
}

export function closeDeal(token: string, dealId: string, input: Record<string, unknown>) {
  return postHqJson(`hq/deals/${dealId}/close`, dealEnvelope, { token, body: input });
}
