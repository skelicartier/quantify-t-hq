import "server-only";

import { z } from "zod";

import { fetchHqJson, postHqJson } from "@/lib/api/core";

const okEnvelope = z.object({ ok: z.literal(true) });
const option = z.object({ value: z.string(), label: z.string() });

// --- cash and runway -----------------------------------------------------------------------------

export const RUNWAY_STATES = ["ok", "refused", "no_history", "positive"] as const;

const runwaySchema = z.object({
  currency: z.string(),
  cash: z.number(),
  accounts: z.number(),
  as_of: z.string().nullable(),
  burn_per_month: z.number().nullable(),
  runway_months: z.number().nullable(),
  runs_out_on: z.string().nullable(),
  state: z.enum(RUNWAY_STATES),
  reason: z.string(),
});
export type Runway = z.infer<typeof runwaySchema>;

const cashSchema = okEnvelope.extend({
  accounts: z.array(
    z.object({
      account_id: z.string(),
      name: z.string(),
      institution: z.string(),
      currency: z.string(),
      archived: z.boolean(),
      balance: z.number().nullable(),
      as_of: z.string().nullable(),
      stale: z.boolean(),
      history: z.array(
        z.object({
          as_of: z.string(),
          amount: z.number(),
          note: z.string(),
          recorded_by_name: z.string(),
        }),
      ),
    }),
  ),
  runway: z.array(runwaySchema),
  stale_after_days: z.number(),
});
export type CashBoard = z.infer<typeof cashSchema>;

export function readCash(token: string) {
  return fetchHqJson("hq/finance/cash", cashSchema, { token });
}

export function createCashAccount(token: string, body: Record<string, string>) {
  return postHqJson(
    "hq/finance/cash/accounts/create",
    okEnvelope.extend({ account_id: z.string() }),
    {
      token,
      body,
    },
  );
}

export function updateCashAccount(token: string, accountId: string, body: Record<string, unknown>) {
  return postHqJson(
    `hq/finance/cash/accounts/${accountId}/update`,
    okEnvelope.extend({ account_id: z.string() }),
    { token, body },
  );
}

export function recordBalance(token: string, body: Record<string, string>) {
  return postHqJson(
    "hq/finance/cash/balances/record",
    okEnvelope.extend({ corrected: z.boolean() }),
    {
      token,
      body,
    },
  );
}

// --- vendors -----------------------------------------------------------------------------------

export const VENDOR_STATES = ["ok", "decide", "locked", "ending"] as const;

const vendorSchema = z.object({
  vendor_id: z.string(),
  name: z.string(),
  category: z.string(),
  category_label: z.string(),
  owner_staff_id: z.string().nullable(),
  owner_name: z.string(),
  amount: z.number(),
  currency: z.string(),
  billing: z.string(),
  billing_label: z.string(),
  renews_on: z.string().nullable(),
  notice_days: z.number(),
  auto_renews: z.boolean(),
  status: z.string(),
  cancelled_on: z.string().nullable(),
  subprocessor_id: z.string().nullable(),
  contract_ref: z.string(),
  notes: z.string(),
  monthly_equivalent: z.number().nullable(),
  next_renewal: z.string().nullable(),
  cancel_by: z.string().nullable(),
  state: z.enum(VENDOR_STATES),
  reason: z.string(),
});
export type Vendor = z.infer<typeof vendorSchema>;

const vendorsSchema = okEnvelope.extend({
  vendors: z.array(vendorSchema),
  monthly_by_currency: z.record(z.string(), z.number()),
  decide: z.number(),
  categories: z.array(option),
  billing: z.array(option),
  staff: z.array(z.object({ staff_id: z.string(), name: z.string() })),
});
export type VendorBoard = z.infer<typeof vendorsSchema>;

export function readVendors(token: string) {
  return fetchHqJson("hq/finance/vendors", vendorsSchema, { token });
}

const vendorEnvelope = okEnvelope.extend({ vendor: vendorSchema });

