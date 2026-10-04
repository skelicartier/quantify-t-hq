import "server-only";

import { z } from "zod";

import { letterheadSchema } from "@/lib/api/company";
import { fetchHqJson, postHqJson } from "@/lib/api/core";

const okEnvelope = z.object({ ok: z.literal(true) });

// --- quotes ------------------------------------------------------------------------------------

export const QUOTE_STATES = [
  "draft",
  "pending_approval",
  "changes_requested",
  "approved",
  "published",
  "accepted",
  "declined",
  "withdrawn",
  "expired",
] as const;
export const APPROVAL_TIERS = ["none", "peer", "admin"] as const;
export const QUOTE_VIEWS = ["open", "waiting", "mine", "all"] as const;
export type QuoteView = (typeof QUOTE_VIEWS)[number];

const summarySchema = z.object({
  quote_id: z.string(),
  deal_id: z.string(),
  deal_name: z.string(),
  company_name: z.string(),
  number: z.string(),
  title: z.string(),
  currency: z.string(),
  term_months: z.number(),
  valid_until: z.string().nullable(),
  status: z.string(),
  state: z.enum(QUOTE_STATES),
  state_label: z.string(),
  is_primary: z.boolean(),
  approval_tier: z.enum(APPROVAL_TIERS),
  tier_label: z.string(),
  list_recurring: z.number(),
  net_recurring: z.number(),
  list_one_off: z.number(),
  net_one_off: z.number(),
  first_term_value: z.number(),
  discount_pct: z.number(),
  deepest_discount_pct: z.number(),
  created_by_name: z.string(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
  waiting_on_you: z.boolean(),
});
export type QuoteSummary = z.infer<typeof summarySchema>;

const lineSchema = z.object({
  line_id: z.string(),
  position: z.number(),
  kind: z.enum(["recurring", "one_off"]),
  plan_key: z.string().nullable(),
  description: z.string(),
  quantity: z.number(),
  list_unit: z.number(),
  unit_price: z.number(),
  list_total: z.number(),
  net_total: z.number(),
  discount_pct: z.number(),
  off_list: z.boolean(),
  list_now: z.number().nullable(),
  list_changed: z.boolean(),
});
export type QuoteLine = z.infer<typeof lineSchema>;

/** A link its customer opens to read the quote and accept or decline it (0070). */
const quoteLinkSchema = z.object({
  link_id: z.string(),
  state: z.enum(["live", "expired", "revoked", "accepted", "declined"]),
  created_by_name: z.string(),
  created_at: z.string().nullable(),
  expires_at: z.string().nullable(),
  views: z.number(),
  first_viewed_at: z.string().nullable(),
  last_viewed_at: z.string().nullable(),
  answer: z.string(),
  answered_at: z.string().nullable(),
  answer_name: z.string(),
});
export type QuoteLink = z.infer<typeof quoteLinkSchema>;

const quoteSchema = summarySchema.extend({
  terms: z.string(),
  lines: z.array(lineSchema),
  list_changed: z.boolean(),
  tier_reason: z.string(),
  submitted_by_name: z.string(),
  submitted_at: z.string().nullable(),
  decided_by_name: z.string(),
  decided_at: z.string().nullable(),
  decision_note: z.string(),
  published_by_name: z.string(),
  published_at: z.string().nullable(),
  accepted_at: z.string().nullable(),
  signer_name: z.string(),
  signer_email: z.string(),
  signed_on: z.string().nullable(),
  signature_ref: z.string(),
  declined_reason: z.string(),
  approvers: z.array(z.string()),
  can: z.object({
    edit: z.boolean(),
    submit: z.boolean(),
    recall: z.boolean(),
    approve: z.boolean(),
    request_changes: z.boolean(),
    publish: z.boolean(),
    accept: z.boolean(),
    decline: z.boolean(),
    withdraw: z.boolean(),
    make_primary: z.boolean(),
    revise: z.boolean(),
    /** A customer link can be made now: the quote is sent and valid, and the role sells. */
    link: z.boolean().optional(),
  }),
  links: z.array(quoteLinkSchema).optional(),
});
export type Quote = z.infer<typeof quoteSchema>;

const planChoice = z.object({
  key: z.string(),
  name: z.string(),
  unit_amount: z.number(),
  currency: z.string(),
  min_seats: z.number(),
});
export type PlanChoice = z.infer<typeof planChoice>;

const quotesSchema = okEnvelope.extend({
  quotes: z.array(summarySchema),
  view: z.enum(QUOTE_VIEWS),
  counts: z.object({ open: z.number(), waiting: z.number(), mine: z.number(), all: z.number() }),
});
export type QuotesList = z.infer<typeof quotesSchema>;

const dealQuotesSchema = okEnvelope.extend({
  quotes: z.array(summarySchema),
  plans: z.array(planChoice),
  currency: z.string(),
  can_create: z.boolean(),
  peer_above: z.number(),
  admin_above: z.number(),
});
export type DealQuotes = z.infer<typeof dealQuotesSchema>;

const quoteEnvelope = okEnvelope.extend({ quote: quoteSchema });
const quoteReadSchema = quoteEnvelope.extend({
  plans: z.array(planChoice),
  peer_above: z.number(),
  admin_above: z.number(),
});
export type QuoteRead = z.infer<typeof quoteReadSchema>;

export function readQuotes(token: string, view: QuoteView = "open") {
  return fetchHqJson("hq/quotes", quotesSchema, { token, query: { view } });
}

export function readQuote(token: string, quoteId: string) {
  return fetchHqJson(`hq/quotes/${quoteId}`, quoteReadSchema, { token });
}

export function readDealQuotes(token: string, dealId: string) {
  return fetchHqJson(`hq/deals/${dealId}/quotes`, dealQuotesSchema, { token });
}

export function createQuote(token: string, dealId: string, body: Record<string, unknown>) {
  return postHqJson(`hq/deals/${dealId}/quotes/create`, quoteEnvelope, { token, body });
}

export function updateQuote(token: string, quoteId: string, body: Record<string, unknown>) {
  return postHqJson(
    `hq/quotes/${quoteId}/update`,
    quoteEnvelope.extend({ approval_cancelled: z.boolean() }),
    { token, body },
  );
}

export function actOnQuote(token: string, quoteId: string, body: Record<string, string>) {
  return postHqJson(
    `hq/quotes/${quoteId}/act`,
    quoteEnvelope.extend({ deal_updated: z.boolean().optional() }),
    { token, body },
  );
}

// --- the mutual action plan --------------------------------------------------------------------

export const STEP_STATES = ["open", "due_soon", "overdue", "done"] as const;

const stepSchema = z.object({
  step_id: z.string(),
  position: z.number(),
  title: z.string(),
  side: z.enum(["us", "them"]),
  owner_staff_id: z.string().nullable(),
  owner_name: z.string(),
  contact_name: z.string(),
  due_on: z.string().nullable(),
  done_at: z.string().nullable(),
  done_by_name: z.string(),
  notes: z.string(),
  state: z.enum(STEP_STATES),
});
export type PlanStep = z.infer<typeof stepSchema>;

const planSchema = okEnvelope.extend({
  steps: z.array(stepSchema),
  summary: z.object({
    total: z.number(),
    done: z.number(),
    overdue: z.number(),
    their_overdue: z.number(),
    ends_on: z.string().nullable(),
    close_date: z.string().nullable(),
    after_close: z.boolean(),
  }),
  can_edit: z.boolean(),
  staff: z.array(z.object({ staff_id: z.string(), name: z.string() })),
  template: z.array(
    z.object({ title: z.string(), side: z.enum(["us", "them"]), days_from_close: z.number() }),
  ),
});
export type DealPlan = z.infer<typeof planSchema>;

export function readDealPlan(token: string, dealId: string) {
  return fetchHqJson(`hq/deals/${dealId}/plan`, planSchema, { token });
}

export function actOnDealPlan(token: string, dealId: string, body: Record<string, string>) {
  return postHqJson(`hq/deals/${dealId}/plan/act`, planSchema, { token, body });
}

// --- the customer's link ------------------------------------------------------------------

export const QUOTE_TOKEN = /^hqq_[A-Za-z0-9_-]{20,80}$/;

/** A link for the customer; the address leaves once, here, as the thing to send. */
export function createQuoteLink(token: string, quoteId: string, days: number) {
  return postHqJson(
    `hq/quotes/${quoteId}/links/create`,
    okEnvelope.extend({ link: quoteLinkSchema, url: z.string() }),
    { token, body: { days } },
  );
}

export function revokeQuoteLink(token: string, quoteId: string, linkId: string) {
  return postHqJson(
    `hq/quotes/${quoteId}/links/${linkId}/revoke`,
    okEnvelope.extend({ links: z.array(quoteLinkSchema) }),
    { token, body: {} },
  );
}

const publicQuoteSchema = okEnvelope.extend({
  letterhead: letterheadSchema,
  quote: z.object({
    number: z.string(),
    title: z.string(),
    customer: z.string(),
    currency: z.string(),
    term_months: z.number(),
    valid_until: z.string().nullable(),
    terms: z.string(),
    lines: z.array(
      z.object({
        description: z.string(),
        kind: z.enum(["recurring", "one_off"]),
        quantity: z.number(),
        unit_price: z.number(),
        total: z.number(),
      }),
    ),
    net_recurring: z.number(),
    net_one_off: z.number(),
    first_term_value: z.number(),
  }),
  /** open: it can be answered here; accepted / declined: answered; expired: past its date. */
  state: z.enum(["open", "accepted", "declined", "expired", "withdrawn", "published"]),
  signer_name: z.string(),
  signed_on: z.string().nullable(),
});
export type PublicQuote = z.infer<typeof publicQuoteSchema>;

/** The customer's view, read with the token alone. */
export function readPublicQuote(quoteToken: string) {
  const safeToken = encodeURIComponent(quoteToken);
  return fetchHqJson(`public/quotes/${safeToken}`, publicQuoteSchema);
}

export function acceptPublicQuote(
  quoteToken: string,
  body: { name: string; email: string; agree: boolean },
) {
  const safeToken = encodeURIComponent(quoteToken);
  return postHqJson(`public/quotes/${safeToken}/accept`, publicQuoteSchema, { body });
}

export function declinePublicQuote(quoteToken: string, body: { name: string; reason: string }) {
  const safeToken = encodeURIComponent(quoteToken);
  return postHqJson(`public/quotes/${safeToken}/decline`, publicQuoteSchema, { body });
}
