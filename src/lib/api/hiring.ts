import "server-only";

import { z } from "zod";

import { fetchHqJson, postHqJson } from "@/lib/api/core";

const okEnvelope = z.object({ ok: z.literal(true) });
const option = z.object({ value: z.string(), label: z.string() });
const person = z.object({ staff_id: z.string(), name: z.string() });

export const STAGES = [
  "applied",
  "screen",
  "interview",
  "task",
  "offer",
  "hired",
  "rejected",
  "withdrawn",
] as const;
export const OPEN_STAGES = ["applied", "screen", "interview", "task", "offer"] as const;

const openingSchema = z.object({
  opening_id: z.string(),
  title: z.string(),
  team: z.string(),
  kind: z.string(),
  kind_label: z.string(),
  location: z.string(),
  status: z.enum(["open", "paused", "closed"]),
  owner_staff_id: z.string().nullable(),
  owner_name: z.string(),
  opened_on: z.string().nullable(),
  closes_on: z.string().nullable(),
  in_process: z.number(),
  by_stage: z.record(z.string(), z.number()),
  waiting_over_a_week: z.number(),
});
export type Opening = z.infer<typeof openingSchema>;

const summarySchema = z.object({
  applicant_id: z.string(),
  opening_id: z.string(),
  full_name: z.string(),
  email: z.string(),
  source: z.string(),
  source_label: z.string(),
  stage: z.enum(STAGES),
  stage_label: z.string(),
  days_in_stage: z.number(),
  scorecards: z.number(),
  decision_reason: z.string(),
  decision_reason_label: z.string(),
  forget_on: z.string().nullable(),
  anonymised: z.boolean(),
  created_at: z.string().nullable(),
});
export type ApplicantSummary = z.infer<typeof summarySchema>;

const applicantSchema = summarySchema.extend({
  phone: z.string(),
  links: z.string(),
  cover_note: z.string(),
  referred_by: z.string(),
  decision_note: z.string(),
  keep_until: z.string().nullable(),
  opening_title: z.string(),
  interviewers: z.array(person),
  interviewing: z.boolean(),
  scorecard_views: z.array(
    z.object({
      stage: z.string(),
      interviewer_name: z.string(),
      mine: z.boolean(),
      recommendation: z.string(),
      recommendation_label: z.string(),
      scores: z.record(z.string(), z.number()),
      notes: z.string(),
      submitted_at: z.string().nullable(),
    }),
  ),
  scorecards_hidden: z.number(),
  events: z.array(
    z.object({
      kind: z.enum(["stage", "note"]),
      from_stage: z.string(),
      to_stage: z.string(),
      note: z.string(),
      staff_name: z.string(),
      at: z.string().nullable(),
    }),
  ),
  can_write: z.boolean(),
});
export type Applicant = z.infer<typeof applicantSchema>;

const boardSchema = okEnvelope.extend({
  openings: z.array(openingSchema),
  kinds: z.array(option),
  staff: z.array(person),
  can_write: z.boolean(),
});
export type HiringBoard = z.infer<typeof boardSchema>;

const openingReadSchema = okEnvelope.extend({
  opening: openingSchema.extend({ description: z.string() }),
  applicants: z.array(summarySchema),
  stages: z.array(option),
  sources: z.array(option),
});
export type OpeningRead = z.infer<typeof openingReadSchema>;

const applicantReadSchema = okEnvelope.extend({
  applicant: applicantSchema,
  stages: z.array(option),
  reasons: z.array(option),
  criteria: z.array(option),
  recommendations: z.array(option),
  staff: z.array(person),
});
export type ApplicantRead = z.infer<typeof applicantReadSchema>;

const interviewsSchema = okEnvelope.extend({
  interviews: z.array(
    z.object({
      applicant_id: z.string(),
      full_name: z.string(),
      opening_title: z.string(),
      stage: z.string(),
      stage_label: z.string(),
      scorecard_written: z.boolean(),
      days_in_stage: z.number(),
    }),
  ),
});
export type Interviews = z.infer<typeof interviewsSchema>;

export function readHiring(token: string) {
  return fetchHqJson("hq/hiring", boardSchema, { token });
}

export function readOpening(token: string, openingId: string) {
  return fetchHqJson(`hq/hiring/openings/${openingId}`, openingReadSchema, { token });
}

export function readApplicant(token: string, applicantId: string) {
  return fetchHqJson(`hq/hiring/applicants/${applicantId}`, applicantReadSchema, { token });
}

export function readInterviews(token: string) {
  return fetchHqJson("hq/hiring/interviews", interviewsSchema, { token });
}

export function createOpening(token: string, body: Record<string, string>) {
  return postHqJson("hq/hiring/openings/create", okEnvelope.extend({ opening: openingSchema }), {
    token,
    body,
  });
}

export function updateOpening(token: string, openingId: string, body: Record<string, string>) {
  return postHqJson(
    `hq/hiring/openings/${openingId}/update`,
    okEnvelope.extend({ opening: openingSchema }),
    {
      token,
      body,
    },
  );
}

export function createApplicant(token: string, body: Record<string, string>) {
  return postHqJson(
    "hq/hiring/applicants/create",
    okEnvelope.extend({ applicant: summarySchema }),
    { token, body },
  );
}

export function actOnApplicant(token: string, applicantId: string, body: Record<string, unknown>) {
  return postHqJson(
    `hq/hiring/applicants/${applicantId}/act`,
    okEnvelope.extend({ applicant: applicantSchema }),
    {
      token,
      body,
    },
  );
}

export function submitScorecard(token: string, applicantId: string, body: Record<string, unknown>) {
  return postHqJson(
    `hq/hiring/applicants/${applicantId}/scorecard`,
    okEnvelope.extend({ applicant: applicantSchema }),
    {
      token,
      body,
    },
  );
}

// --- the public side: the careers page ------------------------------------------------------------

const publicCareersSchema = okEnvelope.extend({
  roles: z.array(
    z.object({
      opening_id: z.string(),
      title: z.string(),
      team: z.string(),
      kind: z.string(),
      kind_label: z.string(),
      location: z.string(),
      description: z.string(),
      closes_on: z.string().nullable(),
    }),
  ),
});
export type PublicCareers = z.infer<typeof publicCareersSchema>;

export function readPublicCareers() {
  return fetchHqJson("public/careers", publicCareersSchema);
}

export function applyToRole(body: Record<string, unknown>) {
  return postHqJson("public/careers/apply", okEnvelope.extend({ received: z.literal(true) }), {
    body,
  });
}
