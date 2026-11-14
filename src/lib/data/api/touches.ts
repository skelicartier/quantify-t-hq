import "server-only";

import { z } from "zod";

import { staffSchema } from "@/lib/data/api/replies";
import type { Staff } from "@/lib/data/gate";
import { dataAsk, id, ok } from "@/lib/data/socket";

/**
 * Touches by hand (ws-notes/company/spec.md §8): connection requests, messages, calls and
 * meetings outside email, logged on a lead or an investor firm, with the weekly counts.
 * Nothing is automated and nothing is sent.
 */

export const touchKindSchema = z.enum([
  "request",
  "accepted",
  "message",
  "replied",
  "comment",
  "call",
  "met",
  "other",
]);
export type TouchKind = z.infer<typeof touchKindSchema>;
export const touchSubjectKindSchema = z.enum(["lead", "investor"]);

export const touchSchema = z.object({
  touch_id: z.string(),
  subject: z.object({ kind: touchSubjectKindSchema, id: z.string(), name: z.string() }),
  on: z.string(),
  kind: touchKindSchema,
  note: z.string(),
  at: z.string(),
  by: staffSchema,
  withdrawn: z.object({ at: z.string(), by: staffSchema }).nullable(),
});

export const touchRowSchema = touchSchema.extend({ href: z.string() });
export type TouchRow = z.infer<typeof touchRowSchema>;

export const touchWeekSchema = z.object({
  week_from: z.string(),
  requests: z.number(),
  accepted: z.number(),
  messages: z.number(),
  other: z.number(),
});
export type TouchWeek = z.infer<typeof touchWeekSchema>;

export const touchesPageSchema = ok.extend({
  touches: z.array(touchRowSchema),
  total: z.number(),
  offset: z.number(),
  limit: z.number(),
  counts: z.record(z.string(), z.number()),
  weeks: z.array(touchWeekSchema),
  this_week: z.object({ from: z.string(), requests: z.number(), messages: z.number() }),
  four_weeks: z.object({ requests: z.number(), accepted: z.number() }),
  warnings: z.array(z.string()),
  today: z.string(),
});
export type TouchesPage = z.infer<typeof touchesPageSchema>;

const touchAnswer = ok.extend({ touch: touchRowSchema });

export type TouchesQuery = {
  subject_kind?: string;
  subject_id?: string;
  kind?: string;
  offset?: number;
};

export function readTouches(input: TouchesQuery = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input))
    if (value !== undefined && value !== "" && value !== 0) params.set(key, String(value));
  const rendered = params.toString();
  return dataAsk(touchesPageSchema, "GET", `/data/touches${rendered ? `?${rendered}` : ""}`);
}

export type TouchInput = {
  subject_kind: "lead" | "investor";
  subject_id: string;
  subject_name: string;
  on: string;
  kind: string;
  note: string;
};

export const logTouch = (input: TouchInput, by: Staff, attempt: string) =>
  dataAsk(touchAnswer, "POST", "/data/touches", { ...input, by, attempt });

export const withdrawTouch = (touchId: string, by: Staff) =>
  dataAsk(touchAnswer, "POST", `/data/touches/${id(touchId)}/withdraw`, { by });

export const restoreTouch = (touchId: string, by: Staff) =>
  dataAsk(touchAnswer, "POST", `/data/touches/${id(touchId)}/restore`, { by });
