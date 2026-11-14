"use server";

import { attemptOf, routeIdOf } from "@/components/data/closing/form-copy";
import { fieldValue } from "@/lib/auth/forms";
import * as api from "@/lib/data/api/pilots";
import { gate, refreshData, refusal, refused, sent, staffOf } from "@/lib/data/gate";
import type { ActionState } from "@/lib/forms/action-state";
import { dayShort } from "@/lib/data/labels-close";

/**
 * Pilots' writes (ws-notes/company/spec.md §9.7.3): plan a pilot from a waitlist firm's
 * page, edit it, start it, log a check-in, record a criterion's result and the decision.
 * Each refreshes the pilot, the Pilots list, the firm's page, the overview's Due and Home.
 */

const BASE = "/data/waitlist/pilots";
const ROWS = [0, 1, 2, 3] as const;

function refreshPilots(pilotId: string, entryId: string): void {
  refreshData(
    BASE,
    "/home",
    ...(pilotId ? [`${BASE}/${pilotId}`] : []),
    ...(entryId ? [`/data/waitlist/${entryId}`] : []),
  );
}

/** The plan and edit form's fields, as the service takes them. */
function pilotInput(formData: FormData): api.PilotInput {
  const amount = fieldValue(formData, "price", 20).trim();
  const free = fieldValue(formData, "free", 8) === "on";
  const convertsOn = fieldValue(formData, "converts_on", 10).trim();
  const convertsAt = fieldValue(formData, "conversion_amount", 20).trim();
  return {
    starts_on: fieldValue(formData, "starts_on", 10).trim(),
    ends_on: fieldValue(formData, "ends_on", 10).trim(),
    criteria: ROWS.map((index) => ({
      what: fieldValue(formData, `criterion_${index}`, 200).trim(),
      target: fieldValue(formData, `target_${index}`, 200).trim(),
    })),
    owners: {
      sponsor: fieldValue(formData, "sponsor", 120).trim(),
      technical: fieldValue(formData, "technical", 120).trim(),
      user: fieldValue(formData, "user", 120).trim(),
    },
    free,
    price:
      free || !amount
        ? null
        : {
            amount,
            currency: fieldValue(formData, "currency", 3),
            note: fieldValue(formData, "price_note", 200).trim(),
          },
    conversion:
      convertsOn || convertsAt
        ? {
            on: convertsOn,
            amount: convertsAt,
            currency: fieldValue(formData, "currency", 3),
            per: fieldValue(formData, "per", 8),
          }
        : null,
    go_no_go_on: fieldValue(formData, "go_no_go_on", 10).trim(),
  };
}

export async function planPilotAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const entryId = routeIdOf(formData, "entry_id");
  const context = await gate(formData, `/data/waitlist/${entryId}`);
  if (refused(context)) return context;
  if (!entryId) return { status: "error", message: "That firm is not on the waitlist." };
  let line: string;
  let pilotId: string;
  try {
    const answer = await api.planPilot(
      { ...pilotInput(formData), entry_id: entryId },
      staffOf(context),
      attemptOf(formData),
    );
    line = answer.running_line.split(".")[0] ?? "";
    pilotId = answer.pilot.pilot_id;
  } catch (error) {
    return refusal(error);
  }
  refreshPilots(pilotId, entryId);
  return sent(`Planned. ${line}.`);
}

export async function updatePilotAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const pilotId = routeIdOf(formData, "pilot_id");
  const context = await gate(formData, `${BASE}/${pilotId}`);
  if (refused(context)) return context;
  if (!pilotId) return { status: "error", message: "That pilot is not here." };
  let entryId: string;
  try {
    entryId = (await api.updatePilot(pilotId, pilotInput(formData), staffOf(context))).pilot
      .entry_id;
  } catch (error) {
    return refusal(error);
  }
  refreshPilots(pilotId, entryId);
  return sent("Saved.");
}

export async function startPilotAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const pilotId = routeIdOf(formData, "pilot_id");
  const context = await gate(formData, `${BASE}/${pilotId}`);
  if (refused(context)) return context;
  if (!pilotId) return { status: "error", message: "That pilot is not here." };
  let entryId: string;
  try {
    entryId = (await api.startPilot(pilotId, staffOf(context))).pilot.entry_id;
  } catch (error) {
    return refusal(error);
  }
  refreshPilots(pilotId, entryId);
  return sent("Started.");
}

export async function checkInAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const pilotId = routeIdOf(formData, "pilot_id");
  const context = await gate(formData, `${BASE}/${pilotId}`);
  if (refused(context)) return context;
  if (!pilotId) return { status: "error", message: "That pilot is not here." };
  const note = fieldValue(formData, "note", 2_000).trim();
  if (!note) return { status: "error", message: "Write what was said at the check-in." };
  let next: string | null;
  let entryId: string;
  try {
    const answer = await api.logCheckIn(
      pilotId,
      { on: fieldValue(formData, "on", 10).trim(), note },
      staffOf(context),
      attemptOf(formData),
    );
    next = answer.next_check_in;
    entryId = answer.pilot.entry_id;
  } catch (error) {
    return refusal(error);
  }
  refreshPilots(pilotId, entryId);
  return sent(next ? `Logged. Next check-in ${dayShort(next)}.` : "Logged.");
}

export async function criterionResultAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const pilotId = routeIdOf(formData, "pilot_id");
  const criterionId = routeIdOf(formData, "criterion_id");
  const context = await gate(formData, `${BASE}/${pilotId}`);
  if (refused(context)) return context;
  if (!pilotId || !criterionId) return { status: "error", message: "That pilot is not here." };
  let entryId: string;
  try {
    entryId = (
      await api.recordCriterionResult(
        pilotId,
        criterionId,
        { result: fieldValue(formData, "result", 200).trim(), met: fieldValue(formData, "met", 3) },
        staffOf(context),
      )
    ).pilot.entry_id;
  } catch (error) {
    return refusal(error);
  }
  refreshPilots(pilotId, entryId);
  return sent("Recorded.");
}

export async function pilotDecisionAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const pilotId = routeIdOf(formData, "pilot_id");
  const context = await gate(formData, `${BASE}/${pilotId}`);
  if (refused(context)) return context;
  if (!pilotId) return { status: "error", message: "That pilot is not here." };
  const outcome = fieldValue(formData, "outcome", 10);
  let entryId: string;
  try {
    entryId = (
      await api.recordPilotDecision(
        pilotId,
        {
          outcome,
          on: fieldValue(formData, "on", 10).trim(),
          note: fieldValue(formData, "note", 2_000).trim(),
          ...(outcome === "extend"
            ? {
                ends_on: fieldValue(formData, "ends_on", 10).trim(),
                go_no_go_on: fieldValue(formData, "go_no_go_on", 10).trim(),
              }
            : {}),
          ...(outcome === "go"
            ? { converts_on: fieldValue(formData, "converts_on", 10).trim() }
            : {}),
        },
        staffOf(context),
      )
    ).pilot.entry_id;
  } catch (error) {
    return refusal(error);
  }
  refreshPilots(pilotId, entryId);
  return sent("Recorded.");
}
