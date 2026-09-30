import "server-only";

import { z } from "zod";

import { fetchHqJson, postHqJson } from "@/lib/api/core";

const okEnvelope = z.object({ ok: z.literal(true) });
const option = z.object({ value: z.string(), label: z.string() });
/** Money travels as exact decimal text ("1250.00"), never a float. */
const amount = z.string();

// --- what changed ------------------------------------------------------------------------------

export const changeSchema = z.object({
  deal_id: z.string(),
  name: z.string(),
  company: z.object({ id: z.string(), name: z.string() }),
  owner: z.string(),
  reason: z.string(),
  reason_label: z.string(),
  push: z.string(),
  push_count: z.number(),
  stage_before: z.string(),
  stage_after: z.string(),
  category_before: z.string(),
  category_after: z.string(),
  close_before: z.string(),
  close_after: z.string(),
  currency: z.string(),
  /** Null for a role that does not see money. */
  amount_before: amount.nullable(),
  amount_after: amount.nullable(),
  delta: amount.nullable(),
  next_step: z.string(),
  next_step_stale: z.boolean(),
});
export type DealChange = z.infer<typeof changeSchema>;

const changesSchema = okEnvelope.extend({
  window: z.object({
    days: z.number(),
    from: z.string(),
    to: z.string(),
    compared_from: z.string().nullable(),
    note: z.string(),
  }),
  changes: z.array(changeSchema),
  by_reason: z.array(
    z.object({
      reason: z.string(),
      label: z.string(),
      count: z.number(),
      amounts: z.record(z.string(), amount),
    }),
  ),
  stale_steps: z.array(
    z.object({
      deal_id: z.string(),
      name: z.string(),
      company: z.string(),
      next_step: z.string(),
      next_step_due: z.string(),
      owner: z.string(),
    }),
  ),
  windows: z.array(z.number()),
});
export type PipelineChanges = z.infer<typeof changesSchema>;

export function readPipelineChanges(token: string, days = 7) {
  return fetchHqJson("hq/pipeline/changes", changesSchema, {
    token,
    query: { days: String(days) },
  });
}

// --- the forecast ------------------------------------------------------------------------------

const forecastLine = z.object({
  deal_id: z.string(),
  name: z.string(),
  company: z.string(),
  company_id: z.string(),
  stage: z.string(),
  category: z.string(),
  category_label: z.string(),
  overridden: z.boolean(),
  amount,
  close_date: z.string(),
  push_count: z.number(),
  closed_at: z.string().nullable(),
});
export type ForecastLine = z.infer<typeof forecastLine>;

const frozenDeal = z.object({
  deal_id: z.string(),
  name: z.string(),
  company: z.string(),
  category: z.string(),
  amount,
});

const submissionSchema = z.object({
  id: z.string(),
  period: z.string(),
  currency: z.string(),
  commit: amount,
  best_case: amount,
  closed_then: amount,
  pipeline_then: amount,
  note: z.string(),
  by: z.string(),
  at: z.string().nullable(),
  deals: z.array(frozenDeal),
  result: z
    .object({
      accuracy: z.number().nullable(),
      bias: z.number().nullable(),
      miss: amount,
      actual: amount,
      hit: z.array(frozenDeal),
      missed: z.array(frozenDeal),
    })
    .nullable(),
});
export type ForecastSubmission = z.infer<typeof submissionSchema>;

const forecastSchema = okEnvelope.extend({
  period: z.string(),
  periods: z.array(z.string()),
  currency: z.string(),
  currencies: z.array(z.string()),
  starts_on: z.string(),
  ends_on: z.string(),
  ended: z.boolean(),
  goal: amount.nullable(),
  won: amount,
  gap: amount.nullable(),
  open: z.object({ commit: amount, best_case: amount, pipeline: amount, total: amount }),
  coverage: z.number().nullable(),
  suggested: z.object({ commit: amount, best_case: amount }),
  deals: z.array(forecastLine),
  won_deals: z.array(forecastLine),
  undated_open: z.number(),
  submissions: z.array(submissionSchema),
  history: z.array(
    z.object({
      period: z.string(),
      call: amount,
      actual: amount,
      accuracy: z.number().nullable(),
      bias: z.number().nullable(),
      miss: amount,
      deals_won: z.number(),
    }),
  ),
  categories: z.array(option),
});
export type Forecast = z.infer<typeof forecastSchema>;

export function readForecast(token: string, query: { period?: string; currency?: string } = {}) {
  const filtered: Record<string, string> = {};
  for (const [name, value] of Object.entries(query)) if (value) filtered[name] = value;
  return fetchHqJson("hq/forecast", forecastSchema, { token, query: filtered });
}

export function submitForecast(token: string, body: Record<string, string>) {
  return postHqJson("hq/forecast/submit", okEnvelope.extend({ submission: submissionSchema }), {
    token,
    body,
  });
}

