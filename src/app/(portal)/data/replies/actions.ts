"use server";

import { fieldValue } from "@/lib/auth/forms";
import * as api from "@/lib/data/api/replies";
import { dayValue, gate, refreshData, refusal, refused, sent, staffOf } from "@/lib/data/gate";
import type { ActionState } from "@/lib/forms/action-state";
import { typedInstant } from "@/lib/time-zone";

/**
 * Replies' writes: recording one (from Replies or from a lead), taking it back, and the
 * follow-ups it leaves. The service does what each reply means and says so in a sentence,
 * which the form shows as it is.
 */

const ROUTE_ID = /^[A-Za-z0-9-]{1,64}$/;
const LEAD_ID = /^[0-9a-f]{32}$/;
const OUTCOMES = new Set<string>([
  "replied_positive",
  "not_interested",
  "not_now",
  "out_of_office",
  "wrong_person",
  "question",
]);

const attemptOf = (formData: FormData): string =>
  fieldValue(formData, "attempt", 64) || crypto.randomUUID();

/** Where a reply shows: the overview, the list, Replies, and the lead's own page. */
function refreshReplies(leadId: string): void {
  refreshData(
    "/data/replies",
    "/data/leads",
    ...(LEAD_ID.test(leadId) ? [`/data/leads/${leadId}`] : []),
  );
}

export async function recordReplyAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/data/replies");
  if (refused(context)) return context;
  const outcome = fieldValue(formData, "outcome", 40);
  if (!OUTCOMES.has(outcome)) return { status: "error", message: "Choose what their answer was." };
  const email = fieldValue(formData, "email", 254).trim();
  if (!email) return { status: "error", message: "That is not an email address." };
  const received = fieldValue(formData, "received_at", 40).trim();
  const laterUntil = fieldValue(formData, "later_until", 10).trim();
  if (laterUntil && !dayValue(laterUntil))
    return { status: "error", message: "That is not a day." };
  const input: api.RecordReplyInput = {
    email,
    outcome: outcome as api.ReplyOutcome,
    words: fieldValue(formData, "words", 4_000),
    subject: fieldValue(formData, "subject", 200),
    received_at: received ? typedInstant(received, context.me.time_zone) : "",
    add_if_missing: fieldValue(formData, "add_if_missing", 10) === "on",
    ...(outcome === "not_now" && laterUntil ? { later_until: laterUntil } : {}),
    ...(outcome === "not_now" && fieldValue(formData, "auto_reply", 10) === "on"
      ? { auto_reply: true }
      : {}),
    ...(outcome === "wrong_person"
      ? {
          referral: {
            name: fieldValue(formData, "referral_name", 120),
            email: fieldValue(formData, "referral_email", 254).trim(),
            title: fieldValue(formData, "referral_title", 120),
          },
        }
      : {}),
  };
  let answer: { reply: api.ReplyRow; message: string; href: string | null };
  try {
    answer = await api.recordReply(input, staffOf(context), attemptOf(formData));
  } catch (error) {
    return refusal(error);
  }
  refreshReplies(answer.reply.lead_id);
  return {
    ...sent(answer.message),
    ...(answer.href
      ? { detail: JSON.stringify({ href: answer.href, label: "See the firm's page" }) }
      : {}),
  };
}

export async function takeBackReplyAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/data/replies");
  if (refused(context)) return context;
  const replyId = fieldValue(formData, "reply_id", 64);
  if (!ROUTE_ID.test(replyId)) return { status: "error", message: "That reply is not here." };
  let message = "";
  try {
    message = (await api.takeBackReply(replyId, staffOf(context))).message;
  } catch (error) {
    return refusal(error);
  }
  refreshReplies(fieldValue(formData, "lead_id", 64));
  return sent(message);
}

export async function addFollowUpAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/data/replies");
  if (refused(context)) return context;
  const email = fieldValue(formData, "email", 254).trim();
  if (!email) return { status: "error", message: "Type their address first." };
  const title = fieldValue(formData, "title", 200).trim();
  if (!title) return { status: "error", message: "Say what is to be done." };
  const dueOn = dayValue(fieldValue(formData, "due_on", 10));
  if (!dueOn) return { status: "error", message: "Choose the day it is due." };
  let leadId = "";
  try {
    leadId = (
      await api.addFollowUp({ email, title, due_on: dueOn }, staffOf(context), attemptOf(formData))
    ).follow_up.lead_id;
  } catch (error) {
    return refusal(error);
  }
  refreshReplies(leadId);
  return sent("Follow-up added.");
}

export async function doneFollowUpAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/data/replies");
  if (refused(context)) return context;
  const followUpId = fieldValue(formData, "follow_up_id", 64);
  if (!ROUTE_ID.test(followUpId))
    return { status: "error", message: "That follow-up is not here." };
  let leadId = "";
  try {
    leadId = (
      await api.doneFollowUp(followUpId, fieldValue(formData, "note", 4_000), staffOf(context))
    ).follow_up.lead_id;
  } catch (error) {
    return refusal(error);
  }
  refreshReplies(leadId);
  return sent("Done.");
}

export async function moveFollowUpAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/data/replies");
  if (refused(context)) return context;
  const followUpId = fieldValue(formData, "follow_up_id", 64);
  if (!ROUTE_ID.test(followUpId))
    return { status: "error", message: "That follow-up is not here." };
  const dueOn = dayValue(fieldValue(formData, "due_on", 10));
  if (!dueOn) return { status: "error", message: "Choose the day it is due." };
  let leadId = "";
  try {
    leadId = (await api.moveFollowUp(followUpId, dueOn, staffOf(context))).follow_up.lead_id;
  } catch (error) {
    return refusal(error);
  }
  refreshReplies(leadId);
  return sent("Moved.");
}
