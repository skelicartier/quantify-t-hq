import "server-only";

import { z } from "zod";

import { fetchHqJson, postHqJson } from "@/lib/api/core";

const okEnvelope = z.object({ ok: z.literal(true) });
const option = z.object({ value: z.string(), label: z.string() });
export type TrustOption = z.infer<typeof option>;
const staffOption = z.object({ staff_id: z.string(), name: z.string() });
export type TrustStaff = z.infer<typeof staffOption>;
const event = z.object({
  kind: z.string(),
  detail: z.string(),
  by: z.string(),
  at: z.string().nullable(),
});
export type TrustEvent = z.infer<typeof event>;

export const BANDS = ["critical", "high", "medium", "low"] as const;

// --- the overview ------------------------------------------------------------------------------

const dueItem = z.object({
  register: z.string(),
  record_id: z.string(),
  title: z.string(),
  reason: z.string(),
  due_on: z.string().nullable(),
});
export type TrustDue = z.infer<typeof dueItem>;

const overviewSchema = okEnvelope.extend({
  due: z.array(dueItem),
  registers: z.object({
    risks: z.object({ live: z.number(), critical: z.number(), high: z.number() }),
    findings: z.object({ open: z.number(), overdue: z.number() }),
    changes: z.object({ last_30_days: z.number(), waiting: z.number() }),
    suppliers: z.object({ total: z.number(), due: z.number() }),
    continuity: z.object({ last_performed_on: z.string().nullable(), due: z.number() }),
    answers: z.object({ approved: z.number(), draft: z.number(), expired: z.number() }),
    processing: z.object({ current: z.number(), owed: z.number() }),
  }),
});
export type TrustOverview = z.infer<typeof overviewSchema>;

export function readTrustOverview(token: string) {
  return fetchHqJson("hq/trust", overviewSchema, { token });
}

// --- risks -------------------------------------------------------------------------------------

