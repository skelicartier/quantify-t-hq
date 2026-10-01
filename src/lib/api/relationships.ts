import "server-only";

import { z } from "zod";

import { fetchHqJson, postHqJson } from "@/lib/api/core";

const okEnvelope = z.object({ ok: z.literal(true) });
const option = z.object({ value: z.string(), label: z.string() });

// --- references --------------------------------------------------------------------------------

export const REFERENCE_STATES = ["active", "expiring", "expired", "withdrawn"] as const;
export const REFERENCE_KINDS = ["call", "logo", "quote", "case_study"] as const;

const referenceSchema = z.object({
  reference_id: z.string(),
  company_id: z.string(),
  company_name: z.string(),
  person_id: z.string().nullable(),
  person_name: z.string(),
  kinds: z.array(z.enum(REFERENCE_KINDS)),
  kind_labels: z.array(z.string()),
  scope: z.string(),
  given_on: z.string().nullable(),
  expires_on: z.string().nullable(),
  evidence: z.string(),
  state: z.enum(REFERENCE_STATES),
  calls_per_quarter: z.number(),
  calls_this_quarter: z.number(),
  uses: z.number(),
  last_used_on: z.string().nullable(),
  withdrawn_on: z.string().nullable(),
  withdrawn_reason: z.string(),
  recorded_by_name: z.string(),
  created_at: z.string().nullable(),
});
export type Reference = z.infer<typeof referenceSchema>;

const referencesSchema = okEnvelope.extend({
  references: z.array(referenceSchema),
  counts: z.object({
    active: z.number(),
    expiring: z.number(),
    expired: z.number(),
    withdrawn: z.number(),
  }),
  kinds: z.array(option),
});
export type References = z.infer<typeof referencesSchema>;

const referenceDetailSchema = okEnvelope.extend({
  reference: referenceSchema,
  uses: z.array(
    z.object({
      kind: z.string(),
      kind_label: z.string(),
      deal_id: z.string().nullable(),
      deal_name: z.string(),
      used_on: z.string(),
      note: z.string(),
      staff_name: z.string(),
    }),
  ),
});
export type ReferenceDetail = z.infer<typeof referenceDetailSchema>;

export function readReferences(token: string, query: { company_id?: string; kind?: string } = {}) {
  const filtered = Object.fromEntries(Object.entries(query).filter(([, value]) => Boolean(value)));
  return fetchHqJson("hq/references", referencesSchema, { token, query: filtered });
}

export function readReference(token: string, referenceId: string) {
  return fetchHqJson(`hq/references/${referenceId}`, referenceDetailSchema, { token });
}

export function createReference(token: string, body: Record<string, unknown>) {
  return postHqJson("hq/references/create", okEnvelope.extend({ reference: referenceSchema }), {
    token,
    body,
  });
}

export function actOnReference(token: string, referenceId: string, body: Record<string, unknown>) {
  return postHqJson(
    `hq/references/${referenceId}/act`,
    referenceDetailSchema.extend({ task_created: z.boolean().optional() }),
    { token, body },
  );
}

// --- business reviews --------------------------------------------------------------------------

const reviewSummary = z.object({
  review_id: z.string(),
  company_id: z.string(),
  company_name: z.string(),
  period_start: z.string(),
  period_end: z.string(),
  title: z.string(),
  status: z.enum(["draft", "final"]),
  held_on: z.string().nullable(),
  snapshot_at: z.string().nullable(),
  finalised_by_name: z.string(),
  finalised_at: z.string().nullable(),
  created_by_name: z.string(),
  updated_at: z.string().nullable(),
});
export type ReviewSummary = z.infer<typeof reviewSummary>;

const moneySchema = z.record(
  z.string(),
  z.object({ opening: z.number(), closing: z.number(), moves: z.record(z.string(), z.number()) }),
);

const snapshotSchema = z.object({
  period_start: z.string(),
  period_end: z.string(),
  as_of: z.string(),
  seats_paid: z.number(),
  usage: z.object({
    seats_paid: z.number(),
    accounts: z.number(),
    active_30d: z.number(),
    last_sign_in: z.string().nullable(),
    live: z.boolean(),
  }),
  usage_read_on: z.string(),
  signals: z.array(z.object({ label: z.string(), rule: z.string(), evidence: z.string() })),
  money: moneySchema.nullable(),
  tickets: z
    .object({
      opened: z.number(),
      resolved: z.number(),
      open_at_end: z.number(),
      answered: z.number(),
      median_first_reply_hours: z.number().nullable(),
      slowest_first_reply_hours: z.number().nullable(),
    })
    .nullable(),
  tickets_note: z.string(),
  asks: z.object({ in_period: z.number(), blockers: z.number(), requests: z.array(z.string()) }),
  shipped: z.array(z.object({ title: z.string(), shipped_on: z.string() })),
  renewal: z
    .object({ renews_on: z.string(), notice_date: z.string().nullable(), status: z.string() })
    .nullable(),
  onboarding: z
    .object({
      starts_on: z.string().nullable(),
      live_on: z.string().nullable(),
      durations: z.object({
        to_kickoff: z.number().nullable(),
        to_first_sign_in: z.number().nullable(),
        to_live: z.number().nullable(),
        total: z.number().nullable(),
      }),
    })
    .nullable(),
});
export type ReviewSnapshot = z.infer<typeof snapshotSchema>;

const reviewSchema = reviewSummary.extend({
  snapshot: snapshotSchema,
  goals: z.string(),
  wins: z.string(),
  risks: z.string(),
  actions: z.string(),
  attendees: z.string(),
  can_edit: z.boolean(),
});
export type Review = z.infer<typeof reviewSchema>;

const companyReviewsSchema = okEnvelope.extend({
  reviews: z.array(reviewSummary),
  suggested: z.object({ period_start: z.string(), period_end: z.string(), title: z.string() }),
  can_create: z.boolean(),
});
export type CompanyReviews = z.infer<typeof companyReviewsSchema>;

const reviewEnvelope = okEnvelope.extend({ review: reviewSchema });

export function readCompanyReviews(token: string, companyId: string) {
  return fetchHqJson(`hq/companies/${companyId}/reviews`, companyReviewsSchema, { token });
}

export function createReview(token: string, companyId: string, body: Record<string, string>) {
  return postHqJson(`hq/companies/${companyId}/reviews/create`, reviewEnvelope, { token, body });
}

export function readReview(token: string, reviewId: string) {
  return fetchHqJson(`hq/reviews/${reviewId}`, reviewEnvelope, { token });
}

export function actOnReview(token: string, reviewId: string, body: Record<string, string>) {
  return postHqJson(`hq/reviews/${reviewId}/act`, reviewEnvelope, { token, body });
}
