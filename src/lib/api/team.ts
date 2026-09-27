import "server-only";

import { z } from "zod";

import { fetchHqJson, postHqJson } from "@/lib/api/core";

const okEnvelope = z.object({ ok: z.literal(true) });

const documentsStateSchema = z.object({
  nda: z.string(),
  ip_assignment: z.string(),
});

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
});
export type DirectoryPerson = z.infer<typeof directoryPersonSchema>;

const teamSchema = okEnvelope.extend({ people: z.array(directoryPersonSchema), week: z.string() });

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
  }),
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
      }),
    ),
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
