"use server";

import { attemptOf, copyOf, isRefusal, routeIdOf } from "@/components/data/closing/form-copy";
import { fieldValue } from "@/lib/auth/forms";
import * as api from "@/lib/data/api/diligence";
import { gate, refreshData, refusal, refused, sent, staffOf } from "@/lib/data/gate";
import type { ActionState } from "@/lib/forms/action-state";

/**
 * Buyer diligence's and dataset trials' writes (ws-notes/company/spec.md §9.7.5): open a
 * diligence, its questionnaire, the security review, a reference, a redline round; a trial,
 * its clearance, a sample sent and the decision. The service refuses a reference shared
 * before consent and a sample sent before clearance; this page shows its sentence.
 */

const BASE = "/data/waitlist/diligence";

function refreshDiligence(entryId: string): void {
  refreshData(BASE, "/data/files", ...(entryId ? [`/data/waitlist/${entryId}`] : []));
}

const NO_FIRM: ActionState = { status: "error", message: "That firm is not on the waitlist." };
const NOT_HERE: ActionState = { status: "error", message: "That diligence is not here." };

async function context(formData: FormData) {
  return gate(formData, `/data/waitlist/${routeIdOf(formData, "entry_id")}`);
}

export async function openDiligenceAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const staff = await context(formData);
  if (refused(staff)) return staff;
  const entryId = routeIdOf(formData, "entry_id");
  if (!entryId) return NO_FIRM;
  try {
    await api.openDiligence(entryId, staffOf(staff), attemptOf(formData));
  } catch (error) {
    return refusal(error);
  }
  refreshDiligence(entryId);
  return sent("Opened.");
}

export async function questionnaireAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const staff = await context(formData);
  if (refused(staff)) return staff;
  const diligenceId = routeIdOf(formData, "diligence_id");
  if (!diligenceId) return NOT_HERE;
  const file = await copyOf(formData, "file");
  if (isRefusal(file)) return file;
  const answers = await copyOf(formData, "answers_file");
  if (isRefusal(answers)) return answers;
  try {
    await api.saveQuestionnaire(
      diligenceId,
      {
        received_on: fieldValue(formData, "received_on", 10).trim(),
        due_on: fieldValue(formData, "due_on", 10).trim(),
        answered_on: fieldValue(formData, "answered_on", 10).trim(),
        questions: fieldValue(formData, "questions", 10).trim(),
        file,
        answers,
      },
      staffOf(staff),
    );
  } catch (error) {
    return refusal(error);
  }
  refreshDiligence(routeIdOf(formData, "entry_id"));
  return sent("Saved.");
}

export async function securityReviewAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const staff = await context(formData);
  if (refused(staff)) return staff;
  const diligenceId = routeIdOf(formData, "diligence_id");
  if (!diligenceId) return NOT_HERE;
  try {
    await api.saveSecurityReview(
      diligenceId,
      {
        started_on: fieldValue(formData, "started_on", 10).trim(),
        finished_on: fieldValue(formData, "finished_on", 10).trim(),
        outcome: fieldValue(formData, "outcome", 20),
        note: fieldValue(formData, "note", 2_000).trim(),
      },
      staffOf(staff),
    );
  } catch (error) {
    return refusal(error);
  }
  refreshDiligence(routeIdOf(formData, "entry_id"));
  return sent("Saved.");
}

export async function referenceAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const staff = await context(formData);
  if (refused(staff)) return staff;
  const diligenceId = routeIdOf(formData, "diligence_id");
  if (!diligenceId) return NOT_HERE;
  const referenceId = routeIdOf(formData, "reference_id");
  const input: api.ReferenceInput = {
    name: fieldValue(formData, "name", 120).trim(),
    firm: fieldValue(formData, "firm", 120).trim(),
    role: fieldValue(formData, "role", 120).trim(),
    consent_on: fieldValue(formData, "consent_on", 10).trim(),
    shared_on: fieldValue(formData, "shared_on", 10).trim(),
    outcome: fieldValue(formData, "outcome", 400).trim(),
  };
  try {
    if (referenceId) await api.updateReference(diligenceId, referenceId, input, staffOf(staff));
    else await api.addReference(diligenceId, input, staffOf(staff));
  } catch (error) {
    return refusal(error);
  }
  refreshDiligence(routeIdOf(formData, "entry_id"));
  return sent(referenceId ? "Saved." : "Added.");
}

