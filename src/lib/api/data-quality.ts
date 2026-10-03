import "server-only";

import { z } from "zod";

import { fetchHqJson, postHqJson } from "@/lib/api/core";
import { dismissalSchema, leadJobSchema, leadSchema } from "@/lib/api/crm";

const okEnvelope = z.object({ ok: z.literal(true) });

// ---------------------------------------------------------------------------------------
// look-alike leads
// ---------------------------------------------------------------------------------------

/** What the review shows of a lead: enough to decide which one to keep. */
const leadBriefSchema = z.object({
  lead_id: z.string(),
  origin: z.string(),
  full_name: z.string(),
  email: z.string(),
  email_kind: z.string(),
  company_name: z.string(),
  title: z.string(),
  firm_type: z.string(),
  country: z.string(),
  stage: z.string(),
  owner_staff_id: z.string(),
  verified_state: z.string(),
  verified_at: z.string().nullable(),
  firm_domain: z.string(),
  fit_band: z.string(),
  fit_score: z.number(),
  created_at: z.string().nullable(),
  first_replied_at: z.string().nullable(),
  converted_person_id: z.string(),
  emails_sent: z.number(),
  last_emailed_at: z.string().nullable(),
});
export type LeadBrief = z.infer<typeof leadBriefSchema>;

const personBriefSchema = z.object({
  person_id: z.string(),
  full_name: z.string(),
  email: z.string(),
  title: z.string(),
  company_id: z.string(),
  company_name: z.string(),
  do_not_contact: z.boolean(),
});
export type PersonBrief = z.infer<typeof personBriefSchema>;

const leadGroupSchema = z.object({
  key: z.string(),
  /** Codes; the words for each are `reasons` on the page. */
  reasons: z.array(z.string()),
  /** The lead the review would keep: one who wrote in, then the furthest worked, … */
  keep: z.string(),
  leads: z.array(leadBriefSchema),
  /** CRM people the group's leads already are. */
  people: z.array(personBriefSchema),
});
export type LeadGroup = z.infer<typeof leadGroupSchema>;

const leadDuplicatesSchema = okEnvelope.extend({
  groups: z.array(leadGroupSchema),
  total: z.number(),
  matched: z.number(),
  with_people: z.number(),
  by_reason: z.record(z.string(), z.number()),
  reasons: z.record(z.string(), z.string()),
  offset: z.number(),
  limit: z.number(),
  dismissed: z.array(dismissalSchema),
  dismissed_total: z.number(),
});
export type LeadDuplicates = z.infer<typeof leadDuplicatesSchema>;

/**
 * `reason` is a reason code, or `crm` (a CRM person is in the group) or `leads`; `lead`
 * keeps the groups one lead is in.
 */
export function readLeadDuplicates(
  token: string,
  filters: { reason?: string; offset?: number; lead?: string },
) {
  const query: Record<string, string> = {};
  if (filters.reason) query.reason = filters.reason;
  if (filters.lead) query.lead = filters.lead;
  if (filters.offset) query.offset = String(filters.offset);
  return fetchHqJson("hq/leads/duplicates", leadDuplicatesSchema, { token, query });
}

const mergeFieldSchema = z.object({
  key: z.string(),
  label: z.string(),
  values: z.array(z.object({ lead_id: z.string(), value: z.string() })),
  /** The lead whose value stays unless someone picks another. */
  chosen: z.string(),
  /** More than one different value: a choice to make. */
  differs: z.boolean(),
  result: z.string(),
});
export type MergeField = z.infer<typeof mergeFieldSchema>;

const mergePreviewSchema = okEnvelope.extend({
  keep: leadBriefSchema,
  folds: z.array(leadBriefSchema),
  fields: z.array(mergeFieldSchema),
  after: z.object({
    stage: z.string(),
    tags: z.array(z.string()),
    notes: z.string(),
    first_replied_at: z.string().nullable(),
  }),
  /** What moves onto the kept lead from the folded ones. */
  moves: z.object({ activities: z.number(), tasks: z.number() }),
  max_fold: z.number(),
});
export type MergePreview = z.infer<typeof mergePreviewSchema>;

export function readMergePreview(token: string, keep: string, fold: readonly string[]) {
  return fetchHqJson("hq/leads/merge-preview", mergePreviewSchema, {
    token,
    query: { keep, fold: fold.join(",") },
  });
}

