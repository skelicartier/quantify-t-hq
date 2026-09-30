import "server-only";

import { z } from "zod";

import { fetchHqJson, postHqJson } from "@/lib/api/core";

const okEnvelope = z.object({ ok: z.literal(true) });

const documentsStateSchema = z.object({
  nda: z.string(),
  ip_assignment: z.string(),
});

/** A dated thing about a person: probation end, engagement end, training expiry. */
export const reminderSchema = z.object({
  kind: z.string(),
  on: z.string(),
  /** Days from today; negative once past. */
  days: z.number(),
  label: z.string(),
});
export type Reminder = z.infer<typeof reminderSchema>;

export const assetSchema = z.object({
  asset_id: z.string(),
  staff_id: z.string(),
  kind: z.string(),
  label: z.string(),
  serial: z.string(),
  issued_on: z.string().nullable(),
  returned_on: z.string().nullable(),
  notes: z.string(),
  out: z.boolean(),
});
export type Asset = z.infer<typeof assetSchema>;

export const trainingSchema = z.object({
  training_id: z.string(),
  title: z.string(),
  provider: z.string(),
  completed_on: z.string().nullable(),
  expires_on: z.string().nullable(),
  reference: z.string(),
  expired: z.boolean(),
  expiring_soon: z.boolean(),
});
export type TrainingRecord = z.infer<typeof trainingSchema>;

export const oneOnOneSchema = z.object({
  one_on_one_id: z.string(),
  held_on: z.string().nullable(),
  held_by: z.string(),
  held_by_name: z.string(),
  notes: z.string(),
  /** The notes exist but are hidden from this reader; a reveal shows them. */
  notes_masked: z.boolean().default(false),
  actions: z.array(
    z.object({
      action_id: z.string(),
      title: z.string(),
      owner_id: z.string(),
      owner_name: z.string(),
      due_on: z.string().nullable(),
      done_at: z.string().nullable(),
      overdue: z.boolean(),
    }),
  ),
});
export type OneOnOne = z.infer<typeof oneOnOneSchema>;

export const policyStateSchema = z.object({
  key: z.string(),
  title: z.string(),
  version: z.number(),
  url: z.string(),
  acknowledged_version: z.number().nullable(),
  acknowledged_at: z.string().nullable(),
  outstanding: z.boolean(),
});
export type PolicyState = z.infer<typeof policyStateSchema>;

const directoryPersonSchema = z.object({
  staff_id: z.string(),
  display_name: z.string(),
  email: z.string(),
  role: z.string(),
  kind: z.string(),
  is_active: z.boolean(),
  starts_on: z.string().nullable(),
  ends_on: z.string().nullable(),
  ends_in_days: z.number().nullable(),
  documents: documentsStateSchema,
  documents_ok: z.boolean(),
  live_access: z.number(),
  access_expiring_soon: z.number(),
  open_checklists: z.array(
    z.object({
      run_id: z.string(),
      kind: z.string(),
      done: z.number(),
      total: z.number(),
      overdue: z.boolean(),
      due_at: z.string().nullable(),
    }),
  ),
  checked_in_this_week: z.boolean(),
  last_checkin_week: z.string(),
  away_today: z.boolean(),
  manager_id: z.string().default(""),
  manager_name: z.string().default(""),
  unreturned_assets: z.number().default(0),
  policies_outstanding: z.number().default(0),
  reminders: z.array(reminderSchema).default([]),
});
export type DirectoryPerson = z.infer<typeof directoryPersonSchema>;

const teamSchema = okEnvelope.extend({
  people: z.array(directoryPersonSchema),
  week: z.string(),
  /** Dated things across the team within sixty days, soonest first. */
  reminders: z
    .array(reminderSchema.extend({ staff_id: z.string(), display_name: z.string() }))
    .default([]),
});
export type TeamReminder = z.infer<typeof teamSchema>["reminders"][number];

export function readTeam(token: string) {
  return fetchHqJson("hq/team", teamSchema, { token });
}

export const accessSchema = z.object({
  access_id: z.string(),
  staff_id: z.string(),
  system: z.string(),
  level: z.string(),
  granted_on: z.string().nullable(),
  expires_on: z.string().nullable(),
  revoked_on: z.string().nullable(),
  notes: z.string(),
  live: z.boolean(),
  expiring_soon: z.boolean(),
});
export type AccessGrant = z.infer<typeof accessSchema>;

