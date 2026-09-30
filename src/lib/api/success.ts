import "server-only";

import { z } from "zod";

import { fetchHqJson, postHqJson } from "@/lib/api/core";

const okEnvelope = z.object({ ok: z.literal(true) });
const option = z.object({ value: z.string(), label: z.string() });
/** Money as exact decimal text per currency; empty for a role that does not see money. */
const moneyByCurrency = z.record(z.string(), z.string());

// --- customers and their signals ---------------------------------------------------------------

export const signalSchema = z.object({
  key: z.string(),
  label: z.string(),
  rule: z.string(),
  evidence: z.string(),
});
export type Signal = z.infer<typeof signalSchema>;

export const usageSchema = z.object({
  seats_paid: z.number(),
  accounts: z.number(),
  active_30d: z.number(),
  last_sign_in: z.string().nullable(),
  live: z.boolean(),
});
export type Usage = z.infer<typeof usageSchema>;

export const customerSchema = z.object({
  company: z.object({ id: z.string(), name: z.string() }),
  owner: z.string(),
  mrr: moneyByCurrency,
  usage: usageSchema,
  renews_on: z.string().nullable(),
  notice_date: z.string().nullable(),
  renewal_status: z.string(),
  signals: z.array(signalSchema),
});
export type Customer = z.infer<typeof customerSchema>;

const successSchema = okEnvelope.extend({
  customers: z.array(customerSchema),
  counts: z.record(z.string(), z.number()),
  signals: z.array(z.object({ key: z.string(), label: z.string() })),
  rules: z.object({
    active_days: z.number(),
    silent_days: z.number(),
    quiet_days: z.number(),
    renewal_days: z.number(),
  }),
});
export type SuccessBoard = z.infer<typeof successSchema>;

export function readSuccess(token: string) {
  return fetchHqJson("hq/success", successSchema, { token });
}

// --- onboarding ----------------------------------------------------------------------------------

export const onboardingSchema = z.object({
  id: z.string(),
  company: z.object({ id: z.string(), name: z.string() }),
  contract_id: z.string(),
  owner: z.object({ id: z.string(), name: z.string() }).nullable(),
  starts_on: z.string().nullable(),
  kickoff_on: z.string().nullable(),
  first_sign_in_on: z.string().nullable(),
  live_on: z.string().nullable(),
  target_live_on: z.string().nullable(),
  status: z.string(),
  notes: z.string(),
  durations: z.object({
    to_kickoff: z.number().nullable(),
    to_first_sign_in: z.number().nullable(),
    to_live: z.number().nullable(),
    total: z.number().nullable(),
  }),
  steps: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      due_on: z.string().nullable(),
      done_on: z.string().nullable(),
    }),
  ),
  steps_done: z.number(),
});
export type Onboarding = z.infer<typeof onboardingSchema>;

const onboardingsSchema = okEnvelope.extend({
  onboardings: z.array(onboardingSchema.extend({ usage: usageSchema, suggest: z.string() })),
  not_started: z.array(
    z.object({ company_id: z.string(), company_name: z.string(), starts_on: z.string() }),
  ),
  default_steps: z.array(z.string()),
});
export type Onboardings = z.infer<typeof onboardingsSchema>;

export function readOnboardings(token: string) {
  return fetchHqJson("hq/onboardings", onboardingsSchema, { token });
}

export function startOnboarding(token: string, body: Record<string, string>) {
  return postHqJson("hq/onboardings/create", okEnvelope.extend({ onboarding: onboardingSchema }), {
    token,
    body,
  });
}

export function actOnOnboarding(token: string, onboardingId: string, body: Record<string, string>) {
  return postHqJson(
    `hq/onboardings/${onboardingId}/act`,
    okEnvelope.extend({ onboarding: onboardingSchema }),
    { token, body },
  );
}

// --- a firm's page ---------------------------------------------------------------------------------

