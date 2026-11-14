"use server";

import { fieldValue } from "@/lib/auth/forms";
import * as api from "@/lib/data/api/notes";
import { gate, refreshData, refusal, refused, sent, staffOf } from "@/lib/data/gate";
import type { ActionState } from "@/lib/forms/action-state";

import { decisionFieldsOf, idOf, isState } from "./fields";

/**
 * Decisions' writes: one recorded here, one edited, and one marked superseded by a
 * decided decision. A decision recorded from a note goes through the note's own action.
 */

const NO_DECISION: ActionState = { status: "error", message: "That decision is not here." };

function refreshDecisions(): void {
  refreshData("/data/decisions", "/data/notes");
}

export async function addDecisionAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/data/decisions");
  if (refused(context)) return context;
  const fields = decisionFieldsOf(formData);
  if (isState(fields)) return fields;
  try {
    await api.addDecision(
      fields,
      staffOf(context),
      fieldValue(formData, "attempt", 64) || crypto.randomUUID(),
    );
  } catch (error) {
    return refusal(error);
  }
  refreshDecisions();
  return sent("Recorded the decision.");
}

export async function updateDecisionAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/data/decisions");
  if (refused(context)) return context;
  const decisionId = idOf(formData, "decision_id");
  if (!decisionId) return NO_DECISION;
  const fields = decisionFieldsOf(formData);
  if (isState(fields)) return fields;
  try {
    await api.updateDecision(decisionId, fields, staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshDecisions();
  return sent("Saved.");
}

export async function supersedeDecisionAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/data/decisions");
  if (refused(context)) return context;
  const decisionId = idOf(formData, "decision_id");
  if (!decisionId) return NO_DECISION;
  const byDecisionId = idOf(formData, "by_decision_id");
  if (!byDecisionId) return { status: "error", message: "Choose the decision that replaces it." };
  try {
    await api.supersedeDecision(decisionId, byDecisionId, staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshDecisions();
  return sent("Marked it superseded.");
}