const checklistSchema = z.object({
  run_id: z.string(),
  staff_id: z.string(),
  kind: z.string(),
  started_at: z.string().nullable(),
  due_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  done: z.number(),
  total: z.number(),
  overdue: z.boolean(),
  /** For an open offboarding: how many issued things are still out. Zero when none. */
  blocked_by_assets: z.number().default(0),
  steps: z.array(
    z.object({
      position: z.number(),
      title: z.string(),
      done_at: z.string().nullable(),
      note: z.string(),
    }),
  ),
});
export type ChecklistRun = z.infer<typeof checklistSchema>;

export const timeOffSchema = z.object({
  request_id: z.string(),
  staff_id: z.string(),
  staff_name: z.string(),
  kind: z.string(),
  starts_on: z.string().nullable(),
  ends_on: z.string().nullable(),
  days: z.number(),
  note: z.string(),
  status: z.string(),
  decided_at: z.string().nullable(),
});
export type TimeOffRequest = z.infer<typeof timeOffSchema>;

export const certificateSchema = z.object({
  serial: z.string(),
  staff_id: z.string(),
  recipient_name: z.string(),
  title: z.string(),
  starts_on: z.string().nullable(),
  ends_on: z.string().nullable(),
  summary: z.string(),
  issued_on: z.string().nullable(),
  revoked: z.boolean(),
  revoked_at: z.string().nullable(),
  revoke_reason: z.string(),
});
export type Certificate = z.infer<typeof certificateSchema>;

const checkinSchema = z.object({
  week: z.string(),
  wins: z.string(),
  priorities: z.string(),
  blockers: z.string(),
  mood: z.number(),
  submitted_at: z.string().nullable(),
});

const memberSchema = okEnvelope.extend({
  person: z.object({
    staff_id: z.string(),
    display_name: z.string(),
    email: z.string(),
    personal_email: z.string(),
    role: z.string(),
    kind: z.string(),
    is_active: z.boolean(),
    starts_on: z.string().nullable(),
    ends_on: z.string().nullable(),
    manager_id: z.string().default(""),
    manager_name: z.string().default(""),
    probation_ends_on: z.string().nullable().default(null),
    emergency_contact: z
      .object({ name: z.string(), phone: z.string(), relation: z.string() })
      .default({ name: "", phone: "", relation: "" }),
    /** Fields sent masked to this reader (never their own record). */
    masked: z.array(z.string()).default([]),
  }),
  /** Who revealed what here in the last 90 days, for readers of the audit log. */
  reveals: z
    .array(
      z.object({
        by_name: z.string(),
        field: z.string(),
        field_label: z.string(),
        reason: z.string(),
        at: z.string().nullable(),
      }),
    )
    .default([]),
  reports: z.array(z.object({ staff_id: z.string(), display_name: z.string() })).default([]),
  assets: z.array(assetSchema).default([]),
  training: z.array(trainingSchema).default([]),
  one_on_ones: z.array(oneOnOneSchema).default([]),
  policies: z.array(policyStateSchema).default([]),
  reminders: z.array(reminderSchema).default([]),
  documents: z.array(
    z.object({
      document_id: z.string(),
      kind: z.string(),
      title: z.string(),
      status: z.string(),
      signed_on: z.string().nullable(),
      reference: z.string(),
      updated_at: z.string().nullable(),
    }),
  ),
  documents_state: documentsStateSchema,
  documents_ok: z.boolean(),
  access: z.array(accessSchema),
  checklists: z.array(checklistSchema),
  checkins: z.array(checkinSchema),
  time_off: z.array(timeOffSchema),
  certificates: z.array(certificateSchema),
});
export type TeamMember = z.infer<typeof memberSchema>;

export function readTeamMember(token: string, staffId: string) {
  return fetchHqJson(`hq/team/${staffId}`, memberSchema, { token });
}

export function saveDocument(token: string, staffId: string, input: Record<string, unknown>) {
  return postHqJson(
    `hq/team/${staffId}/documents`,
    okEnvelope.extend({ document_id: z.string(), status: z.string() }),
    { token, body: input },
  );
}

