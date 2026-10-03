"use server";

import { revalidatePath } from "next/cache";

import { hasCapability, requireStaff } from "@/lib/access/core";
import * as reviewApi from "@/lib/api/review";
import { fieldValue } from "@/lib/auth/forms";
import { crmRefusal } from "@/lib/crm/refusal";
import type { ActionState } from "@/lib/forms/action-state";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";

const PAGE = "/reports/review";

const NOT_A_READER: ActionState = {
  status: "error",
  message: "The weekly review is taken part in by the roles that read the weekly report.",
};
const NOT_AN_ADMIN: ActionState = {
  status: "error",
  message: "Setting up the review is for an admin.",
};

function sent(message: string): ActionState {
  return { status: "sent", message, sentAt: Date.now() };
}

async function reader(formData: FormData) {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff(PAGE);
  return hasCapability(context, "revenue:read") ? context : null;
}

async function admin(formData: FormData) {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff(PAGE);
  return hasCapability(context, "hq:admin") ? context : null;
}

function done(message: string): ActionState {
  revalidatePath(PAGE);
  return sent(message);
}

/** A figure onto the scorecard, or its owner, goal or direction changed. */
export async function saveMetricAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await admin(formData);
  if (!context) return NOT_AN_ADMIN;
  try {
    await reviewApi.saveScorecardMetric(context.token, {
      metric_key: fieldValue(formData, "metric_key", 40),
      owner_staff_id: fieldValue(formData, "owner_staff_id", 64),
      goal: fieldValue(formData, "goal", 24).trim(),
      direction: fieldValue(formData, "direction", 10),
    });
  } catch (error) {
    return crmRefusal(error);
  }
  return done("Saved.");
}

export async function removeMetricAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await admin(formData);
  if (!context) return NOT_AN_ADMIN;
  try {
    await reviewApi.removeScorecardMetric(context.token, fieldValue(formData, "metric_key", 40));
  } catch (error) {
    return crmRefusal(error);
  }
  return done("Taken off the scorecard; its comments stay with their weeks.");
}

/** The week's one comment on a figure; an empty one takes it away. */
export async function noteMetricAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await reader(formData);
  if (!context) return NOT_A_READER;
  const note = fieldValue(formData, "note", 400).trim();
  try {
    await reviewApi.noteScorecardMetric(context.token, {
      metric_key: fieldValue(formData, "metric_key", 40),
      week: fieldValue(formData, "week", 8),
      note,
    });
  } catch (error) {
    return crmRefusal(error);
  }
  return done(note ? "Comment saved." : "Comment taken away.");
}

export async function createPriorityAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await admin(formData);
  if (!context) return NOT_AN_ADMIN;
  try {
    await reviewApi.createPriority(context.token, {
      quarter: fieldValue(formData, "quarter", 7),
      title: fieldValue(formData, "title", 200).trim(),
      detail: fieldValue(formData, "detail", 1000).trim(),
      owner_staff_id: fieldValue(formData, "owner_staff_id", 64),
    });
  } catch (error) {
    return crmRefusal(error);
  }
  return done("Priority added. Its owner is asked for its health every week.");
}

/** A priority's health this week: its owner's, or an admin's. */
export async function updatePriorityAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await reader(formData);
  if (!context) return NOT_A_READER;
  try {
    await reviewApi.updatePriority(context.token, fieldValue(formData, "priority_id", 64), {
      health: fieldValue(formData, "health", 12),
      note: fieldValue(formData, "note", 400).trim(),
      week: fieldValue(formData, "week", 8),
    });
  } catch (error) {
    return crmRefusal(error);
  }
  return done("The week's health is in.");
}

export async function closePriorityAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await reader(formData);
  if (!context) return NOT_A_READER;
  const state = fieldValue(formData, "state", 10);
  try {
    await reviewApi.closePriority(context.token, fieldValue(formData, "priority_id", 64), {
      state,
      note: fieldValue(formData, "note", 400).trim(),
    });
  } catch (error) {
    return crmRefusal(error);
  }
  return done(state === "done" ? "Marked done." : "Dropped.");
}

/** An action from the review: a task on its owner's list, back here until it is done. */
export async function addReviewActionAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await reader(formData);
  if (!context) return NOT_A_READER;
  try {
    await reviewApi.createReviewAction(context.token, {
      ref: fieldValue(formData, "ref", 80),
      title: fieldValue(formData, "title", 200).trim(),
      assignee_staff_id: fieldValue(formData, "assignee_staff_id", 64),
      due_on: fieldValue(formData, "due_on", 10),
    });
  } catch (error) {
    return crmRefusal(error);
  }
  revalidatePath("/tasks");
  return done("Action added. It is on its owner's task list and back here until it is done.");
}

export async function saveWeekWordsAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await reader(formData);
  if (!context) return NOT_A_READER;
  try {
    await reviewApi.saveWeekWords(context.token, {
      week: fieldValue(formData, "week", 8),
      went_well: fieldValue(formData, "went_well", 1000).trim(),
      went_badly: fieldValue(formData, "went_badly", 1000).trim(),
    });
  } catch (error) {
    return crmRefusal(error);
  }
  return done("Saved. The note below now reads them.");
}

export async function sendWeeklyNoteAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await admin(formData);
  if (!context) return NOT_AN_ADMIN;
  try {
    const result = await reviewApi.sendWeeklyNote(
      context.token,
      fieldValue(formData, "week", 8),
      fieldValue(formData, "again", 3) === "1",
    );
    return done(
      `Sent to ${result.sent_to.toLocaleString("en-GB")} ${result.sent_to === 1 ? "person" : "people"}.`,
    );
  } catch (error) {
    return crmRefusal(error);
  }
}

export async function saveReviewSettingsAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await admin(formData);
  if (!context) return NOT_AN_ADMIN;
  try {
    await reviewApi.updateReviewSettings(context.token, {
      primary_metric: fieldValue(formData, "primary_metric", 40),
      note_on: fieldValue(formData, "note_on", 3) === "on",
      note_weekday: Number.parseInt(fieldValue(formData, "note_weekday", 2), 10),
      note_hour_utc: Number.parseInt(fieldValue(formData, "note_hour_utc", 2), 10),
    });
  } catch (error) {
    return crmRefusal(error);
  }
  return done("Saved.");
}
