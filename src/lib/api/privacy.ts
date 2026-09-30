import "server-only";

import { z } from "zod";

import { fetchHqJson, postHqJson } from "@/lib/api/core";

const okEnvelope = z.object({ ok: z.literal(true) });
const option = z.object({ value: z.string(), label: z.string() });
const event = z.object({
  kind: z.string(),
  detail: z.string(),
  by: z.string(),
  at: z.string().nullable(),
});
export type PrivacyEvent = z.infer<typeof event>;
const staffOption = z.object({ id: z.string(), name: z.string() });

// --- rights requests and complaints ------------------------------------------------------------

export const CLOCK_STATES = [
  "running",
  "stopped",
  "not_started",
  "acknowledged",
  "closed",
] as const;

const clockSchema = z.object({
  state: z.enum(CLOCK_STATES),
  starts_on: z.string().nullable(),
  due_on: z.string().nullable(),
  days_left: z.number().nullable(),
  overdue: z.boolean(),
  stopped_since: z.string().nullable(),
  days_left_when_stopped: z.number().nullable(),
  paused_days: z.number(),
  extended: z.boolean(),
  can_extend: z.boolean(),
  extend_by: z.string().nullable(),
  answered_late: z.boolean(),
  holidays_known: z.boolean(),
  reason: z.string(),
});
export type RequestClock = z.infer<typeof clockSchema>;

export const privacyRequestSchema = z.object({
  id: z.string(),
  reference: z.string(),
  kind: z.string(),
  kind_label: z.string(),
  regime: z.string(),
  regime_label: z.string(),
  channel: z.string(),
  requester_name: z.string(),
  requester_email: z.string(),
  person_id: z.string().nullable(),
  company: z.object({ id: z.string(), name: z.string() }).nullable(),
  description: z.string(),
  received_on: z.string().nullable(),
  identity_state: z.string(),
  identity_confirmed_on: z.string().nullable(),
  identity_method: z.string(),
  fee_requested_on: z.string().nullable(),
  fee_paid_on: z.string().nullable(),
  status: z.string(),
  open: z.boolean(),
  paused_question: z.string(),
  extension_reason: z.string(),
  extension_told_on: z.string().nullable(),
  acknowledged_on: z.string().nullable(),
  responded_on: z.string().nullable(),
  outcome: z.string(),
  outcome_detail: z.string(),
  assignee: z.object({ id: z.string(), name: z.string() }).nullable(),
  clock: clockSchema,
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});
export type PrivacyRequest = z.infer<typeof privacyRequestSchema>;

const requestsSchema = okEnvelope.extend({
  requests: z.array(privacyRequestSchema),
  stats: z.object({
    open: z.number(),
    overdue: z.number(),
    due_soon: z.number(),
    stopped: z.number(),
    not_started: z.number(),
    complaints_unacknowledged: z.number(),
  }),
  kinds: z.array(option),
  regimes: z.array(option),
});
export type PrivacyRequests = z.infer<typeof requestsSchema>;

export function readPrivacyRequests(
  token: string,
  query: { scope?: "open" | "closed" | "all"; company_id?: string } = {},
) {
  const filtered: Record<string, string> = {};
  for (const [name, value] of Object.entries(query)) if (value) filtered[name] = value;
  return fetchHqJson("hq/privacy/requests", requestsSchema, { token, query: filtered });
}

const requestDetailSchema = okEnvelope.extend({
  request: privacyRequestSchema,
  person: z
    .object({
      id: z.string(),
      name: z.string(),
      email: z.string(),
      do_not_contact: z.boolean(),
      erased: z.boolean(),
    })
    .nullable(),
  searches: z.array(
    z.object({
      system: z.string(),
      label: z.string(),
      state: z.enum(["pending", "found", "none", "not_applicable"]),
      note: z.string(),
      by: z.string(),
      at: z.string().nullable(),
    }),
  ),
  matches: z.object({
    email: z.string(),
    people: z.array(
      z.object({ id: z.string(), name: z.string(), company_id: z.string(), erased: z.boolean() }),
    ),
    leads: z.array(
      z.object({ id: z.string(), name: z.string(), stage: z.string(), anonymised: z.boolean() }),
    ),
    list_memberships: z.array(z.object({ list_id: z.string(), list_name: z.string() })),
    meetings: z.array(z.object({ id: z.string(), title: z.string() })),
    mail_messages: z.number(),
    suppressed: z.boolean(),
    consent: z.object({ basis: z.string(), state: z.string() }).nullable(),
    tickets: z.array(z.object({ id: z.string(), subject: z.string() })),
    tickets_searched: z.boolean(),
  }),
  events: z.array(event),
  can_erase: z.boolean(),
  can_stop_contact: z.boolean(),
  refusals: z.array(option),
  staff: z.array(staffOption),
});
export type PrivacyRequestDetail = z.infer<typeof requestDetailSchema>;

export function readPrivacyRequest(token: string, requestId: string) {
  return fetchHqJson(`hq/privacy/requests/${requestId}`, requestDetailSchema, { token });
}