export function createVendor(token: string, body: Record<string, unknown>) {
  return postHqJson("hq/finance/vendors/create", vendorEnvelope, { token, body });
}

export function updateVendor(token: string, vendorId: string, body: Record<string, unknown>) {
  return postHqJson(`hq/finance/vendors/${vendorId}/update`, vendorEnvelope, { token, body });
}

// --- expense claims ----------------------------------------------------------------------------

export const CLAIM_STATUSES = ["submitted", "approved", "rejected", "paid", "withdrawn"] as const;

const claimSchema = z.object({
  claim_id: z.string(),
  staff_id: z.string(),
  staff_name: z.string(),
  mine: z.boolean(),
  spent_on: z.string(),
  amount: z.number(),
  currency: z.string(),
  category: z.string(),
  category_label: z.string(),
  description: z.string(),
  receipt_ref: z.string(),
  status: z.enum(CLAIM_STATUSES),
  decided_by_name: z.string(),
  decided_at: z.string().nullable(),
  decision_note: z.string(),
  paid_on: z.string().nullable(),
  created_at: z.string().nullable(),
});
export type ExpenseClaim = z.infer<typeof claimSchema>;

const claimsSchema = okEnvelope.extend({
  claims: z.array(claimSchema),
  can_decide: z.boolean(),
  owed_by_currency: z.record(z.string(), z.number()),
  categories: z.array(option),
});
export type ExpenseBoard = z.infer<typeof claimsSchema>;

export function readExpenses(token: string) {
  return fetchHqJson("hq/finance/expenses", claimsSchema, { token });
}

const claimEnvelope = okEnvelope.extend({ claim: claimSchema });

export function createExpense(token: string, body: Record<string, string>) {
  return postHqJson("hq/finance/expenses/create", claimEnvelope, { token, body });
}

export function actOnExpense(token: string, claimId: string, body: Record<string, string>) {
  return postHqJson(`hq/finance/expenses/${claimId}/act`, claimEnvelope, { token, body });
}

// --- investor updates --------------------------------------------------------------------------

const snapshotSchema = z.object({
  period: z.string(),
  as_of: z.string(),
  mrr: z.record(z.string(), z.number()),
  movements: z.record(z.string(), z.record(z.string(), z.number())),
  paying_customers: z.number(),
  open_deals: z.number(),
  open_pipeline_mrr: z.record(z.string(), z.number()),
  cash: z.array(runwaySchema),
  headcount: z.record(z.string(), z.number()),
});
export type InvestorSnapshot = z.infer<typeof snapshotSchema>;

const updateSummary = z.object({
  update_id: z.string(),
  period: z.string(),
  title: z.string(),
  snapshot_at: z.string().nullable(),
  highlights: z.string(),
  lowlights: z.string(),
  asks: z.string(),
  status: z.enum(["draft", "final"]),
  finalised_by_name: z.string(),
  finalised_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});
const updateSchema = updateSummary.extend({ snapshot: snapshotSchema });
export type InvestorUpdate = z.infer<typeof updateSchema>;

const updatesSchema = okEnvelope.extend({
  updates: z.array(updateSummary),
  suggested_period: z.string(),
});
export type InvestorUpdates = z.infer<typeof updatesSchema>;

export function readInvestorUpdates(token: string) {
  return fetchHqJson("hq/finance/updates", updatesSchema, { token });
}

const updateEnvelope = okEnvelope.extend({ update: updateSchema });

export function readInvestorUpdate(token: string, updateId: string) {
  return fetchHqJson(`hq/finance/updates/${updateId}`, updateEnvelope, { token });
}

export function createInvestorUpdate(token: string, body: Record<string, string>) {
  return postHqJson("hq/finance/updates/create", updateEnvelope, { token, body });
}

export function actOnInvestorUpdate(token: string, updateId: string, body: Record<string, string>) {
  return postHqJson(`hq/finance/updates/${updateId}/act`, updateEnvelope, { token, body });
}
