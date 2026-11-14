import "server-only";

import { fieldValue } from "@/lib/auth/forms";
import {
  decisionStatusSchema,
  type DecisionInput,
  type DecisionStatus,
} from "@/lib/data/api/notes";
import { dayValue } from "@/lib/data/gate";
import type { ActionState } from "@/lib/forms/action-state";

/**
 * What the decision forms and the note forms read from a submitted form, shared by
 * `notes/actions.ts` and `decisions/actions.ts`. Not a `"use server"` module, so nothing
 * here can be called from a browser.
 */

const ROUTE_ID = /^[A-Za-z0-9-]{1,64}$/;
const STATUSES = new Set<string>(decisionStatusSchema.options);

export const NOT_A_DAY: ActionState = { status: "error", message: "That is not a day." };

/** An id from a hidden field, or "" when it is not one. */
export function idOf(formData: FormData, name: string): string {
  const value = fieldValue(formData, name, 64);
  return ROUTE_ID.test(value) ? value : "";
}

/** Typed into a date field: a day, "" when left blank, or null when it is not a day. */
export function typedDay(formData: FormData, name: string): string | null {
  const value = fieldValue(formData, name, 10).trim();
  if (!value) return "";
  return dayValue(value) || null;
}

/**
 * Whether a form reader gave back a refusal rather than fields. By `message`, never by
 * `status`: a decision's own fields carry a `status` of their own.
 */
export const isState = (value: object): value is ActionState => "message" in value;

/** "Decision", "Why", "Who decided", "On", "Status" and "It replaces". */
export function decisionFieldsOf(formData: FormData): DecisionInput | ActionState {
  const title = fieldValue(formData, "title", 200).trim();
  if (!title) return { status: "error", message: "Write the decision." };
  const decidedOn = typedDay(formData, "decided_on");
  if (decidedOn === null) return NOT_A_DAY;
  const status = fieldValue(formData, "status", 20);
  if (!STATUSES.has(status))
    return { status: "error", message: "Choose the status of the decision." };
  return {
    title,
    why: fieldValue(formData, "why", 4_000),
    decided_by: fieldValue(formData, "decided_by", 120),
    decided_on: decidedOn,
    status: status as DecisionStatus,
    supersedes: idOf(formData, "supersedes"),
  };
}