export function setTarget(token: string, body: Record<string, string>) {
  return postHqJson(
    "hq/forecast/targets/update",
    okEnvelope.extend({ period: z.string(), currency: z.string(), amount }),
    { token, body },
  );
}

// --- competitors -------------------------------------------------------------------------------

export const competitorSchema = z.object({
  id: z.string(),
  name: z.string(),
  website: z.string(),
  summary: z.string(),
  quick_dismiss: z.string(),
  why_we_win: z.string(),
  why_we_lose: z.string(),
  objections: z.array(z.object({ objection: z.string(), response: z.string() })),
  reviewed_at: z.string().nullable(),
  reviewed_by: z.string(),
  stale: z.boolean(),
  record: z.object({
    won: z.number(),
    closed: z.number(),
    open: z.number(),
    text: z.string(),
  }),
});
export type Competitor = z.infer<typeof competitorSchema>;

export function readCompetitors(token: string) {
  return fetchHqJson(
    "hq/competitors",
    okEnvelope.extend({ competitors: z.array(competitorSchema), stale_after_days: z.number() }),
    { token },
  );
}

const competitorDetailSchema = okEnvelope.extend({
  competitor: competitorSchema,
  deals: z.array(
    z.object({
      deal_id: z.string(),
      name: z.string(),
      company: z.string(),
      status: z.string(),
      stage: z.string(),
      state: z.string(),
      strengths: z.string(),
      weaknesses: z.string(),
      loss_detail: z.string(),
    }),
  ),
});
export type CompetitorDetail = z.infer<typeof competitorDetailSchema>;

export function readCompetitor(token: string, competitorId: string) {
  return fetchHqJson(`hq/competitors/${competitorId}`, competitorDetailSchema, { token });
}

export function createCompetitor(token: string, body: Record<string, unknown>) {
  return postHqJson("hq/competitors/create", okEnvelope.extend({ competitor: competitorSchema }), {
    token,
    body,
  });
}

export function updateCompetitor(
  token: string,
  competitorId: string,
  body: Record<string, unknown>,
) {
  return postHqJson(
    `hq/competitors/${competitorId}/update`,
    z.union([
      okEnvelope.extend({ competitor: competitorSchema }),
      okEnvelope.extend({ archived: z.literal(true) }),
    ]),
    { token, body },
  );
}

export const dealCompetitorSchema = z.object({
  competitor_id: z.string(),
  name: z.string(),
  strengths: z.string(),
  weaknesses: z.string(),
  state: z.string(),
  quick_dismiss: z.string(),
  card_stale: z.boolean(),
});
export type DealCompetitor = z.infer<typeof dealCompetitorSchema>;

export function actOnDealCompetitor(token: string, dealId: string, body: Record<string, string>) {
  return postHqJson(
    `hq/deals/${dealId}/competitors`,
    okEnvelope.extend({ competitors: z.array(dealCompetitorSchema) }),
    { token, body },
  );
}

// --- win/loss ----------------------------------------------------------------------------------

export const interviewSchema = z.object({
  id: z.string(),
  deal_id: z.string(),
  deal_name: z.string(),
  company: z.string(),
  outcome: z.string(),
  seller_reason: z.string(),
  seller_detail: z.string(),
  held_on: z.string().nullable(),
  interviewer: z.string(),
  interviewee_name: z.string(),
  interviewee_title: z.string(),
  buyer_reason: z.string(),
  drivers: z.array(z.object({ driver: z.string(), label: z.string(), effect: z.string() })),
  quotes: z.string(),
  summary: z.string(),
});
export type Interview = z.infer<typeof interviewSchema>;

const tallyRow = z.object({
  driver: z.string(),
  label: z.string(),
  positive: z.number(),
  negative: z.number(),
});

const winLossSchema = okEnvelope.extend({
  interviews: z.array(interviewSchema),
  tally: z.object({ won: z.array(tallyRow), lost: z.array(tallyRow) }),
  counts: z.object({ interviews: z.number(), won: z.number(), lost: z.number() }),
  not_interviewed: z.array(
    z.object({
      deal_id: z.string(),
      name: z.string(),
      company: z.string(),
      outcome: z.string(),
      closed_at: z.string().nullable(),
    }),
  ),
  drivers: z.array(option),
});
export type WinLoss = z.infer<typeof winLossSchema>;

export function readWinLoss(token: string) {
  return fetchHqJson("hq/win-loss", winLossSchema, { token });
}

export function recordInterview(token: string, dealId: string, body: Record<string, unknown>) {
  return postHqJson(
    `hq/deals/${dealId}/interviews`,
    okEnvelope.extend({ interview: interviewSchema }),
    { token, body },
  );
}
