"use server";

import { fieldValue } from "@/lib/auth/forms";
import * as api from "@/lib/data/api/touches";
import { gate, refreshData, refusal, refused, sent, staffOf } from "@/lib/data/gate";
import type { ActionState } from "@/lib/forms/action-state";

/**
 * Touches' writes: one logged from a lead's or an investor firm's Touches section, and
 * taking one back or restoring it from the Touches page. For Owners and Admins, as the rest
 * of Data; each refreshes the Touches page and the page the form came from.
 */

/** The page a form returns to: only ever a lead's or an investor firm's own page. */
const SUBJECT_PATH = /^\/data\/(leads|investors)\/[A-Za-z0-9-]{1,64}$/;
const SUBJECT_ID = /^[0-9a-f]{32}$/;
const ROUTE_ID = /^[A-Za-z0-9-]{1,64}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const attemptOf = (formData: FormData): string =>
  fieldValue(formData, "attempt", 64) || crypto.randomUUID();

function refreshTouches(formData: FormData): void {
  const back = fieldValue(formData, "path", 120);
  refreshData("/data/touches", ...(SUBJECT_PATH.test(back) ? [back] : []));
}

export async function logTouchAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/data/touches");
  if (refused(context)) return context;
  const subjectKind = fieldValue(formData, "subject_kind", 20);
  const subjectId = fieldValue(formData, "subject_id", 64).toLowerCase();
  if ((subjectKind !== "lead" && subjectKind !== "investor") || !SUBJECT_ID.test(subjectId))
    return { status: "error", message: "Say who the touch was with." };
  const on = fieldValue(formData, "on", 10).trim();
  if (on && !DAY.test(on)) return { status: "error", message: "That is not a day." };
  try {
    await api.logTouch(
      {
        subject_kind: subjectKind,
        subject_id: subjectId,
        subject_name: fieldValue(formData, "subject_name", 200),
        on,
        kind: fieldValue(formData, "kind", 20),
        note: fieldValue(formData, "note", 1_000),
      },
      staffOf(context),
      attemptOf(formData),
    );
  } catch (error) {
    return refusal(error);
  }
  refreshTouches(formData);
  return sent("Logged.");
}

export async function touchStateAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/data/touches");
  if (refused(context)) return context;
  const touchId = fieldValue(formData, "touch_id", 64);
  if (!ROUTE_ID.test(touchId)) return { status: "error", message: "That touch is not here." };
  const restore = fieldValue(formData, "to", 10) === "restore";
  try {
    if (restore) await api.restoreTouch(touchId, staffOf(context));
    else await api.withdrawTouch(touchId, staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshTouches(formData);
  return sent(restore ? "Restored." : "Withdrawn.");
}
