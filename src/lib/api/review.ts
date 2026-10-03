import "server-only";

import { z } from "zod";

import { fetchHqJson, postHqJson } from "@/lib/api/core";
import { taskSchema } from "@/lib/api/crm";

const okEnvelope = z.object({ ok: z.literal(true) });

const personSchema = z.object({ staff_id: z.string(), name: z.string() }).nullable();

const pointSchema = z.object({
  value: z.number().nullable(),
  /** False while the stretch is still running: its figure is so far, not final. */
  complete: z.boolean(),
});

/** One figure on the scorecard, counted for the week, the six before it and twelve months. */
const scorecardRowSchema = z.object({
  metric_id: z.string(),
  key: z.string(),
  label: z.string(),
  /** "count", "minutes" or "usd". */
  unit: z.string(),
  /** "up" when more is better, "down" when less is. */
  better: z.string(),
  area: z.string(),
  owner: personSchema,
  goal: z.number().nullable(),
  /** "at_least" or "at_most". */
  direction: z.string(),
  actual: z.number().nullable(),
  /** "met", "missed", "so_far" (the week is still running) or "" (no goal, or no figure). */
  verdict: z.string(),
  weeks: z.array(pointSchema.extend({ week: z.string(), starts_on: z.string() })),
  months: z.array(pointSchema.extend({ month: z.string() })),
  note: z.object({ text: z.string(), by: personSchema, at: z.string().nullable() }).nullable(),
});
export type ScorecardRow = z.infer<typeof scorecardRowSchema>;

const healthSchema = z.object({
  week: z.string(),
  /** "on_track", "at_risk" or "off_track". */
  health: z.string(),
  note: z.string(),
  by: personSchema,
  at: z.string().nullable(),
});
export type PriorityHealth = z.infer<typeof healthSchema>;

const prioritySchema = z.object({
  priority_id: z.string(),
  quarter: z.string(),
  title: z.string(),
  detail: z.string(),
  owner: personSchema,
  /** "open", "done" or "dropped". */
  state: z.string(),
  closing_note: z.string(),
  closed_at: z.string().nullable(),
  this_week: healthSchema.nullable(),
  latest: healthSchema.nullable(),
  history: z.array(healthSchema),
});
export type Priority = z.infer<typeof prioritySchema>;

const catalogueSchema = z.array(
  z.object({
    key: z.string(),
    label: z.string(),
    unit: z.string(),
    better: z.string(),
    area: z.string(),
  }),
);

const reviewSchema = okEnvelope.extend({
  week: z.object({
    label: z.string(),
    starts_on: z.string(),
    ends_on: z.string(),
    complete: z.boolean(),
    previous: z.string(),
    next: z.string().nullable(),
  }),
  quarter: z.object({ label: z.string(), current: z.string(), max_priorities: z.number() }),
  scorecard: z.array(scorecardRowSchema),
  catalogue: catalogueSchema,
  available: catalogueSchema,
  priorities: z.array(prioritySchema),
  actions: z.array(taskSchema),
  note: z.object({
    went_well: z.string(),
    went_badly: z.string(),
    sent_at: z.string().nullable(),
    sent_to: z.number(),
    subject: z.string(),
    /** As it was sent, once it has been; as it would be until then. */
    body: z.string(),
  }),
  settings: z.object({
    primary_metric: z.string(),
    note_on: z.boolean(),
    note_weekday: z.number(),
    note_hour_utc: z.number(),
    weekdays: z.array(z.string()),
  }),
  health: z.array(z.string()),
  can_manage: z.boolean(),
});
export type WeeklyReview = z.infer<typeof reviewSchema>;

/** The review of an ISO week (the last complete one when `week` is empty). */
export function readReview(token: string, filters: { week?: string; quarter?: string } = {}) {
  const query: Record<string, string> = {};
  if (filters.week) query.week = filters.week;
  if (filters.quarter) query.quarter = filters.quarter;
  return fetchHqJson("hq/review", reviewSchema, { token, query });
}

export function saveScorecardMetric(
  token: string,
  input: { metric_key: string; owner_staff_id: string; goal: string; direction: string },
) {
  return postHqJson(
    "hq/review/metrics/save",
    okEnvelope.extend({ metric_id: z.string(), metric_key: z.string() }),
    { token, body: input },
  );
}

export function removeScorecardMetric(token: string, metricKey: string) {
  return postHqJson(
    "hq/review/metrics/remove",
    okEnvelope.extend({ metric_key: z.string(), removed: z.boolean() }),
    { token, body: { metric_key: metricKey } },
  );
}

export function noteScorecardMetric(
  token: string,
  input: { metric_key: string; week: string; note: string },
) {
  return postHqJson(
    "hq/review/metrics/note",
    okEnvelope.extend({ metric_key: z.string(), week: z.string(), note: z.string() }),
    { token, body: input },
  );
}

export function createPriority(
  token: string,
  input: { quarter: string; title: string; detail: string; owner_staff_id: string },
) {
  return postHqJson("hq/review/priorities/create", okEnvelope.extend({ priority_id: z.string() }), {
    token,
    body: input,
  });
}

export function updatePriority(
  token: string,
  priorityId: string,
  input: { health: string; note: string; week: string },
) {
  return postHqJson(
    `hq/review/priorities/${priorityId}/update`,
    okEnvelope.extend({ priority_id: z.string(), week: z.string(), health: z.string() }),
    { token, body: input },
  );
}

export function closePriority(
  token: string,
  priorityId: string,
  input: { state: string; note: string },
) {
  return postHqJson(
    `hq/review/priorities/${priorityId}/close`,
    okEnvelope.extend({ priority_id: z.string(), state: z.string() }),
    { token, body: input },
  );
}

export function createReviewAction(
  token: string,
  input: { ref: string; title: string; assignee_staff_id: string; due_on: string },
) {
  return postHqJson("hq/review/actions/create", okEnvelope.extend({ task: taskSchema }), {
    token,
    body: input,
  });
}

export function saveWeekWords(
  token: string,
  input: { week: string; went_well: string; went_badly: string },
) {
  return postHqJson("hq/review/note/save", okEnvelope.extend({ week: z.string() }), {
    token,
    body: input,
  });
}

export function sendWeeklyNote(token: string, week: string, again: boolean) {
  return postHqJson(
    "hq/review/note/send",
    okEnvelope.extend({ week: z.string(), sent_to: z.number(), subject: z.string() }),
    { token, body: { week, again } },
  );
}

export function updateReviewSettings(
  token: string,
  input: { primary_metric: string; note_on: boolean; note_weekday: number; note_hour_utc: number },
) {
  return postHqJson(
    "hq/review/settings/update",
    okEnvelope.extend({ settings: reviewSchema.shape.settings }),
    { token, body: input },
  );
}