export async function redlineAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const staff = await context(formData);
  if (refused(staff)) return staff;
  const diligenceId = routeIdOf(formData, "diligence_id");
  if (!diligenceId) return NOT_HERE;
  const file = await copyOf(formData, "file");
  if (isRefusal(file)) return file;
  const redlineId = routeIdOf(formData, "redline_id");
  const input: api.RedlineInput = {
    document: fieldValue(formData, "document", 200).trim(),
    agreement_id: routeIdOf(formData, "agreement_id"),
    round: fieldValue(formData, "round", 4).trim(),
    sent_on: fieldValue(formData, "sent_on", 10).trim(),
    received_on: fieldValue(formData, "received_on", 10).trim(),
    status: fieldValue(formData, "status", 20),
    file,
  };
  try {
    if (redlineId) await api.updateRedline(diligenceId, redlineId, input, staffOf(staff));
    else await api.addRedline(diligenceId, input, staffOf(staff));
  } catch (error) {
    return refusal(error);
  }
  refreshDiligence(routeIdOf(formData, "entry_id"));
  return sent(redlineId ? "Saved." : "Added.");
}

export async function closeDiligenceAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const staff = await context(formData);
  if (refused(staff)) return staff;
  const diligenceId = routeIdOf(formData, "diligence_id");
  if (!diligenceId) return NOT_HERE;
  try {
    if (fieldValue(formData, "reopen", 4) === "1")
      await api.reopenDiligence(diligenceId, staffOf(staff));
    else await api.closeDiligence(diligenceId, staffOf(staff));
  } catch (error) {
    return refusal(error);
  }
  refreshDiligence(routeIdOf(formData, "entry_id"));
  return sent("Done.");
}

export async function addTrialAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const staff = await context(formData);
  if (refused(staff)) return staff;
  const entryId = routeIdOf(formData, "entry_id");
  if (!entryId) return NO_FIRM;
  try {
    await api.addTrial(
      entryId,
      {
        dataset: fieldValue(formData, "dataset", 120).trim(),
        dictionary_version: fieldValue(formData, "dictionary_version", 40).trim(),
        starts_on: fieldValue(formData, "starts_on", 10).trim(),
        ends_on: fieldValue(formData, "ends_on", 10).trim(),
        go_no_go_on: fieldValue(formData, "go_no_go_on", 10).trim(),
      },
      staffOf(staff),
      attemptOf(formData),
    );
  } catch (error) {
    return refusal(error);
  }
  refreshDiligence(entryId);
  return sent("Added.");
}

export async function clearanceAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const staff = await context(formData);
  if (refused(staff)) return staff;
  const trialId = routeIdOf(formData, "trial_id");
  if (!trialId) return { status: "error", message: "That trial is not here." };
  try {
    await api.recordClearance(
      trialId,
      {
        cleared_on: fieldValue(formData, "cleared_on", 10).trim(),
        by_name: fieldValue(formData, "by_name", 120).trim(),
      },
      staffOf(staff),
    );
  } catch (error) {
    return refusal(error);
  }
  refreshDiligence(routeIdOf(formData, "entry_id"));
  return sent("Recorded.");
}

export async function sampleAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const staff = await context(formData);
  if (refused(staff)) return staff;
  const trialId = routeIdOf(formData, "trial_id");
  if (!trialId) return { status: "error", message: "That trial is not here." };
  const file = await copyOf(formData, "file");
  if (isRefusal(file)) return file;
  try {
    await api.sendSample(
      trialId,
      { sent_on: fieldValue(formData, "sent_on", 10).trim(), file },
      staffOf(staff),
    );
  } catch (error) {
    return refusal(error);
  }
  refreshDiligence(routeIdOf(formData, "entry_id"));
  return sent("Recorded.");
}

export async function trialDecisionAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const staff = await context(formData);
  if (refused(staff)) return staff;
  const trialId = routeIdOf(formData, "trial_id");
  if (!trialId) return { status: "error", message: "That trial is not here." };
  try {
    await api.recordTrialDecision(
      trialId,
      {
        outcome: fieldValue(formData, "outcome", 10),
        on: fieldValue(formData, "on", 10).trim(),
        note: fieldValue(formData, "note", 2_000).trim(),
      },
      staffOf(staff),
    );
  } catch (error) {
    return refusal(error);
  }
  refreshDiligence(routeIdOf(formData, "entry_id"));
  return sent("Recorded.");
}
