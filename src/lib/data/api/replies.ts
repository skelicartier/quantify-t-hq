import "server-only";

import { z } from "zod";

import type { Staff } from "@/lib/data/gate";
import { dataAsk, id, ok } from "@/lib/data/socket";

/**
 * Replies and follow-ups: a reply recorded once, what it did, taking it back, and what is
 * owed. HQ never reads the mailbox: every reply here was typed or pasted in by a person.
 */

export const outcomeSchema = z.enum([
  "replied_positive",
  "not_interested",
  "not_now",
  "out_of_office",
  "wrong_person",
  "question",
]);
export type ReplyOutcome = z.infer<typeof outcomeSchema>;

export const staffSchema = z.object({ staff_id: z.string(), name: z.string() });

export const effectSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("waitlist_joined"), entry_id: z.string(), created: z.boolean() }),
  z.object({ kind: z.literal("stop_added"), email: z.string() }),
  z.object({ kind: z.literal("stop_already"), email: z.string() }),
  z.object({ kind: z.literal("stop_failed"), email: z.string() }),
  z.object({ kind: z.literal("follow_up"), follow_up_id: z.string() }),
  z.object({ kind: z.literal("lead_added"), lead_id: z.string(), email: z.string() }),
  z.object({
    kind: z.literal("investor_stage"),
    investor_id: z.string(),
    from: z.string(),
    to: z.string(),
  }),
]);
export type Effect = z.infer<typeof effectSchema>;

export const replyRowSchema = z.object({
  kind: z.literal("reply"),
  reply_id: z.string(),
  email: z.string(),
  lead_id: z.string(),
  outcome: outcomeSchema,
  received_at: z.string(),
  subject: z.string(),
  words: z.string(),
  later_until: z.string().nullable(),
  referral: z.object({ name: z.string(), email: z.string(), title: z.string() }).nullable(),
  mailing_id: z.string().nullable(),
  mailing: z.string(),
  recorded_at: z.string(),
  recorded_by: staffSchema,
  effects: z.array(effectSchema),
  attempt: z.string(),
  name: z.string(),
  firm: z.string(),
  taken_back: z
    .object({
      at: z.string(),
      by: staffSchema,
      undone: z.array(effectSchema),
      kept: z.array(z.object({ effect: effectSchema, why: z.string() })),
    })
    .nullable(),
});
export type ReplyRow = z.infer<typeof replyRowSchema>;

export const followUpKindSchema = z.enum([
  "answer",
  "write_again",
  "write_to_named",
  "find_address",
  "other",
]);

export const followUpSchema = z.object({
  follow_up_id: z.string(),
  lead_id: z.string(),
  email: z.string(),
  name: z.string(),
  kind: followUpKindSchema,
  title: z.string(),
  due_on: z.string(),
  from_reply_id: z.string().nullable(),
  state: z.enum(["open", "done", "closed_by_send", "taken_back"]),
  created_at: z.string(),
  done_at: z.string().nullable(),
  done_by: staffSchema.nullable(),
  note: z.string(),
});
export type FollowUp = z.infer<typeof followUpSchema>;

const countsSchema = z.record(z.string(), z.number());

export const repliesPageSchema = ok.extend({
  replies: z.array(replyRowSchema),
  total: z.number(),
  offset: z.number(),
  limit: z.number(),
  counts: countsSchema,
  live: countsSchema,
  today: z.string(),
  follow_ups_open: z.number(),
  waitlist: z.boolean(),
});
export type RepliesPage = z.infer<typeof repliesPageSchema>;

export const takeBackPlanSchema = ok.extend({
  undo: z.array(effectSchema),
  keep: z.array(z.object({ effect: effectSchema, why: z.string() })),
});
export type TakeBackPlan = z.infer<typeof takeBackPlanSchema>;

export const followUpsPageSchema = ok.extend({
  follow_ups: z.array(followUpSchema.extend({ firm: z.string() })),
  total: z.number(),
  offset: z.number(),
  limit: z.number(),
  overdue: z.number(),
  today: z.string(),
});
export type FollowUpsPage = z.infer<typeof followUpsPageSchema>;

export type RecordReplyInput = {
  email: string;
  outcome: ReplyOutcome;
  words: string;
  subject: string;
  received_at: string;
  later_until?: string;
  auto_reply?: boolean;
  referral?: { name: string; email: string; title: string };
  add_if_missing: boolean;
};

export const recordReply = (input: RecordReplyInput, by: Staff, attempt: string) =>
  dataAsk(
    ok.extend({ reply: replyRowSchema, message: z.string(), href: z.string().nullable() }),
    "POST",
    "/data/replies",
    { ...input, by, attempt },
  );

export function readReplies(query: { outcome?: string; q?: string; offset?: number } = {}) {
  const params = new URLSearchParams();
  if (query.outcome) params.set("outcome", query.outcome);
  if (query.q) params.set("q", query.q);
  if (query.offset) params.set("offset", String(query.offset));
  const rendered = params.toString();
  return dataAsk(repliesPageSchema, "GET", `/data/replies${rendered ? `?${rendered}` : ""}`);
}

export const readTakeBackPreview = (replyId: string) =>
  dataAsk(takeBackPlanSchema, "GET", `/data/replies/${id(replyId)}/take-back-preview`);

export const takeBackReply = (replyId: string, by: Staff) =>
  dataAsk(
    ok.extend({
      undone: z.array(effectSchema),
      kept: z.array(z.object({ effect: effectSchema, why: z.string() })),
      message: z.string(),
    }),
    "POST",
    `/data/replies/${id(replyId)}/take-back`,
    { by },
  );

export function readFollowUps(query: { state?: string; offset?: number } = {}) {
  const params = new URLSearchParams({ state: query.state ?? "open" });
  if (query.offset) params.set("offset", String(query.offset));
  return dataAsk(followUpsPageSchema, "GET", `/data/follow-ups?${params.toString()}`);
}

const followUpAnswer = ok.extend({ follow_up: followUpSchema });

export const addFollowUp = (
  input: { email: string; title: string; due_on: string },
  by: Staff,
  attempt: string,
) => dataAsk(followUpAnswer, "POST", "/data/follow-ups", { ...input, by, attempt });

export const doneFollowUp = (followUpId: string, note: string, by: Staff) =>
  dataAsk(followUpAnswer, "POST", `/data/follow-ups/${id(followUpId)}/done`, { note, by });

export const moveFollowUp = (followUpId: string, dueOn: string, by: Staff) =>
  dataAsk(followUpAnswer, "POST", `/data/follow-ups/${id(followUpId)}/move`, {
    due_on: dueOn,
    by,
  });