export function logPrivacyRequest(token: string, body: Record<string, string>) {
  return postHqJson(
    "hq/privacy/requests/create",
    okEnvelope.extend({ request: privacyRequestSchema }),
    { token, body },
  );
}

export function actOnPrivacyRequest(
  token: string,
  requestId: string,
  body: Record<string, string>,
) {
  return postHqJson(
    `hq/privacy/requests/${requestId}/act`,
    okEnvelope.extend({ request: privacyRequestSchema }),
    { token, body },
  );
}

export function markPrivacySearch(
  token: string,
  requestId: string,
  body: { system: string; state: string; note: string },
) {
  return postHqJson(
    `hq/privacy/requests/${requestId}/search`,
    okEnvelope.extend({ system: z.string(), state: z.string() }),
    { token, body },
  );
}

export function stopContact(token: string, requestId: string) {
  return postHqJson(
    `hq/privacy/requests/${requestId}/stop-contact`,
    okEnvelope.extend({ suppressed: z.boolean(), person_marked: z.boolean() }),
    { token, body: {} },
  );
}

export function erasePerson(token: string, requestId: string, reason: string) {
  return postHqJson(
    `hq/privacy/requests/${requestId}/erase`,
    okEnvelope.extend({
      erased: z.record(z.string(), z.number()),
      suppressed: z.boolean(),
    }),
    { token, body: { reason } },
  );
}

// --- incidents and breaches --------------------------------------------------------------------

const regulatorSchema = z.object({
  state: z.enum([
    "not_applicable",
    "no_awareness",
    "unassessed",
    "due",
    "not_notifiable",
    "notified",
  ]),
  due_at: z.string().nullable(),
  hours_left: z.number().nullable(),
  late: z.boolean(),
  notified_at: z.string().optional(),
});

export const incidentSchema = z.object({
  id: z.string(),
  reference: z.string(),
  title: z.string(),
  summary: z.string(),
  kind: z.string(),
  kind_label: z.string(),
  severity: z.enum(["low", "medium", "high", "critical"]),
  status: z.enum(["open", "contained", "resolved", "closed"]),
  personal_data: z.boolean(),
  occurred_at: z.string().nullable(),
  detected_at: z.string().nullable(),
  aware_at: z.string().nullable(),
  contained_at: z.string().nullable(),
  resolved_at: z.string().nullable(),
  data_categories: z.string(),
  subjects_estimate: z.number().nullable(),
  records_estimate: z.number().nullable(),
  risk: z.string(),
  risk_label: z.string(),
  risk_reason: z.string(),
  assessed_by: z.string(),
  assessed_at: z.string().nullable(),
  regulator: regulatorSchema,
  regulator_reference: z.string(),
  late_reason: z.string(),
  individuals_notified_at: z.string().nullable(),
  lessons: z.string(),
  lead: z.object({ id: z.string(), name: z.string() }).nullable(),
  customers: z.array(
    z.object({
      company_id: z.string(),
      company_name: z.string(),
      due_at: z.string().nullable(),
      notified_at: z.string().nullable(),
      hours_left: z.number().nullable(),
      late: z.boolean(),
      note: z.string(),
      contact: z.string(),
      dora: z.boolean(),
    }),
  ),
  customers_owed: z.number(),
  created_at: z.string().nullable(),
});
export type Incident = z.infer<typeof incidentSchema>;

const incidentsSchema = okEnvelope.extend({
  incidents: z.array(incidentSchema),
  stats: z.object({
    open: z.number(),
    unassessed: z.number(),
    regulator_due: z.number(),
    customers_owed: z.number(),
    breaches_logged: z.number(),
  }),
});
export type Incidents = z.infer<typeof incidentsSchema>;

export function readIncidents(token: string) {
  return fetchHqJson("hq/incidents", incidentsSchema, { token });
}

const incidentDetailSchema = okEnvelope.extend({
  incident: incidentSchema,
  events: z.array(event),
  risks: z.array(option),
  staff: z.array(staffOption),
});
export type IncidentDetail = z.infer<typeof incidentDetailSchema>;

export function readIncident(token: string, incidentId: string) {
  return fetchHqJson(`hq/incidents/${incidentId}`, incidentDetailSchema, { token });
}

export function logIncident(token: string, body: Record<string, unknown>) {
  return postHqJson("hq/incidents/create", okEnvelope.extend({ incident: incidentSchema }), {
    token,
    body,
  });
}

export function actOnIncident(token: string, incidentId: string, body: Record<string, unknown>) {
  return postHqJson(
    `hq/incidents/${incidentId}/act`,
    okEnvelope.extend({ incident: incidentSchema }),
    { token, body },
  );
}

// --- customer commitments ----------------------------------------------------------------------

export const commitmentsSchema = z.object({
  company_id: z.string(),
  recorded: z.boolean(),
  contract_reference: z.string(),
  privacy_contact_email: z.string(),
  incident_notice_hours: z.number().nullable(),
  subprocessor_notice_days: z.number().nullable(),
  objection_window_days: z.number().nullable(),
  audit_rights: z.string(),
  data_locations: z.string(),
  exit_assistance_days: z.number().nullable(),
  dora_classification: z.string(),
  material_outsourcing: z.boolean(),
  nonstandard_clauses: z.string(),
  reviewed_on: z.string().nullable(),
  updated_by: z.string(),
  updated_at: z.string().nullable(),
  flags: z.array(z.string()),
});
export type Commitments = z.infer<typeof commitmentsSchema>;