/** Fold leads into `keep`: a fresh code, like every merge. `choose` maps a field to a lead. */
export function mergeLeads(
  token: string,
  keep: string,
  fold: readonly string[],
  choose: Record<string, string>,
) {
  return postHqJson(
    `hq/leads/${keep}/merge`,
    okEnvelope.extend({
      lead: leadSchema,
      folded: z.array(z.string()),
      moved: z.record(z.string(), z.number()),
    }),
    { token, body: { fold, choose } },
  );
}

/** Leads that are a CRM person already, marked as that person's duplicates. */
export function markLeadsAsPerson(token: string, leadIds: readonly string[], personId: string) {
  return postHqJson(
    "hq/leads/duplicates/person",
    okEnvelope.extend({
      marked: z.array(z.string()),
      person_id: z.string(),
      filled: z.array(z.string()),
    }),
    { token, body: { lead_ids: leadIds, person_id: personId } },
  );
}

/** "Not the same": for a group of leads (with the CRM people in it), companies or people. */
export function dismissDuplicates(
  token: string,
  input: {
    kind: "lead" | "company" | "person";
    ids: readonly string[];
    person_ids?: readonly string[];
    reason?: string;
  },
) {
  return postHqJson(
    "hq/crm/duplicates/dismiss",
    okEnvelope.extend({ key: z.string(), dismissed: z.boolean() }),
    { token, body: input },
  );
}

export function restoreDuplicates(token: string, key: string) {
  return postHqJson(
    "hq/crm/duplicates/restore",
    okEnvelope.extend({ key: z.string(), restored: z.boolean() }),
    { token, body: { key } },
  );
}

// ---------------------------------------------------------------------------------------
// the data's health
// ---------------------------------------------------------------------------------------

/** Where the records behind a count can be seen in full, when a list can show them. */
const checkViewSchema = z.object({
  list: z.string(),
  conditions: z.array(z.string()).optional(),
  reason: z.string().optional(),
});
export type CheckView = z.infer<typeof checkViewSchema>;

const healthCheckSchema = z.object({
  key: z.string(),
  area: z.string(),
  label: z.string(),
  why: z.string(),
  count: z.number(),
  /** What the count is out of. */
  of: z.number(),
  /** "ok" at nought; otherwise "attention" or "danger". */
  tone: z.string(),
  view: checkViewSchema.nullable(),
  /** A tidy-up that puts it right in bulk, after a preview: "name_case" or "country". */
  fix: z.string(),
  /** A few of the records, when no list can show them all. */
  sample: z.array(
    z.object({ kind: z.string(), id: z.string(), label: z.string(), sub: z.string() }),
  ),
  week_ago: z.number().nullable(),
  month_ago: z.number().nullable(),
});
export type HealthCheck = z.infer<typeof healthCheckSchema>;

const dataHealthSchema = okEnvelope.extend({
  as_of: z.string().nullable(),
  areas: z.array(z.string()),
  checks: z.array(healthCheckSchema),
  /** Days of counts kept; the trend needs a week of them. */
  history_days: z.number(),
  quiet_days: z.number(),
  fixes: z.array(z.string()),
});
export type DataHealth = z.infer<typeof dataHealthSchema>;

export function readDataHealth(token: string) {
  return fetchHqJson("hq/data/health", dataHealthSchema, { token });
}

const standardisePreviewSchema = okEnvelope.extend({
  kind: z.string(),
  count: z.number(),
  changes: z.array(
    z.object({
      lead_id: z.string(),
      label: z.string(),
      field: z.string(),
      from: z.string(),
      to: z.string(),
    }),
  ),
  inline_limit: z.number(),
});
export type StandardisePreview = z.infer<typeof standardisePreviewSchema>;

/** Every change a tidy-up would make; the first hundred leads' changes are listed. */
export function readStandardisePreview(token: string, kind: string) {
  return fetchHqJson("hq/data/standardise", standardisePreviewSchema, {
    token,
    query: { kind },
  });
}

export function applyStandardise(token: string, kind: string) {
  return postHqJson(
    "hq/data/standardise/apply",
    okEnvelope.extend({
      kind: z.string(),
      matched: z.number(),
      changed: z.number(),
      unchanged: z.number().optional(),
      skipped: z.number().optional(),
      queued: z.boolean(),
      job: leadJobSchema.nullable(),
    }),
    { token, body: { kind } },
  );
}