export function grantAccess(token: string, staffId: string, input: Record<string, unknown>) {
  return postHqJson(
    `hq/team/${staffId}/access/grant`,
    okEnvelope.extend({ access_id: z.string() }),
    {
      token,
      body: input,
    },
  );
}

export function revokeAccess(token: string, staffId: string, accessId: string, reason: string) {
  return postHqJson(
    `hq/team/${staffId}/access/${accessId}/revoke`,
    okEnvelope.extend({ revoked: z.boolean() }),
    { token, body: { reason } },
  );
}

export function startChecklist(token: string, staffId: string, kind: string) {
  return postHqJson(
    `hq/team/${staffId}/checklists/start`,
    okEnvelope.extend({ run_id: z.string() }),
    {
      token,
      body: { kind },
    },
  );
}

export function markChecklistStep(token: string, runId: string, position: number, done: boolean) {
  return postHqJson(
    `hq/checklists/${runId}/steps/${position}`,
    okEnvelope.extend({ complete: z.boolean() }),
    { token, body: { done } },
  );
}

const checkinsSchema = okEnvelope.extend({
  week: z.string(),
  this_week: z.string(),
  last_week: z.string(),
  mine: checkinSchema.extend({ staff_id: z.string() }).nullable(),
  team: z.array(checkinSchema.extend({ staff_id: z.string() })).optional(),
  missing: z.array(z.object({ staff_id: z.string(), display_name: z.string() })).optional(),
});
export type CheckinsPage = z.infer<typeof checkinsSchema>;

export function readCheckins(token: string, week = "") {
  return fetchHqJson("hq/checkins", checkinsSchema, { token, query: week ? { week } : {} });
}

export function submitCheckin(token: string, input: Record<string, unknown>) {
  return postHqJson("hq/checkins/submit", okEnvelope.extend({ week: z.string() }), {
    token,
    body: input,
  });
}

const timeOffPageSchema = okEnvelope.extend({
  mine: z.array(timeOffSchema),
  kinds: z.array(z.string()),
  pending: z.array(timeOffSchema).optional(),
  upcoming: z.array(timeOffSchema).optional(),
});
export type TimeOffPage = z.infer<typeof timeOffPageSchema>;

export function readTimeOff(token: string) {
  return fetchHqJson("hq/time-off", timeOffPageSchema, { token });
}

export function requestTimeOff(token: string, input: Record<string, unknown>) {
  return postHqJson("hq/time-off/request", okEnvelope.extend({ request_id: z.string() }), {
    token,
    body: input,
  });
}

export function decideTimeOff(token: string, requestId: string, decision: string) {
  return postHqJson(`hq/time-off/${requestId}/decide`, okEnvelope.extend({ status: z.string() }), {
    token,
    body: { decision },
  });
}

export function readCertificates(token: string) {
  return fetchHqJson(
    "hq/certificates",
    okEnvelope.extend({ certificates: z.array(certificateSchema) }),
    {
      token,
    },
  );
}

export function issueCertificate(token: string, input: Record<string, unknown>) {
  return postHqJson("hq/certificates/issue", okEnvelope.extend({ serial: z.string() }), {
    token,
    body: input,
  });
}

export function revokeCertificate(token: string, serial: string, reason: string) {
  return postHqJson(
    `hq/certificates/${serial}/revoke`,
    okEnvelope.extend({ revoked: z.boolean() }),
    {
      token,
      body: { reason },
    },
  );
}

const publicCertificateSchema = okEnvelope.extend({
  certificate: z.object({
    serial: z.string(),
    recipient_name: z.string(),
    title: z.string(),
    starts_on: z.string().nullable(),
    ends_on: z.string().nullable(),
    summary: z.string(),
    issued_on: z.string().nullable(),
    valid: z.boolean(),
    revoked_on: z.string().nullable(),
  }),
});
export type PublicCertificate = z.infer<typeof publicCertificateSchema>["certificate"];

/** The public check: no session, only the full serial. */
export function verifyCertificate(serial: string) {
  return fetchHqJson(`public/certificates/${serial}`, publicCertificateSchema);
}

const reviewSummarySchema = z.object({
  review_id: z.string(),
  quarter: z.string(),
  started_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  total: z.number(),
  decided: z.number(),
  revoked: z.number(),
});