const companySuccessSchema = okEnvelope.extend({
  customer: customerSchema,
  customer_of_ours: z.boolean(),
  onboardings: z.array(onboardingSchema),
  asks: z.array(
    z.object({
      request_id: z.string(),
      title: z.string(),
      status: z.string(),
      importance: z.string(),
      quote: z.string(),
      recorded_at: z.string().nullable(),
    }),
  ),
});
export type CompanySuccess = z.infer<typeof companySuccessSchema>;

export function readCompanySuccess(token: string, companyId: string) {
  return fetchHqJson(`hq/companies/${companyId}/success`, companySuccessSchema, { token });
}

// --- feature requests ----------------------------------------------------------------------------

export const featureRequestSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  status: z.string(),
  status_label: z.string(),
  shipped_on: z.string().nullable(),
  declined_reason: z.string(),
  owner: z.object({ id: z.string(), name: z.string() }).nullable(),
  created_at: z.string().nullable(),
  asks: z.number(),
  firms: z.number(),
  blockers: z.number(),
  deals_blocked: z.number(),
  open_deals: z.number(),
  mrr: moneyByCurrency,
  pipeline: moneyByCurrency,
});
export type FeatureRequest = z.infer<typeof featureRequestSchema>;

export function readFeatureRequests(token: string, status = "") {
  return fetchHqJson(
    "hq/feature-requests",
    okEnvelope.extend({ requests: z.array(featureRequestSchema), statuses: z.array(option) }),
    { token, query: status ? { status } : {} },
  );
}

const askSchema = z.object({
  id: z.string(),
  company: z.object({ id: z.string(), name: z.string() }),
  person: z.object({ id: z.string(), name: z.string(), email: z.string() }).nullable(),
  source: z.string(),
  quote: z.string(),
  importance: z.string(),
  importance_label: z.string(),
  deal: z.object({ id: z.string(), name: z.string(), status: z.string() }).nullable(),
  recorded_by: z.string(),
  recorded_at: z.string().nullable(),
  notified_at: z.string().nullable(),
});
export type FeatureAsk = z.infer<typeof askSchema>;

const requestDetailSchema = okEnvelope.extend({
  request: featureRequestSchema,
  asks: z.array(askSchema),
  to_tell: z.number(),
  draft: z.object({ subject: z.string(), body: z.string() }),
  mail_ready: z.boolean(),
  may_send: z.boolean(),
  sources: z.array(z.string()),
  importance: z.array(option),
});
export type FeatureRequestDetail = z.infer<typeof requestDetailSchema>;

export function readFeatureRequest(token: string, requestId: string) {
  return fetchHqJson(`hq/feature-requests/${requestId}`, requestDetailSchema, { token });
}

export function createFeatureRequest(token: string, body: Record<string, string>) {
  return postHqJson(
    "hq/feature-requests/create",
    okEnvelope.extend({ request: featureRequestSchema }),
    { token, body },
  );
}

export function updateFeatureRequest(
  token: string,
  requestId: string,
  body: Record<string, string>,
) {
  return postHqJson(
    `hq/feature-requests/${requestId}/update`,
    okEnvelope.extend({ updated: z.literal(true) }),
    { token, body },
  );
}

export function addAsk(token: string, requestId: string, body: Record<string, string>) {
  return postHqJson(
    `hq/feature-requests/${requestId}/asks`,
    okEnvelope.extend({ ask_id: z.string() }),
    { token, body },
  );
}

export function shipFeatureRequest(token: string, requestId: string, body: Record<string, string>) {
  return postHqJson(
    `hq/feature-requests/${requestId}/ship`,
    okEnvelope.extend({ shipped_on: z.string(), told: z.number(), skipped: z.number() }),
    { token, body },
  );
}

// --- renewal playbooks -----------------------------------------------------------------------------

export function startPlaybook(token: string, contractId: string) {
  return postHqJson(
    `hq/contracts/${contractId}/playbook`,
    okEnvelope.extend({ tasks: z.number(), notice_date: z.string().nullable() }),
    { token, body: {} },
  );
}