const riskSchema = z.object({
  risk_id: z.string(),
  title: z.string(),
  description: z.string(),
  category: z.string(),
  category_label: z.string(),
  likelihood: z.number(),
  impact: z.number(),
  score: z.number(),
  band: z.enum(BANDS),
  owner_staff_id: z.string().nullable(),
  owner_name: z.string(),
  treatment: z.string(),
  treatment_label: z.string(),
  treatment_plan: z.string(),
  status: z.string(),
  review_due: z.string().nullable(),
  review_overdue: z.boolean(),
  last_reviewed_at: z.string().nullable(),
  decided_by_name: z.string(),
  decision_reason: z.string(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});
export type Risk = z.infer<typeof riskSchema>;

const riskOptions = {
  categories: z.array(option),
  treatments: z.array(option),
  review_days: z.record(z.string(), z.number()),
  staff: z.array(staffOption),
};

const risksSchema = okEnvelope.extend({
  risks: z.array(riskSchema),
  show: z.string(),
  heat: z.array(z.array(z.number())),
  counts: z.record(z.string(), z.number()),
  overdue: z.number(),
  ...riskOptions,
});
export type RiskRegister = z.infer<typeof risksSchema>;

export function readRisks(token: string, show = "") {
  return fetchHqJson("hq/trust/risks", risksSchema, { token, query: { show } });
}

const riskDetailSchema = okEnvelope.extend({
  risk: riskSchema,
  events: z.array(event),
  can_accept_critical: z.boolean(),
  ...riskOptions,
});
export type RiskDetail = z.infer<typeof riskDetailSchema>;

export function readRisk(token: string, riskId: string) {
  return fetchHqJson(`hq/trust/risks/${riskId}`, riskDetailSchema, { token });
}

export function createRisk(token: string, body: Record<string, string>) {
  return postHqJson("hq/trust/risks/create", okEnvelope.extend({ risk: riskSchema }), {
    token,
    body,
  });
}

export function actOnRisk(token: string, riskId: string, body: Record<string, string>) {
  return postHqJson(`hq/trust/risks/${riskId}/act`, okEnvelope.extend({ risk: riskSchema }), {
    token,
    body,
  });
}

// --- findings ----------------------------------------------------------------------------------

const findingSchema = z.object({
  finding_id: z.string(),
  title: z.string(),
  description: z.string(),
  source: z.string(),
  source_label: z.string(),
  severity: z.enum(BANDS),
  owner_staff_id: z.string().nullable(),
  owner_name: z.string(),
  found_on: z.string().nullable(),
  due_on: z.string().nullable(),
  days_left: z.number().nullable(),
  overdue: z.boolean(),
  status: z.string(),
  fixed_on: z.string().nullable(),
  evidence: z.string(),
  decided_by_name: z.string(),
  decision_reason: z.string(),
  continuity_test_id: z.string().nullable(),
  created_at: z.string().nullable(),
});
export type Finding = z.infer<typeof findingSchema>;

const findingOptions = {
  sources: z.array(option),
  severities: z.array(z.string()),
  windows: z.record(z.string(), z.number()),
  staff: z.array(staffOption),
};

const findingsSchema = okEnvelope.extend({
  findings: z.array(findingSchema),
  show: z.string(),
  open: z.number(),
  overdue: z.number(),
  by_severity: z.record(z.string(), z.number()),
  ...findingOptions,
});
export type FindingRegister = z.infer<typeof findingsSchema>;

export function readFindings(token: string, show = "") {
  return fetchHqJson("hq/trust/findings", findingsSchema, { token, query: { show } });
}

const continuitySchema = z.object({
  test_id: z.string(),
  kind: z.string(),
  kind_label: z.string(),
  scenario: z.string(),
  performed_on: z.string().nullable(),
  participants: z.string(),
  outcome: z.string(),
  outcome_label: z.string(),
  target_minutes: z.number().nullable(),
  actual_minutes: z.number().nullable(),
  met_target: z.boolean().nullable(),
  notes: z.string(),
  next_due: z.string().nullable(),
  recorded_by_name: z.string(),
});
export type ContinuityTest = z.infer<typeof continuitySchema>;

const findingDetailSchema = okEnvelope.extend({
  finding: findingSchema,
  continuity_test: continuitySchema.nullable(),
  events: z.array(event),
  can_accept_critical: z.boolean(),
  ...findingOptions,
});
export type FindingDetail = z.infer<typeof findingDetailSchema>;

export function readFinding(token: string, findingId: string) {
  return fetchHqJson(`hq/trust/findings/${findingId}`, findingDetailSchema, { token });
}

export function createFinding(token: string, body: Record<string, string>) {
  return postHqJson("hq/trust/findings/create", okEnvelope.extend({ finding: findingSchema }), {
    token,
    body,
  });
}

export function actOnFinding(token: string, findingId: string, body: Record<string, string>) {
  return postHqJson(
    `hq/trust/findings/${findingId}/act`,
    okEnvelope.extend({ finding: findingSchema }),
    { token, body },
  );
}

// --- production changes ------------------------------------------------------------------------

export const APPROVALS = ["not_needed", "approved", "awaiting", "retrospective"] as const;

const changeSchema = z.object({
  change_id: z.string(),
  title: z.string(),
  description: z.string(),
  kind: z.string(),
  kind_label: z.string(),
  system: z.string(),
  risk: z.string(),
  rollback_plan: z.string(),
  approval: z.enum(APPROVALS),
  approved_by_name: z.string(),
  approved_at: z.string().nullable(),
  happened_at: z.string().nullable(),
  outcome: z.string(),
  outcome_label: z.string(),
  incident_reference: z.string(),
  recorded_by_name: z.string(),
  recorded_by_you: z.boolean(),
  created_at: z.string().nullable(),
});
export type Change = z.infer<typeof changeSchema>;

const changeOptions = {
  kinds: z.array(option),
  risks: z.array(z.string()),
  outcomes: z.array(option),
};

const changesSchema = okEnvelope.extend({
  changes: z.array(changeSchema),
  total: z.number(),
  waiting: z.number(),
  last_30_days: z.object({ count: z.number(), failed: z.number() }),
  kind: z.string(),
  ...changeOptions,
});
export type ChangeLog = z.infer<typeof changesSchema>;

export function readChanges(token: string, filters: { kind?: string; waiting?: boolean } = {}) {
  return fetchHqJson("hq/trust/changes", changesSchema, {
    token,
    query: { kind: filters.kind ?? "", waiting: filters.waiting ? "1" : "" },
  });
}

const changeDetailSchema = okEnvelope.extend({
  change: changeSchema,
  events: z.array(event),
  ...changeOptions,
});
export type ChangeDetail = z.infer<typeof changeDetailSchema>;

export function readChange(token: string, changeId: string) {
  return fetchHqJson(`hq/trust/changes/${changeId}`, changeDetailSchema, { token });
}

export function createChange(token: string, body: Record<string, string>) {
  return postHqJson("hq/trust/changes/create", okEnvelope.extend({ change: changeSchema }), {
    token,
    body,
  });
}

export function actOnChange(token: string, changeId: string, body: Record<string, string>) {
  return postHqJson(
    `hq/trust/changes/${changeId}/act`,
    okEnvelope.extend({ change: changeSchema }),
    { token, body },
  );
}

// --- continuity --------------------------------------------------------------------------------

const planItem = z.object({
  kind: z.string(),
  label: z.string(),
  every_days: z.number(),
  last_performed_on: z.string().nullable(),
  last_outcome: z.string().nullable(),
  next_due: z.string().nullable(),
  state: z.enum(["ok", "due", "not_started"]),
});
export type ContinuityPlanItem = z.infer<typeof planItem>;

const continuityBoardSchema = okEnvelope.extend({
  tests: z.array(
    continuitySchema.extend({
      findings: z.array(
        z.object({ finding_id: z.string(), title: z.string(), status: z.string() }),
      ),
    }),
  ),
  plan: z.array(planItem),
  kinds: z.array(option),
  outcomes: z.array(option),
  severities: z.array(z.string()),
  staff: z.array(staffOption),
});
export type ContinuityBoard = z.infer<typeof continuityBoardSchema>;

export function readContinuity(token: string) {
  return fetchHqJson("hq/trust/continuity", continuityBoardSchema, { token });
}

export function recordContinuityTest(token: string, body: Record<string, string>) {
  return postHqJson(
    "hq/trust/continuity/create",
    okEnvelope.extend({ test: continuitySchema, finding_id: z.string().nullable() }),
    { token, body },
  );
}

// --- suppliers ---------------------------------------------------------------------------------

const supplierSchema = z.object({
  subprocessor_id: z.string(),
  legal_name: z.string(),
  service: z.string(),
  status: z.string(),
  tier: z.string(),
  tier_label: z.string(),
  every_months: z.number(),
  last_reviewed_on: z.string().nullable(),
  last_outcome: z.string().nullable(),
  last_reviewer_name: z.string(),
  next_due: z.string().nullable(),
  state: z.enum(["ok", "due"]),
  reason: z.string(),
  reviews: z.number(),
});
export type Supplier = z.infer<typeof supplierSchema>;

const suppliersSchema = okEnvelope.extend({
  suppliers: z.array(supplierSchema),
  due: z.number(),
  tiers: z.array(option),
  outcomes: z.array(option),
  severities: z.array(z.string()),
});
export type SupplierBoard = z.infer<typeof suppliersSchema>;

export function readSuppliers(token: string) {
  return fetchHqJson("hq/trust/suppliers", suppliersSchema, { token });
}

const supplierDetailSchema = okEnvelope.extend({
  supplier: supplierSchema,
  purpose: z.string(),
  data_categories: z.string(),
  locations: z.string(),
  dpa_signed_on: z.string().nullable(),
  reviews: z.array(
    z.object({
      review_id: z.string(),
      reviewed_on: z.string().nullable(),
      reviewer_name: z.string(),
      outcome: z.string(),
      outcome_label: z.string(),
      evidence: z.string(),
      notes: z.string(),
    }),
  ),
  events: z.array(event),
  tiers: z.array(option),
  outcomes: z.array(option),
  severities: z.array(z.string()),
  staff: z.array(staffOption),
});
export type SupplierDetail = z.infer<typeof supplierDetailSchema>;

export function readSupplier(token: string, subprocessorId: string) {
  return fetchHqJson(`hq/trust/suppliers/${subprocessorId}`, supplierDetailSchema, { token });
}

export function reviewSupplier(
  token: string,
  subprocessorId: string,
  body: Record<string, string>,
) {
  return postHqJson(
    `hq/trust/suppliers/${subprocessorId}/review`,
    okEnvelope.extend({ supplier: supplierSchema, finding_id: z.string().nullable() }),
    { token, body },
  );
}

export function tierSupplier(token: string, subprocessorId: string, body: Record<string, string>) {
  return postHqJson(
    `hq/trust/suppliers/${subprocessorId}/tier`,
    okEnvelope.extend({ supplier: supplierSchema }),
    { token, body },
  );
}

// --- the answer library ------------------------------------------------------------------------

export const ANSWER_STATES = ["approved", "draft", "expired", "archived"] as const;

const answerSchema = z.object({
  answer_id: z.string(),
  question: z.string(),
  answer: z.string(),
  topic: z.string(),
  topic_label: z.string(),
  evidence: z.string(),
  owner_staff_id: z.string().nullable(),
  owner_name: z.string(),
  state: z.enum(ANSWER_STATES),
  approved_by_name: z.string(),
  approved_at: z.string().nullable(),
  review_due: z.string().nullable(),
  updated_at: z.string().nullable(),
});
export type Answer = z.infer<typeof answerSchema>;

const answersSchema = okEnvelope.extend({
  answers: z.array(answerSchema),
  q: z.string(),
  topic: z.string(),
  state: z.string(),
  counts: z.record(z.string(), z.number()),
  topics: z.array(option),
  can_approve: z.boolean(),
  can_write: z.boolean(),
  staff: z.array(staffOption),
  valid_months: z.number(),
});
export type AnswerLibrary = z.infer<typeof answersSchema>;

export function readAnswers(
  token: string,
  filters: { q?: string; topic?: string; state?: string } = {},
) {
  return fetchHqJson("hq/trust/answers", answersSchema, {
    token,
    query: { q: filters.q ?? "", topic: filters.topic ?? "", state: filters.state ?? "" },
  });
}

const answerDetailSchema = okEnvelope.extend({
  answer: answerSchema,
  events: z.array(event),
  topics: z.array(option),
  can_approve: z.boolean(),
  can_write: z.boolean(),
  staff: z.array(staffOption),
});
export type AnswerDetail = z.infer<typeof answerDetailSchema>;

export function readAnswer(token: string, answerId: string) {
  return fetchHqJson(`hq/trust/answers/${answerId}`, answerDetailSchema, { token });
}

export function createAnswer(token: string, body: Record<string, string>) {
  return postHqJson("hq/trust/answers/create", okEnvelope.extend({ answer: answerSchema }), {
    token,
    body,
  });
}

export function actOnAnswer(token: string, answerId: string, body: Record<string, string>) {
  return postHqJson(
    `hq/trust/answers/${answerId}/act`,
    okEnvelope.extend({ answer: answerSchema }),
    { token, body },
  );
}

// --- the record of processing ------------------------------------------------------------------

const activitySchema = z.object({
  activity_id: z.string(),
  name: z.string(),
  purpose: z.string(),
  data_subjects: z.string(),
  data_categories: z.string(),
  retention: z.string(),
  recipients: z.string(),
  transfers: z.string(),
  security_measures: z.string(),
  lawful_basis: z.string(),
  lawful_basis_label: z.string(),
  owner_staff_id: z.string().nullable(),
  owner_name: z.string(),
  reviewed_at: z.string().nullable(),
  review_due: z.string().nullable(),
  review_owed: z.boolean(),
  archived: z.boolean(),
  updated_at: z.string().nullable(),
});
export type ProcessingActivity = z.infer<typeof activitySchema>;

const processingSchema = okEnvelope.extend({
  activities: z.array(activitySchema),
  show: z.string(),
  owed: z.number(),
  bases: z.array(option),
  staff: z.array(staffOption),
});
export type ProcessingRecord = z.infer<typeof processingSchema>;

export function readProcessing(token: string, show = "") {
  return fetchHqJson("hq/trust/processing", processingSchema, { token, query: { show } });
}

const activityDetailSchema = okEnvelope.extend({
  activity: activitySchema,
  events: z.array(event),
  bases: z.array(option),
  staff: z.array(staffOption),
});
export type ProcessingDetail = z.infer<typeof activityDetailSchema>;

export function readActivity(token: string, activityId: string) {
  return fetchHqJson(`hq/trust/processing/${activityId}`, activityDetailSchema, { token });
}

export function createActivity(token: string, body: Record<string, string>) {
  return postHqJson("hq/trust/processing/create", okEnvelope.extend({ activity: activitySchema }), {
    token,
    body,
  });
}

export function actOnActivity(token: string, activityId: string, body: Record<string, string>) {
  return postHqJson(
    `hq/trust/processing/${activityId}/act`,
    okEnvelope.extend({ activity: activitySchema }),
    { token, body },
  );
}