export function readAccessReviews(token: string) {
  return fetchHqJson(
    "hq/access-reviews",
    okEnvelope.extend({ reviews: z.array(reviewSummarySchema), quarter: z.string() }),
    { token },
  );
}

const reviewDetailSchema = okEnvelope.extend({
  review: reviewSummarySchema.extend({
    items: z.array(
      z.object({
        access_id: z.string(),
        decision: z.string(),
        evidence: z.string(),
        decided_at: z.string().nullable(),
        access: accessSchema,
        staff_name: z.string(),
        /** "orphan", "shared", or "conflict:<other system>"; empty when nothing is wrong. */
        flags: z.array(z.string()).default([]),
      }),
    ),
    /** What an auditor reads first: orphans, shared accounts, separation-of-duties conflicts. */
    findings: z
      .array(
        z.object({
          kind: z.string(),
          access_id: z.string(),
          staff_name: z.string(),
          system: z.string(),
          detail: z.string(),
        }),
      )
      .default([]),
  }),
});
export type AccessReview = z.infer<typeof reviewDetailSchema>["review"];

export function readAccessReview(token: string, reviewId: string) {
  return fetchHqJson(`hq/access-reviews/${reviewId}`, reviewDetailSchema, { token });
}

export function startAccessReview(token: string) {
  return postHqJson("hq/access-reviews/start", okEnvelope.extend({ review_id: z.string() }), {
    token,
    body: {},
  });
}

export function decideReviewItem(
  token: string,
  reviewId: string,
  accessId: string,
  input: { decision: string; evidence: string },
) {
  return postHqJson(
    `hq/access-reviews/${reviewId}/items/${accessId}`,
    okEnvelope.extend({ decision: z.string() }),
    { token, body: input },
  );
}

export function completeAccessReview(token: string, reviewId: string, notes: string) {
  return postHqJson(
    `hq/access-reviews/${reviewId}/complete`,
    okEnvelope.extend({ completed: z.boolean() }),
    { token, body: { notes } },
  );
}

// --- people ops -----------------------------------------------------------------------

export function updateProfile(token: string, staffId: string, input: Record<string, unknown>) {
  return postHqJson(`hq/team/${staffId}/profile`, okEnvelope.extend({ updated: z.boolean() }), {
    token,
    body: input,
  });
}

export function saveAsset(token: string, staffId: string, input: Record<string, unknown>) {
  return postHqJson(`hq/team/${staffId}/assets`, okEnvelope.extend({ asset_id: z.string() }), {
    token,
    body: input,
  });
}

export function addTraining(token: string, staffId: string, input: Record<string, unknown>) {
  return postHqJson(`hq/team/${staffId}/training`, okEnvelope.extend({ training_id: z.string() }), {
    token,
    body: input,
  });
}

export function addOneOnOne(token: string, staffId: string, input: Record<string, unknown>) {
  return postHqJson(
    `hq/team/${staffId}/one-on-ones`,
    okEnvelope.extend({ one_on_one_id: z.string(), actions: z.number() }),
    { token, body: input },
  );
}

export function toggleAction(token: string, actionId: string, done: boolean) {
  return postHqJson(
    `hq/one-on-ones/actions/${actionId}`,
    okEnvelope.extend({ done: z.boolean() }),
    { token, body: { done } },
  );
}

const policiesSchema = okEnvelope.extend({
  policies: z.array(policyStateSchema),
  outstanding: z.number(),
});
export type PoliciesPage = z.infer<typeof policiesSchema>;

/** The company's policies and which versions the signed-in person has acknowledged. */
export function readPolicies(token: string) {
  return fetchHqJson("hq/policies", policiesSchema, { token });
}

export function acknowledgePolicy(token: string, key: string) {
  return postHqJson(
    `hq/policies/${key}/acknowledge`,
    okEnvelope.extend({ acknowledged: z.boolean(), version: z.number() }),
    { token, body: {} },
  );
}

/** Rename or relink a policy, or publish a new version (which asks everyone again). */
export function updatePolicy(token: string, input: Record<string, unknown>) {
  return postHqJson(
    "hq/settings/policies/update",
    okEnvelope.extend({ updated: z.boolean(), key: z.string(), version: z.number() }),
    { token, body: input },
  );
}
