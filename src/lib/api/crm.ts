import "server-only";

import { z } from "zod";

import { fetchHqJson, postHqJson } from "@/lib/api/core";
import { customFieldSchema, customMapSchema, customValueSchema } from "@/lib/api/fields";

const okEnvelope = z.object({ ok: z.literal(true) });

/**
 * Money the service totals for us, per currency and never added across: a deal in euros
 * and one in dollars are two figures, and `{}` is "nothing to total".
 */
export const moneyByCurrencySchema = z.record(z.string(), z.number());
export type MoneyByCurrency = z.infer<typeof moneyByCurrencySchema>;

// ---------------------------------------------------------------------------------------
// companies
// ---------------------------------------------------------------------------------------

export const companySchema = z.object({
  company_id: z.string(),
  name: z.string(),
  domain: z.string(),
  firm_type: z.string(),
  team_size_band: z.string(),
  country: z.string(),
  lifecycle: z.string(),
  owner_staff_id: z.string(),
  source_key: z.string(),
  notes: z.string(),
  customer_since: z.string().nullable(),
  archived: z.boolean(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
  /** The group this company belongs to, if any. */
  parent_id: z.string().default(""),
});
export type Company = z.infer<typeof companySchema>;

const companyRowSchema = companySchema.extend({
  people_count: z.number(),
  open_deals: z.number(),
  /** What the ledger says the company pays today, per currency; null for a role that cannot read revenue. */
  mrr: moneyByCurrencySchema.nullable(),
  /** Custom field values this reader may see: key → what the list shows. */
  custom: customMapSchema.default({}),
});
export type CompanyRow = z.infer<typeof companyRowSchema>;

const companiesSchema = okEnvelope.extend({
  companies: z.array(companyRowSchema),
  custom_fields: z.array(customFieldSchema).default([]),
});
export type CompaniesPage = z.infer<typeof companiesSchema>;

export function readCompanies(token: string, q = "") {
  return fetchHqJson("hq/companies", companiesSchema, { token, query: q ? { q } : {} });
}

export const personSchema = z.object({
  person_id: z.string(),
  company_id: z.string(),
  full_name: z.string(),
  email: z.string(),
  title: z.string(),
  role_category: z.string(),
  phone: z.string(),
  account_user_id: z.string(),
  do_not_contact: z.boolean(),
  source_key: z.string(),
  notes: z.string(),
  last_contacted_at: z.string().nullable(),
  created_at: z.string().nullable(),
});
export type Person = z.infer<typeof personSchema>;

export const activitySchema = z.object({
  kind: z.string(),
  at: z.string().nullable(),
  staff_id: z.string(),
  staff_name: z.string(),
  body: z.string(),
  company_id: z.string(),
  person_id: z.string(),
  deal_id: z.string(),
  lead_id: z.string(),
});
export type Activity = z.infer<typeof activitySchema>;

export const taskSchema = z.object({
  /** Present on listings (tasks page, Home); empty on a record's own page. */
  record_label: z.string().default(""),
  task_id: z.string(),
  title: z.string(),
  body: z.string(),
  status: z.string(),
  priority: z.string(),
  due_on: z.string().nullable(),
  assignee_staff_id: z.string(),
  company_id: z.string(),
  person_id: z.string(),
  deal_id: z.string(),
  lead_id: z.string(),
  ticket_id: z.string(),
  origin: z.string(),
  completed_at: z.string().nullable(),
  created_at: z.string().nullable(),
});
export type Task = z.infer<typeof taskSchema>;

export const dealSummarySchema = z.object({
  deal_id: z.string(),
  name: z.string(),
  company_id: z.string(),
  primary_person_id: z.string(),
  stage_key: z.string(),
  stage_label: z.string(),
  status: z.string(),
  /** Money is null for a role that cannot read revenue; the pipeline itself is not. */
  mrr_amount: z.number().nullable(),
  currency: z.string(),
  /** The price-list plan that priced it, when one did. */
  plan_key: z.string(),
  seats: z.number(),
  win_probability: z.number(),
  weighted_mrr: z.number().nullable(),
  expected_close_date: z.string(),
  next_step: z.string(),
  next_step_due: z.string(),
  owner_staff_id: z.string(),
  source_key: z.string(),
  days_in_stage: z.number(),
  idle_days: z.number(),
  flags: z.array(z.string()),
  loss_reason: z.string(),
  loss_competitor: z.string(),
  loss_detail: z.string(),
  closed_at: z.string().nullable(),
  created_at: z.string().nullable(),
  /** The category in effect: the one a person set, else the stage's. */
  forecast_category: z.string(),
  /** What a person set on the deal; empty when the stage decides. */
  forecast_override: z.string(),
  /** How many times the close date has moved into a later month. */
  push_count: z.number(),
  first_close_date: z.string(),
  /** An open deal whose next step has not changed in a week. */
  next_step_stale: z.boolean(),
});
export type DealSummary = z.infer<typeof dealSummarySchema>;

const companyDetailSchema = okEnvelope.extend({
  company: companySchema,
  parent: z.object({ company_id: z.string(), name: z.string() }).nullable().default(null),
  children: z
    .array(
      z.object({
        company_id: z.string(),
        name: z.string(),
        lifecycle: z.string(),
        mrr: moneyByCurrencySchema.nullable(),
      }),
    )
    .default([]),
  /** Own MRR plus the children's; null without children or without revenue:read. */
  group_mrr: moneyByCurrencySchema.nullable().default(null),
  people: z.array(personSchema),
  deals: z.array(dealSummarySchema),
  mrr: moneyByCurrencySchema.nullable(),
  accounts: z.array(
    z.object({
      account_user_id: z.string(),
      email: z.string(),
      plan: z.string(),
      is_active: z.boolean(),
      last_login_at: z.string().nullable(),
      profile_available: z.boolean(),
    }),
  ),
  open_tasks: z.array(taskSchema),
  activities: z.array(activitySchema),
  custom_fields: z.array(customValueSchema).default([]),
});
export type CompanyDetail = z.infer<typeof companyDetailSchema>;

export function readCompany(token: string, companyId: string) {
  return fetchHqJson(`hq/companies/${companyId}`, companyDetailSchema, { token });
}

const companyEnvelope = okEnvelope.extend({ company: companySchema });

export function createCompany(token: string, input: Record<string, unknown>) {
  return postHqJson("hq/companies/create", companyEnvelope, { token, body: input });
}

export function updateCompany(token: string, companyId: string, input: Record<string, unknown>) {
  return postHqJson(`hq/companies/${companyId}/update`, companyEnvelope, { token, body: input });
}

/** Fold `companyId` into `into`; the response is the company that stays. */
export function mergeCompany(token: string, companyId: string, into: string) {
  return postHqJson(
    `hq/companies/${companyId}/merge`,
    companyEnvelope.extend({ moved: z.record(z.string(), z.number()) }),
    { token, body: { into } },
  );
}

const importResultSchema = okEnvelope.extend({
  created: z.array(z.object({ name: z.string() }).passthrough()),
  skipped: z.array(z.object({ row: z.number(), name: z.string(), reason: z.string() })),
  invalid: z.array(z.object({ row: z.number(), reason: z.string() })),
  rows: z.number(),
});
export type ImportResult = z.infer<typeof importResultSchema>;

export function importCompanies(
  token: string,
  rows: readonly Record<string, string>[],
  reason: string,
) {
  return postHqJson("hq/companies/import", importResultSchema, { token, body: { rows, reason } });
}

export function importPeople(
  token: string,
  rows: readonly Record<string, string>[],
  reason: string,
) {
  return postHqJson("hq/people/import", importResultSchema, { token, body: { rows, reason } });
}

/** A group someone judged "not the same", remembered by its exact records. */
export const dismissalSchema = z.object({
  key: z.string(),
  kind: z.string(),
  record_ids: z.array(z.string()),
  reason: z.string(),
  dismissed_by: z.object({ staff_id: z.string(), name: z.string() }).nullable(),
  dismissed_at: z.string().nullable(),
});
export type Dismissal = z.infer<typeof dismissalSchema>;

const duplicatesSchema = okEnvelope.extend({
  groups: z.array(
    z.object({
      kind: z.enum(["company", "person"]),
      /** The group's records, as a "not the same" judgement remembers them. */
      key: z.string(),
      reason: z.string(),
      records: z.array(
        z.object({
          company_id: z.string().optional(),
          person_id: z.string().optional(),
          name: z.string().optional(),
          full_name: z.string().optional(),
          domain: z.string().optional(),
          lifecycle: z.string().optional(),
          email: z.string().optional(),
          company_name: z.string().optional(),
        }),
      ),
    }),
  ),
  companies: z.number(),
  people: z.number(),
  /** Groups judged "not the same", newest first. */
  dismissed: z.array(dismissalSchema),
});
export type DuplicateGroups = z.infer<typeof duplicatesSchema>;

/** Likely duplicates for a person to judge; nothing is merged by reading this. */
export function readDuplicates(token: string) {
  return fetchHqJson("hq/crm/duplicates", duplicatesSchema, { token });
}

export const mentionSchema = z.object({
  mention_id: z.string(),
  by_staff_id: z.string(),
  by_name: z.string(),
  entity_type: z.string(),
  entity_id: z.string(),
  excerpt: z.string(),
  at: z.string().nullable(),
  seen_at: z.string().nullable(),
});
export type Mention = z.infer<typeof mentionSchema>;

export function readMentions(token: string, unseenOnly = false) {
  return fetchHqJson(
    "hq/mentions",
    okEnvelope.extend({ mentions: z.array(mentionSchema), unseen: z.number() }),
    { token, query: unseenOnly ? { unseen: "1" } : {} },
  );
}

export function markMentionSeen(token: string, mentionId: string) {
  return postHqJson(`hq/mentions/${mentionId}/seen`, okEnvelope.extend({ seen: z.boolean() }), {
    token,
    body: {},
  });
}

export function linkCompanyAccount(token: string, companyId: string, accountUserId: string) {
  return postHqJson(
    `hq/companies/${companyId}/link-account`,
    okEnvelope.extend({ linked: z.boolean() }),
    {
      token,
      body: { account_user_id: accountUserId },
    },
  );
}

// ---------------------------------------------------------------------------------------
// people
// ---------------------------------------------------------------------------------------

const peopleSchema = okEnvelope.extend({
  people: z.array(
    personSchema.extend({ company_name: z.string(), custom: customMapSchema.default({}) }),
  ),
  custom_fields: z.array(customFieldSchema).default([]),
});

export function readPeople(token: string, q = "") {
  return fetchHqJson("hq/people", peopleSchema, { token, query: q ? { q } : {} });
}

const personDetailSchema = okEnvelope.extend({
  person: personSchema,
  company: companySchema.nullable(),
  activities: z.array(activitySchema),
  open_tasks: z.array(taskSchema),
  custom_fields: z.array(customValueSchema).default([]),
});
export type PersonDetail = z.infer<typeof personDetailSchema>;

export function readPerson(token: string, personId: string) {
  return fetchHqJson(`hq/people/${personId}`, personDetailSchema, { token });
}

const personEnvelope = okEnvelope.extend({ person: personSchema });

export function createPerson(token: string, input: Record<string, unknown>) {
  return postHqJson("hq/people/create", personEnvelope, { token, body: input });
}

export function updatePerson(token: string, personId: string, input: Record<string, unknown>) {
  return postHqJson(`hq/people/${personId}/update`, personEnvelope, { token, body: input });
}

/** Fold `personId` into `into`; the response is the person that stays. */
export function mergePerson(token: string, personId: string, into: string) {
  return postHqJson(
    `hq/people/${personId}/merge`,
    personEnvelope.extend({ moved: z.record(z.string(), z.number()) }),
    { token, body: { into } },
  );
}

// ---------------------------------------------------------------------------------------
// leads
// ---------------------------------------------------------------------------------------

export const leadSchema = z.object({
  lead_id: z.string(),
  /** "inbound": they wrote to us and a reply is owed. "prospect": we found them. */
  origin: z.string(),
  source_key: z.string(),
  email: z.string(),
  full_name: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  title: z.string(),
  company_name: z.string(),
  firm_type: z.string(),
  website: z.string(),
  country: z.string(),
  /** The region the country sits in; empty when there is no country. */
  region: z.string(),
  city: z.string(),
  phone: z.string(),
  registration_no: z.string(),
  /** The public page the address was read from. */
  source_url: z.string(),
  /** "named", "role" (a shared mailbox) or "personal-domain" (free mail); empty if unjudged. */
  email_kind: z.string(),
  notes: z.string(),
  tags: z.array(z.string()),
  /** "" (never checked), "valid", "risky" or "invalid". */
  verified_state: z.string(),
  /** The verifier's own word ("catch_all", "unknown"), kept beside the state. */
  verified_detail: z.string(),
  verified_at: z.string().nullable(),
  /** The firm as a web domain: what "one person per firm" and a firm's stop go by. */
  firm_domain: z.string(),
  /** How often, and when last, the address was written to. */
  emails_sent: z.number(),
  last_emailed_at: z.string().nullable(),
  import_id: z.string(),
  /** The name of the file the lead came in with; empty when it was typed in. */
  import_label: z.string(),
  /** Fit under the rules in settings, computed when the lead is read. */
  fit_score: z.number(),
  fit_band: z.string(),
  fit_reasons: z.array(z.string()),
  message: z.string(),
  payload: z.record(z.string(), z.unknown()),
  stage: z.string(),
  disqualify_reason: z.string(),
  /** Folded into another lead ("lead"), or found to be a CRM person ("person"). */
  duplicate_of_kind: z.string(),
  duplicate_of_id: z.string(),
  owner_staff_id: z.string(),
  first_replied_at: z.string().nullable(),
  waiting_minutes: z.number().nullable(),
  first_reply_overdue: z.boolean(),
  converted_company_id: z.string(),
  converted_person_id: z.string(),
  converted_deal_id: z.string(),
  created_at: z.string().nullable(),
  /** Set when retention emptied the personal fields; the lead is kept for the counts. */
  anonymised_at: z.string().nullable(),
});
export type Lead = z.infer<typeof leadSchema>;

const facetSchema = z.array(z.object({ value: z.string(), count: z.number() }));
export type Facet = z.infer<typeof facetSchema>;

const leadsSchema = okEnvelope.extend({
  leads: z.array(leadSchema.extend({ custom: customMapSchema.default({}) })),
  /** Per stage, over everything the origin has — not only the page or the filter. */
  counts: z.record(z.string(), z.number()),
  stages: z.array(z.string()),
  first_reply_target_minutes: z.number(),
  custom_fields: z.array(customFieldSchema).default([]),
  origin: z.string(),
  /** How many the filters kept; `leads` is one page of them. */
  total: z.number(),
  offset: z.number(),
  limit: z.number(),
  has_more: z.boolean(),
  sort: z.string(),
  conditions: z.array(z.object({ field: z.string(), op: z.string(), value: z.string() })),
  /** How what the filters kept breaks down, field by field. */
  facets: z.record(z.string(), facetSchema),
  fields: z.array(z.object({ key: z.string(), label: z.string() })),
  ops: z.array(z.string()),
});
export type LeadsPage = z.infer<typeof leadsSchema>;

export type LeadFilters = {
  stage?: string;
  source?: string;
  q?: string;
  origin?: "inbound" | "prospect" | "";
  sort?: string;
  limit?: number;
  offset?: number;
  /** `field:op:value` conditions; all must hold. */
  conditions?: readonly string[];
};

export function readLeads(token: string, filters: LeadFilters = {}) {
  const query: Record<string, string> = {};
  for (const name of ["stage", "source", "q", "origin", "sort"] as const) {
    const value = filters[name];
    if (value) query[name] = value;
  }
  if (filters.limit) query.limit = String(filters.limit);
  if (filters.offset) query.offset = String(filters.offset);
  if (filters.conditions?.length) query.conditions = JSON.stringify(filters.conditions);
  return fetchHqJson("hq/leads", leadsSchema, { token, query });
}

const leadDetailSchema = okEnvelope.extend({
  lead: leadSchema,
  matches: z.object({
    person: personSchema.nullable(),
    company: companySchema.nullable(),
  }),
  activities: z.array(activitySchema),
  first_reply_target_minutes: z.number().optional(),
  custom_fields: z.array(customValueSchema).default([]),
  /** The file the lead came in with, when it came in with one. */
  import: z
    .object({ import_id: z.string(), label: z.string(), started_at: z.string().nullable() })
    .nullable()
    .default(null),
  /** What this lead was folded into, or the CRM person it already is, by name. */
  duplicate_of: z
    .object({ kind: z.string(), id: z.string(), label: z.string(), exists: z.boolean() })
    .nullable()
    .default(null),
});
export type LeadDetail = z.infer<typeof leadDetailSchema>;

export function readLead(token: string, leadId: string) {
  return fetchHqJson(`hq/leads/${leadId}`, leadDetailSchema, { token });
}

const leadEnvelope = okEnvelope.extend({ lead: leadSchema });

export function createLead(token: string, input: Record<string, unknown>) {
  return postHqJson("hq/leads/create", leadEnvelope, { token, body: input });
}

export function updateLead(token: string, leadId: string, input: Record<string, unknown>) {
  return postHqJson(`hq/leads/${leadId}/update`, leadEnvelope, { token, body: input });
}

const convertedSchema = okEnvelope.extend({
  company_id: z.string(),
  person_id: z.string(),
  deal_id: z.string(),
});

export function convertLead(token: string, leadId: string, input: Record<string, unknown>) {
  return postHqJson(`hq/leads/${leadId}/convert`, convertedSchema, { token, body: input });
}

// -- prospects: a file in, its history, one change across a set, what the data suggests --

const leadImportResultSchema = okEnvelope.extend({
  import_id: z.string(),
  /** True when nothing was written: the same accounting, as a rehearsal. */
  dry_run: z.boolean(),
  rows: z.number(),
  created: z.number(),
  updated: z.number(),
  unchanged: z.number(),
  skipped: z.array(z.object({ row: z.number(), email: z.string(), reason: z.string() })),
  skipped_count: z.number(),
  invalid: z.number(),
});
export type LeadImportResult = z.infer<typeof leadImportResultSchema>;

/** One part of a file: at most a thousand mapped rows. Every row comes back accounted for. */
export function importLeads(token: string, input: Record<string, unknown>) {
  return postHqJson("hq/leads/import", leadImportResultSchema, { token, body: input });
}

const leadImportSchema = z.object({
  import_id: z.string(),
  label: z.string(),
  source_key: z.string(),
  reason: z.string(),
  rows: z.number(),
  created: z.number(),
  updated: z.number(),
  skipped: z.number(),
  invalid: z.number(),
  by: z.object({ staff_id: z.string(), name: z.string() }).nullable(),
  started_at: z.string().nullable(),
  rolled_back_at: z.string().nullable(),
  rolled_back_count: z.number(),
  /** Leads still carrying this import: what taking it back would look at. */
  remaining: z.number(),
  /** What came of the file's addresses so far, from the mail ledger and the stop list. */
  health: z.object({
    written_to: z.number(),
    bounced: z.number(),
    clicked: z.number(),
    stopped: z.number(),
  }),
});
export type LeadImport = z.infer<typeof leadImportSchema>;

const leadImportsSchema = okEnvelope.extend({
  imports: z.array(leadImportSchema),
  max_rows: z.number(),
  max_leads: z.number(),
  skip_reasons: z.array(z.string()),
  /** What a verifier's file may say, by the state each word is read as. */
  verification_words: z.record(z.string(), z.array(z.string())),
  max_verification_rows: z.number(),
});
export type LeadImportsPage = z.infer<typeof leadImportsSchema>;

export function readLeadImports(token: string) {
  return fetchHqJson("hq/leads/imports", leadImportsSchema, { token });
}

export function rollbackLeadImport(token: string, importId: string, reason: string) {
  return postHqJson(
    `hq/leads/imports/${importId}/rollback`,
    okEnvelope.extend({ removed: z.number(), kept: z.number(), import_id: z.string() }),
    { token, body: { reason } },
  );
}

/** A change to a whole view, run in the background because one request could not carry it. */
export const leadJobSchema = z.object({
  job_id: z.string(),
  /** "queued", "running", "done", "cancelled" or "failed". */
  state: z.string(),
  set: z.record(z.string(), z.unknown()),
  described: z.record(z.string(), z.unknown()),
  matched: z.number(),
  processed: z.number(),
  changed: z.number(),
  unchanged: z.number(),
  skipped: z.number(),
  created_by: z.object({ staff_id: z.string(), name: z.string() }).nullable(),
  created_at: z.string().nullable(),
  started_at: z.string().nullable(),
  finished_at: z.string().nullable(),
  last_error: z.string(),
});
export type LeadJob = z.infer<typeof leadJobSchema>;

const leadBulkSchema = okEnvelope.extend({
  matched: z.number(),
  changed: z.number(),
  unchanged: z.number(),
  skipped: z.number(),
  /** More leads than a request can carry: the change goes on in the background as `job`. */
  queued: z.boolean(),
  job: leadJobSchema.nullable(),
});
export type LeadBulkResult = z.infer<typeof leadBulkSchema>;

/** One change to chosen rows (`ids`) or to everything a filter matches. */
export function bulkLeads(token: string, input: Record<string, unknown>) {
  return postHqJson("hq/leads/bulk", leadBulkSchema, { token, body: input });
}

export function readLeadJobs(token: string) {
  return fetchHqJson(
    "hq/leads/jobs",
    okEnvelope.extend({
      jobs: z.array(leadJobSchema),
      recent: z.array(leadJobSchema),
      inline_limit: z.number(),
    }),
    { token },
  );
}

/** One job's progress. Reading it moves it along a little: whoever watches it, works it. */
export function readLeadJob(token: string, jobId: string) {
  return fetchHqJson(`hq/leads/jobs/${jobId}`, okEnvelope.extend({ job: leadJobSchema }), {
    token,
  });
}

export function cancelLeadJob(token: string, jobId: string) {
  return postHqJson(`hq/leads/jobs/${jobId}/cancel`, okEnvelope.extend({ job: leadJobSchema }), {
    token,
    body: {},
  });
}

const leadSuggestionSchema = z.object({
  name: z.string(),
  conditions: z.array(z.string()),
  count: z.number(),
  /** The saved segment asking the same question, when there is one. */
  segment_id: z.string(),
});
export type LeadSuggestion = z.infer<typeof leadSuggestionSchema>;

const leadSuggestionsSchema = okEnvelope.extend({
  suggestions: z.array(leadSuggestionSchema),
  prospects: z.number(),
  minimum: z.number(),
});
export type LeadSuggestionsPage = z.infer<typeof leadSuggestionsSchema>;

export function readLeadSuggestions(token: string) {
  return fetchHqJson("hq/leads/suggestions", leadSuggestionsSchema, { token });
}

const pointsSchema = z.record(z.string(), z.number());
export const fitRulesSchema = z.object({
  firm_type: pointsSchema,
  email_kind: pointsSchema,
  title_words: pointsSchema,
  country: pointsSchema,
  named_person: z.number(),
  bands: z.object({ A: z.number(), B: z.number() }),
});
export type FitRules = z.infer<typeof fitRulesSchema>;

const leadSettingsSchema = okEnvelope.extend({
  rules: fitRulesSchema,
  defaults: fitRulesSchema,
  customised: z.boolean(),
  /** How the prospects fall into A, B and C under the rules as they stand. */
  bands: z.record(z.string(), z.number()),
  prospects: z.number(),
  firm_types: facetSchema,
  countries: facetSchema,
  email_kinds: z.array(z.string()),
  read_at: z.string().nullable(),
});
export type LeadSettings = z.infer<typeof leadSettingsSchema>;

export function readLeadSettings(token: string) {
  return fetchHqJson("hq/settings/leads", leadSettingsSchema, { token });
}

export function updateLeadSettings(token: string, input: Record<string, unknown>) {
  return postHqJson(
    "hq/settings/leads/update",
    leadSettingsSchema.extend({ updated: z.boolean() }),
    { token, body: input },
  );
}

// -- cold mail: a verifier's answer onto the leads, and who may be written to first --

const leadVerificationResultSchema = okEnvelope.extend({
  rows: z.number(),
  updated: z.number(),
  /** The same result again: only the date moved. */
  unchanged: z.number(),
  not_found: z.number(),
  unknown_result: z.number(),
  counts: z.object({ valid: z.number(), risky: z.number(), invalid: z.number() }),
  problems: z.array(z.object({ row: z.number(), email: z.string(), reason: z.string() })),
});
export type LeadVerificationResult = z.infer<typeof leadVerificationResultSchema>;

/** One part of a verifier's file: `{email, result}` per row. A result never creates a lead. */
export function importLeadVerification(token: string, input: Record<string, unknown>) {
  return postHqJson("hq/leads/verification/import", leadVerificationResultSchema, {
    token,
    body: input,
  });
}

const coldRulesSchema = z.object({
  require_verified: z.boolean(),
  allow_risky: z.boolean(),
  skip_role_like: z.boolean(),
  one_per_firm: z.boolean(),
  /** Off by default: a campaign through the provider leaves prospects out. */
  provider_campaigns: z.boolean(),
  verify_stale_days: z.number(),
  max_stale_days: z.number(),
});
export type ColdRules = z.infer<typeof coldRulesSchema>;

const coldJurisdictionSchema = z.object({
  /** Empty for the row that counts leads with no country. */
  country: z.string(),
  /** "opt_out", "consent" or "hold". */
  rule: z.string(),
  rule_label: z.string(),
  note: z.string(),
  subject_prefix: z.string(),
  /** "admin", "default" or "nobody". */
  set_by: z.string(),
  default_rule: z.string(),
  prospects: z.number(),
});
export type ColdJurisdiction = z.infer<typeof coldJurisdictionSchema>;

const coldSettingsSchema = okEnvelope.extend({
  /** The connected mailboxes a first email goes from, and their room together today. */
  mailboxes: z.object({ sending: z.number(), warming: z.number(), capacity_today: z.number() }),
  rules: coldRulesSchema,
  jurisdictions: z.array(coldJurisdictionSchema),
  rule_labels: z.record(z.string(), z.string()),
  /** Each refusal's code and the sentence a person reads beside its count. */
  reasons: z.record(z.string(), z.string()),
  prospects: z.number(),
  /** Judged one by one: how many a first email could reach today. */
  mailable: z.number(),
  mailable_firms: z.number(),
  /** What one send would take: everyone allowed, or one person per firm. */
  first_send: z.number(),
  held_by_reason: z.record(z.string(), z.number()),
  verified: z.record(z.string(), z.number()),
});
export type ColdSettings = z.infer<typeof coldSettingsSchema>;

export function readColdSettings(token: string) {
  return fetchHqJson("hq/settings/cold", coldSettingsSchema, { token });
}

/** A switch, the stale window or one country's rule; always with a reason. */
export function updateColdSettings(token: string, input: Record<string, unknown>) {
  return postHqJson(
    "hq/settings/cold/update",
    coldSettingsSchema.extend({ updated: z.boolean() }),
    { token, body: input },
  );
}

// ---------------------------------------------------------------------------------------
// activities and tasks
// ---------------------------------------------------------------------------------------

const activitiesSchema = okEnvelope.extend({ activities: z.array(activitySchema) });

export function readActivities(
  token: string,
  filter: Partial<Record<"company_id" | "person_id" | "deal_id" | "lead_id", string>>,
) {
  const query: Record<string, string> = {};
  for (const [name, value] of Object.entries(filter)) if (value) query[name] = value;
  return fetchHqJson("hq/activities", activitiesSchema, { token, query });
}

export function logActivity(token: string, input: Record<string, unknown>) {
  return postHqJson("hq/activities/log", okEnvelope.extend({ logged: z.boolean() }), {
    token,
    body: input,
  });
}

const tasksSchema = okEnvelope.extend({
  tasks: z.array(taskSchema),
  counts: z.object({ overdue: z.number(), open: z.number() }),
});
export type TasksPage = z.infer<typeof tasksSchema>;

export function readTasks(token: string, filters: { scope?: string; status?: string } = {}) {
  const query: Record<string, string> = {};
  for (const [name, value] of Object.entries(filters)) if (value) query[name] = value;
  return fetchHqJson("hq/tasks", tasksSchema, { token, query });
}

const taskEnvelope = okEnvelope.extend({ task: taskSchema });

export function createTask(token: string, input: Record<string, unknown>) {
  return postHqJson("hq/tasks/create", taskEnvelope, { token, body: input });
}

export function updateTask(token: string, taskId: string, input: Record<string, unknown>) {
  return postHqJson(`hq/tasks/${taskId}/update`, taskEnvelope, { token, body: input });
}

// ---------------------------------------------------------------------------------------
// CRM settings (pipeline, sources, vocabularies)
// ---------------------------------------------------------------------------------------

export const pipelineStageSchema = z.object({
  key: z.string(),
  label: z.string(),
  position: z.number(),
  win_probability: z.number(),
  stale_after_days: z.number(),
  outcome: z.string(),
  exit_criteria: z.string(),
  /** What a deal needs before it enters, and the order rules; older services send none. */
  required_fields: z.array(z.string()).default([]),
  allow_skip: z.boolean().default(true),
  allow_back: z.boolean().default(true),
});
export type PipelineStage = z.infer<typeof pipelineStageSchema>;

export const planSchema = z.object({
  key: z.string(),
  name: z.string(),
  /** Per seat, per month, in the plan's currency. */
  unit_amount: z.number(),
  currency: z.string(),
  billing_cadence: z.string(),
  min_seats: z.number(),
  archived: z.boolean(),
});
export type Plan = z.infer<typeof planSchema>;

const crmSettingsSchema = okEnvelope.extend({
  plans: z.array(planSchema),
  archived_plans: z.array(planSchema),
  pipeline: z.array(pipelineStageSchema),
  sources: z.array(z.object({ key: z.string(), label: z.string() })),
  archived_sources: z.array(z.object({ key: z.string(), label: z.string() })),
  /** New leads fall back to these, so they cannot be archived. */
  protected_sources: z.array(z.string()),
  lead_stages: z.array(z.string()),
  disqualify_reasons: z.array(z.string()),
  stage_requirements: z.array(z.object({ key: z.string(), label: z.string() })).default([]),
});
export type CrmSettings = z.infer<typeof crmSettingsSchema>;

export function readCrmSettings(token: string) {
  return fetchHqJson("hq/settings/crm", crmSettingsSchema, { token });
}

export function updatePipelineStage(token: string, input: Record<string, unknown>) {
  return postHqJson(
    "hq/settings/pipeline/update",
    okEnvelope.extend({ updated: z.boolean(), key: z.string() }),
    { token, body: input },
  );
}
