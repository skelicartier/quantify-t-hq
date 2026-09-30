import "server-only";

import { z } from "zod";

import { fetchHqJson, postHqJson } from "@/lib/api/core";

const okEnvelope = z.object({ ok: z.literal(true) });

export const AI_STATES = [
  "ok",
  "no_grounded_answer",
  "rejected",
  "error",
  "not_configured",
  "disabled",
  "capped",
] as const;

/** Every AI answer: a state, the words for it, and the run it was (null when no call was made). */
const answer = okEnvelope.extend({
  state: z.enum(AI_STATES),
  message: z.string(),
  run_id: z.string().nullable(),
});

const draftSchema = answer.extend({
  draft: z.string().optional(),
  sources: z
    .array(z.object({ key: z.string(), kind: z.string(), id: z.string(), title: z.string() }))
    .default([]),
});
export type AiDraft = z.infer<typeof draftSchema>;

export function draftReply(token: string, ticketId: string) {
  return postHqJson("hq/ai/reply-draft", draftSchema, { token, body: { ticket_id: ticketId } });
}

const triageSchema = answer.extend({
  suggestion: z
    .object({
      tags: z.array(z.string()),
      priority: z.string(),
      duplicate: z.object({ ticket_id: z.string(), subject: z.string() }).nullable(),
      why: z.string(),
      current: z.object({ tags: z.array(z.string()), priority: z.string() }),
    })
    .optional(),
});
export type AiTriage = z.infer<typeof triageSchema>;

export function suggestTriage(token: string, ticketId: string) {
  return postHqJson("hq/ai/triage", triageSchema, { token, body: { ticket_id: ticketId } });
}

const briefSchema = answer.extend({
  brief: z.string().optional(),
  as_of: z.string().nullable().optional(),
  facts_used: z.number().optional(),
  facts: z.array(z.object({ key: z.string(), label: z.string(), value: z.string() })).default([]),
});
export type AiBrief = z.infer<typeof briefSchema>;

export function briefMe(token: string, subjectType: string, subjectId: string) {
  return postHqJson("hq/ai/brief", briefSchema, {
    token,
    body: { subject_type: subjectType, subject_id: subjectId },
  });
}

const tasksSchema = answer.extend({
  proposals: z
    .array(z.object({ title: z.string(), quote: z.string(), due_on: z.string() }))
    .default([]),
  company_id: z.string().optional(),
});
export type AiTasks = z.infer<typeof tasksSchema>;

export function tasksFromNotes(token: string, meetingId: string) {
  return postHqJson("hq/ai/tasks-from-notes", tasksSchema, {
    token,
    body: { meeting_id: meetingId },
  });
}

const filterSchema = answer.extend({
  conditions: z
    .array(z.object({ field: z.string(), op: z.string(), value: z.string() }))
    .default([]),
});
export type AiFilter = z.infer<typeof filterSchema>;

export function filterInWords(
  token: string,
  body: {
    list: string;
    text: string;
    fields: ReadonlyArray<{
      key: string;
      label: string;
      kind: string;
      choices?: ReadonlyArray<{ value: string; label: string }> | undefined;
    }>;
  },
) {
  return postHqJson("hq/ai/filter", filterSchema, { token, body });
}

export function sendAiFeedback(
  token: string,
  runId: string,
  verdict: "used" | "edited" | "dismissed",
) {
  return postHqJson(`hq/ai/runs/${runId}/feedback`, okEnvelope.extend({ verdict: z.string() }), {
    token,
    body: { verdict },
  });
}

const settingsSchema = okEnvelope.extend({
  configured: z.boolean(),
  model: z.string(),
  features: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      capability: z.string(),
      enabled: z.boolean(),
      runs_30d: z.number(),
      outcomes_30d: z.record(z.string(), z.number()),
      used_30d: z.number(),
      dismissed_30d: z.number(),
    }),
  ),
  daily_calls: z.number(),
  monthly_tokens: z.number(),
  tokens_this_month: z.number(),
  runs: z.array(
    z.object({
      run_id: z.string(),
      feature: z.string(),
      feature_label: z.string(),
      staff_name: z.string(),
      subject_type: z.string(),
      outcome: z.string(),
      verdict: z.string(),
      tokens: z.number(),
      created_at: z.string().nullable(),
    }),
  ),
});
export type AiSettings = z.infer<typeof settingsSchema>;

export function readAiSettings(token: string) {
  return fetchHqJson("hq/ai/settings", settingsSchema, { token });
}

export function updateAiSettings(token: string, body: Record<string, unknown>) {
  return postHqJson("hq/ai/settings/update", okEnvelope.extend({ updated: z.array(z.string()) }), {
    token,
    body,
  });
}
