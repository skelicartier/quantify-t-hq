import "server-only";

import { z } from "zod";

import { fetchHqJson, postHqJson } from "@/lib/api/core";

const okEnvelope = z.object({ ok: z.literal(true) });

export const RENEWAL_STATUSES = ["commit", "likely", "at_risk", "lost"] as const;
export type RenewalStatus = (typeof RENEWAL_STATUSES)[number];

export const renewalSchema = z.object({
  /** Empty when nobody has said what to expect. */
  status: z.string(),
  confidence: z.number().nullable(),
  forecast_mrr: z.number().nullable(),
  note: z.string(),
  updated_at: z.string().nullable(),
  updated_by: z.string(),
});
export type Renewal = z.infer<typeof renewalSchema>;

export const contractSchema = z.object({
  renewal: renewalSchema,
  contract_id: z.string(),
  company_id: z.string(),
  company_name: z.string(),
  deal_id: z.string(),
  plan_name: z.string(),
  plan_key: z.string(),
  seats: z.number(),
  mrr_amount: z.number(),
  currency: z.string(),
  billing_cadence: z.string(),
  starts_on: z.string().nullable(),
  term_months: z.number(),
  renews_on: z.string().nullable(),
  renews_in_days: z.number().nullable(),
  /** active | ending (notice given, still paying) | ended */
  state: z.enum(["active", "ending", "ended"]),
  ends_on: z.string().nullable(),
  cancel_reason: z.string(),
  notes: z.string(),
  created_at: z.string().nullable(),
  /** Days before the renewal date by which notice must be given; null when none is written. */
  notice_days: z.number().nullable(),
  /** The last day to give notice: the renewal date less the notice period. */
  notice_date: z.string().nullable(),
  playbook_started_at: z.string().nullable(),
});
export type Contract = z.infer<typeof contractSchema>;

const totalsSchema = z.object({
  mrr: z.number(),
  arr: z.number(),
  customers: z.number(),
  arpa: z.number(),
});
export type RevenueTotals = z.infer<typeof totalsSchema>;

const contractsSchema = okEnvelope.extend({
  contracts: z.array(contractSchema),
  /** Per currency, never summed across them. */
  totals: z.record(z.string(), totalsSchema),
  renewing_soon: z.array(contractSchema),
  cancel_reasons: z.array(z.string()),
});
export type ContractsPage = z.infer<typeof contractsSchema>;

export function readContracts(
  token: string,
  filters: { state?: string; company_id?: string } = {},
) {
  const query: Record<string, string> = {};
  for (const [name, value] of Object.entries(filters)) if (value) query[name] = value;
  return fetchHqJson("hq/contracts", contractsSchema, { token, query });
}

export const movementSchema = z.object({
  kind: z.string(),
  amount: z.number(),
  currency: z.string(),
  effective_on: z.string().nullable(),
  note: z.string(),
  contract_id: z.string(),
  company_id: z.string(),
  staff_id: z.string(),
});
export type Movement = z.infer<typeof movementSchema>;

const contractDetailSchema = okEnvelope.extend({
  contract: contractSchema,
  movements: z.array(movementSchema),
  cancel_reasons: z.array(z.string()),
});
export type ContractDetail = z.infer<typeof contractDetailSchema>;

export function readContract(token: string, contractId: string) {
  return fetchHqJson(`hq/contracts/${contractId}`, contractDetailSchema, { token });
}

export function setRenewalForecast(
  token: string,
  contractId: string,
  input: Record<string, unknown>,
) {
  return postHqJson(`hq/contracts/${contractId}/renewal`, contractEnvelope, { token, body: input });
}

export const renewalRowSchema = contractSchema.extend({ weighted_mrr: z.number() });
export type RenewalRow = z.infer<typeof renewalRowSchema>;

const renewalRollupSchema = z.object({
  due_count: z.number(),
  due_mrr: z.number(),
  forecast_mrr: z.number(),
  committed_mrr: z.number(),
  at_risk_mrr: z.number(),
  lost_mrr: z.number(),
  undecided_count: z.number(),
  undecided_mrr: z.number(),
});

const renewalsSchema = okEnvelope.extend({
  currency: z.string(),
  window_days: z.number(),
  today: z.string(),
  renewals: z.array(renewalRowSchema),
  months: z.array(renewalRollupSchema.extend({ month: z.string() })),
  totals: renewalRollupSchema.extend({ overdue_count: z.number(), overdue_mrr: z.number() }),
  statuses: z.array(z.string()),
});
export type RenewalsPage = z.infer<typeof renewalsSchema>;

export function readRenewals(token: string, days = 120, currency = "USD") {
  return fetchHqJson("hq/revenue/renewals", renewalsSchema, {
    token,
    query: { days: String(days), currency },
  });
}

const contractEnvelope = okEnvelope.extend({ contract: contractSchema });

export function createContract(token: string, input: Record<string, unknown>) {
  return postHqJson("hq/contracts/create", contractEnvelope, { token, body: input });
}

export function updateContract(token: string, contractId: string, input: Record<string, unknown>) {
  return postHqJson(`hq/contracts/${contractId}/update`, contractEnvelope, { token, body: input });
}

export function cancelContract(token: string, contractId: string, input: Record<string, unknown>) {
  return postHqJson(`hq/contracts/${contractId}/cancel`, contractEnvelope, { token, body: input });
}

export const bridgeMonthSchema = z.object({
  month: z.string(),
  start: z.number(),
  new: z.number(),
  expansion: z.number(),
  contraction: z.number(),
  churn: z.number(),
  reactivation: z.number(),
  adjustment: z.number(),
  end: z.number(),
  partial: z.boolean(),
});
export type BridgeMonth = z.infer<typeof bridgeMonthSchema>;

const bridgeSchema = okEnvelope.extend({
  currency: z.string(),
  currencies: z.array(z.string()),
  months: z.array(bridgeMonthSchema),
  current: totalsSchema,
  scheduled: z.array(movementSchema),
});
export type MrrBridge = z.infer<typeof bridgeSchema>;

export function readMrrBridge(token: string, currency = "USD", months = 12) {
  return fetchHqJson("hq/revenue/mrr", bridgeSchema, {
    token,
    query: { currency, months: String(months) },
  });
}

export function adjustMrr(token: string, input: Record<string, unknown>) {
  return postHqJson("hq/revenue/adjust", okEnvelope.extend({ adjusted: z.boolean() }), {
    token,
    body: input,
  });
}