const standardSchema = z.object({
  incident_notice_hours: z.number(),
  subprocessor_notice_days: z.number(),
  objection_window_days: z.number(),
});

const commitmentsListSchema = okEnvelope.extend({
  commitments: z.array(
    commitmentsSchema.extend({ company_name: z.string(), customer: z.boolean() }),
  ),
  standard: standardSchema,
  stats: z.object({
    customers: z.number(),
    recorded: z.number(),
    missing: z.number(),
    nonstandard: z.number(),
    no_contact: z.number(),
    dora: z.number(),
  }),
});
export type CommitmentsList = z.infer<typeof commitmentsListSchema>;

export function readCommitments(token: string) {
  return fetchHqJson("hq/commitments", commitmentsListSchema, { token });
}

const companyPrivacySchema = okEnvelope.extend({
  commitments: commitmentsSchema,
  standard: standardSchema,
  requests: z.array(privacyRequestSchema),
  notices: z.array(
    z.object({
      subprocessor_id: z.string(),
      legal_name: z.string(),
      sent_on: z.string().nullable(),
      objection_deadline: z.string().nullable(),
      objected_on: z.string().nullable(),
      resolution: z.string(),
    }),
  ),
});
export type CompanyPrivacy = z.infer<typeof companyPrivacySchema>;

export function readCompanyPrivacy(token: string, companyId: string) {
  return fetchHqJson(`hq/companies/${companyId}/commitments`, companyPrivacySchema, { token });
}

export function updateCommitments(token: string, companyId: string, body: Record<string, unknown>) {
  return postHqJson(
    `hq/companies/${companyId}/commitments/update`,
    okEnvelope.extend({ commitments: commitmentsSchema }),
    { token, body },
  );
}

// --- sub-processors ----------------------------------------------------------------------------

export const subprocessorSchema = z.object({
  id: z.string(),
  legal_name: z.string(),
  service: z.string(),
  purpose: z.string(),
  data_categories: z.string(),
  locations: z.string(),
  transfer_mechanism: z.string(),
  transfer_label: z.string(),
  /** How often it is reviewed as a supplier; set on the trust registers. */
  tier: z.string(),
  dpa_signed_on: z.string().nullable(),
  status: z.enum(["proposed", "notice_sent", "active", "retired"]),
  notice_sent_on: z.string().nullable(),
  effective_on: z.string().nullable(),
  activated_on: z.string().nullable(),
  retired_on: z.string().nullable(),
  notices_sent: z.number(),
  customers_unnoticed: z.number(),
  open_objections: z.number(),
  objections: z.number(),
  can_activate: z.boolean(),
  blockers: z.array(z.string()),
});
export type Subprocessor = z.infer<typeof subprocessorSchema>;

const subprocessorsSchema = okEnvelope.extend({
  subprocessors: z.array(subprocessorSchema),
  transfers: z.array(option),
  customers: z.number(),
});
export type Subprocessors = z.infer<typeof subprocessorsSchema>;

export function readSubprocessors(token: string) {
  return fetchHqJson("hq/subprocessors", subprocessorsSchema, { token });
}

const subprocessorDetailSchema = okEnvelope.extend({
  subprocessor: subprocessorSchema,
  notices: z.array(
    z.object({
      company_id: z.string(),
      company_name: z.string(),
      sent_to: z.string(),
      sent_on: z.string().nullable(),
      objection_deadline: z.string().nullable(),
      window_open: z.boolean(),
      objected_on: z.string().nullable(),
      objection: z.string(),
      resolution: z.string(),
      resolved_on: z.string().nullable(),
    }),
  ),
  unnoticed: z.array(
    z.object({
      company_id: z.string(),
      company_name: z.string(),
      contact: z.string(),
      notice_days: z.number(),
      objection_days: z.number(),
    }),
  ),
  draft: z.object({ subject: z.string(), body: z.string() }),
  mail_ready: z.boolean(),
  events: z.array(event),
  transfers: z.array(option),
});
export type SubprocessorDetail = z.infer<typeof subprocessorDetailSchema>;

export function readSubprocessor(token: string, subprocessorId: string) {
  return fetchHqJson(`hq/subprocessors/${subprocessorId}`, subprocessorDetailSchema, { token });
}

export function addSubprocessor(token: string, body: Record<string, string>) {
  return postHqJson(
    "hq/subprocessors/create",
    okEnvelope.extend({ subprocessor: subprocessorSchema }),
    { token, body },
  );
}

export function actOnSubprocessor(
  token: string,
  subprocessorId: string,
  body: Record<string, string>,
) {
  return postHqJson(
    `hq/subprocessors/${subprocessorId}/act`,
    okEnvelope.extend({
      subprocessor: subprocessorSchema,
      sent: z.array(z.string()).optional(),
      missing: z.array(z.string()).optional(),
    }),
    { token, body },
  );
}
