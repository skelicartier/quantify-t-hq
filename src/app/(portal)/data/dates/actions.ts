"use server";

import { fieldValue } from "@/lib/auth/forms";
import * as api from "@/lib/data/api/dates";
import { dayValue, gate, refreshData, refusal, refused, sent, staffOf } from "@/lib/data/gate";
import type { ActionState } from "@/lib/forms/action-state";
import { formatDate } from "@/lib/format";

/**
 * Key dates' writes: adding a date (by hand or from a suggestion, only ever on his press),
 * editing it, marking it done or not for us, deleting it, and the AGM date the
 * suggestions are worked out from.
 */

const ROUTE_ID = /^[A-Za-z0-9-]{1,64}$/;
const KINDS = new Set<string>(api.dateKindSchema.options);
const REPEATS = new Set<string>(api.repeatsSchema.options);
const NO_DATE: ActionState = { status: "error", message: "That date is not here." };

const attemptOf = (formData: FormData): string =>
  fieldValue(formData, "attempt", 64) || crypto.randomUUID();

const dateIdFrom = (formData: FormData): string => {
  const value = fieldValue(formData, "date_id", 64);
  return ROUTE_ID.test(value) ? value : "";
};

function refreshDates(): void {
  refreshData("/data/dates");
}

/** The form's fields, checked as far as the portal can; the service checks the rest. */
function fieldsOf(formData: FormData): api.DateFields | ActionState {
  const title = fieldValue(formData, "title", 200).trim();
  if (!title) return { status: "error", message: "Say what is due." };
  const kind = fieldValue(formData, "kind", 20);
  if (!KINDS.has(kind)) return { status: "error", message: "Choose the kind of date." };
  const dueOn = dayValue(fieldValue(formData, "due_on", 10));
  if (!dueOn) return { status: "error", message: "Choose the day it is due." };
  const repeats = fieldValue(formData, "repeats", 20) || "never";
  if (!REPEATS.has(repeats)) return { status: "error", message: "Choose how often it repeats." };
  return {
    title,
    kind: kind as api.DateFields["kind"],
    due_on: dueOn,
    repeats: repeats as api.DateFields["repeats"],
    entity: fieldValue(formData, "entity", 120),
    handled_by: fieldValue(formData, "handled_by", 120),
    remind_days: Number(fieldValue(formData, "remind_days", 4) || "7"),
    notes: fieldValue(formData, "notes", 4_000),
    file_id: fieldValue(formData, "file_id", 64),
  };
}

const isState = (value: api.DateFields | ActionState): value is ActionState => "status" in value;

export async function addDateAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/data/dates");
  if (refused(context)) return context;
  const fields = fieldsOf(formData);
  if (isState(fields)) return fields;
  try {
    await api.addDate(fields, staffOf(context), attemptOf(formData));
  } catch (error) {
    return refusal(error);
  }
  refreshDates();
  return sent("Date added.");
}

export async function updateDateAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/data/dates");
  if (refused(context)) return context;
  const dateId = dateIdFrom(formData);
  if (!dateId) return NO_DATE;
  const putBack = fieldValue(formData, "state", 20) === "coming_up";
  try {
    if (putBack && !formData.has("title"))
      await api.updateDate(dateId, { state: "coming_up" }, staffOf(context));
    else {
      const fields = fieldsOf(formData);
      if (isState(fields)) return fields;
      await api.updateDate(dateId, fields, staffOf(context));
    }
  } catch (error) {
    return refusal(error);
  }
  refreshDates();
  return sent(putBack ? "Put back." : "Saved.");
}

export async function doneDateAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/data/dates");
  if (refused(context)) return context;
  const dateId = dateIdFrom(formData);
  if (!dateId) return NO_DATE;
  let message = "Done.";
  try {
    const date = (await api.doneDate(dateId, fieldValue(formData, "note", 4_000), staffOf(context)))
      .date;
    if (date.state === "coming_up") message = `Done. It is next due on ${formatDate(date.due_on)}.`;
  } catch (error) {
    return refusal(error);
  }
  refreshDates();
  return sent(message);
}

export async function notForUsAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/data/dates");
  if (refused(context)) return context;
  const dateId = dateIdFrom(formData);
  if (!dateId) return NO_DATE;
  try {
    await api.notForUsDate(dateId, fieldValue(formData, "note", 4_000), staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshDates();
  return sent("Marked not for us.");
}

export async function deleteDateAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/data/dates");
  if (refused(context)) return context;
  const dateId = dateIdFrom(formData);
  if (!dateId) return NO_DATE;
  try {
    await api.deleteDate(dateId, staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshDates();
  return sent("Deleted.");
}

export async function addSuggestedAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/data/dates");
  if (refused(context)) return context;
  const key = fieldValue(formData, "key", 64);
  if (!ROUTE_ID.test(key)) return { status: "error", message: "That suggestion is not here." };
  const dueOn = fieldValue(formData, "due_on", 10).trim();
  if (dueOn && !dayValue(dueOn)) return { status: "error", message: "That is not a day." };
  let title = "";
  try {
    title = (
      await api.addSuggestedDate(
        key,
        dueOn ? { due_on: dueOn } : {},
        staffOf(context),
        attemptOf(formData),
      )
    ).date.title;
  } catch (error) {
    return refusal(error);
  }
  refreshDates();
  return sent(`Added: ${title}.`);
}

export async function setFactsAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/data/dates");
  if (refused(context)) return context;
  const agm = fieldValue(formData, "agm_on", 10).trim();
  if (agm && !dayValue(agm)) return { status: "error", message: "That is not a day." };
  try {
    await api.setDateFacts(agm, staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshDates();
  return sent(agm ? "The AGM-based dates are worked out from it." : "Cleared.");
}
