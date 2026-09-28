import "server-only";

import { z } from "zod";

import { fetchHqJson, postHqJson } from "@/lib/api/core";

const okEnvelope = z.object({ ok: z.literal(true) });

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
});
export type Company = z.infer<typeof companySchema>;

const companyRowSchema = companySchema.extend({
  people_count: z.number(),
  open_deals: z.number(),
  /** Null for a role that cannot read revenue. */
  won_mrr: z.number().nullable(),
});
export type CompanyRow = z.infer<typeof companyRowSchema>;

const companiesSchema = okEnvelope.extend({ companies: z.array(companyRowSchema) });

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
});
export type DealSummary = z.infer<typeof dealSummarySchema>;

const companyDetailSchema = okEnvelope.extend({
  company: companySchema,
  people: z.array(personSchema),
  deals: z.array(dealSummarySchema),
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
  people: z.array(personSchema.extend({ company_name: z.string() })),
});

export function readPeople(token: string, q = "") {
  return fetchHqJson("hq/people", peopleSchema, { token, query: q ? { q } : {} });
}

const personDetailSchema = okEnvelope.extend({
  person: personSchema,
  company: companySchema.nullable(),
  activities: z.array(activitySchema),
  open_tasks: z.array(taskSchema),
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

// ---------------------------------------------------------------------------------------
// leads
// ---------------------------------------------------------------------------------------

export const leadSchema = z.object({
  lead_id: z.string(),
  source_key: z.string(),
  email: z.string(),
  full_name: z.string(),
  company_name: z.string(),
  message: z.string(),
  payload: z.record(z.string(), z.unknown()),
  stage: z.string(),
  disqualify_reason: z.string(),
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

const leadsSchema = okEnvelope.extend({
  leads: z.array(leadSchema),
  counts: z.record(z.string(), z.number()),
  stages: z.array(z.string()),
  first_reply_target_minutes: z.number(),
});
export type LeadsPage = z.infer<typeof leadsSchema>;

export function readLeads(
  token: string,
  filters: { stage?: string; source?: string; q?: string } = {},
) {
  const query: Record<string, string> = {};
  for (const [name, value] of Object.entries(filters)) if (value) query[name] = value;
  return fetchHqJson("hq/leads", leadsSchema, { token, query });
}

const leadDetailSchema = okEnvelope.extend({
  lead: leadSchema,
  matches: z.object({
    person: personSchema.nullable(),
    company: companySchema.nullable(),
  }),
  activities: z.array(activitySchema),
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
});
export type PipelineStage = z.infer<typeof pipelineStageSchema>;

const crmSettingsSchema = okEnvelope.extend({
  pipeline: z.array(pipelineStageSchema),
  sources: z.array(z.object({ key: z.string(), label: z.string() })),
  archived_sources: z.array(z.object({ key: z.string(), label: z.string() })),
  /** New leads fall back to these, so they cannot be archived. */
  protected_sources: z.array(z.string()),
  lead_stages: z.array(z.string()),
  disqualify_reasons: z.array(z.string()),
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
