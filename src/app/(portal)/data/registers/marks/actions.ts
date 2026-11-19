"use server";

import { attemptOf, copyFrom, idOf, isState } from "@/components/data/meetings/form-values";
import { fieldValue } from "@/lib/auth/forms";
import * as api from "@/lib/data/api/marks";
import { gate, refreshData, refusal, refused, sent, staffOf } from "@/lib/data/gate";
import type { ActionState } from "@/lib/forms/action-state";

/**
 * The trademark register's writes (ws-notes/duties/spec.md §6.4): a mark and class added or
 * edited, a step recorded (it sets the status it implies), the status changed, a renewal,
 * a watch note, a paper attached or detached. Each: the gate, one call, a refresh, a sentence.
 */

const BASE = "/data/registers/marks";
const NO_MARK: ActionState = { status: "error", message: "That mark is not here." };
const FIELDS = [
  "name",
  "kind",
  "class_number",
  "goods",
  "application_number",
  "applied_on",
  "applicant",
  "agent",
  "filed_as_startup",
  "fee_paid",
  "expires_on",
  "notes",
] as const;

function fieldsOf(formData: FormData): Record<string, string> {
  const input: Record<string, string> = {};
  for (const name of FIELDS) if (formData.has(name)) input[name] = fieldValue(formData, name, 2000);
  return input;
}

async function act(
  formData: FormData,
  markId: string,
  call: (by: ReturnType<typeof staffOf>) => Promise<unknown>,
  said: string,
): Promise<ActionState> {
  const context = await gate(formData, markId ? `${BASE}/${markId}` : BASE);
  if (refused(context)) return context;
  try {
    await call(staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshData("/data/registers", BASE, ...(markId ? [`${BASE}/${markId}`] : []));
  return sent(said);
}

export async function addMarkAction(_previous: ActionState, formData: FormData) {
  return act(
    formData,
    "",
    (by) => api.addMark(fieldsOf(formData), by, attemptOf(formData)),
    "Added.",
  );
}

export async function updateMarkAction(_previous: ActionState, formData: FormData) {
  const markId = idOf(formData, "mark_id");
  if (!markId) return NO_MARK;
  return act(formData, markId, (by) => api.updateMark(markId, fieldsOf(formData), by), "Saved.");
}

export async function markStepAction(_previous: ActionState, formData: FormData) {
  const markId = idOf(formData, "mark_id");
  if (!markId) return NO_MARK;
  return act(
    formData,
    markId,
    (by) =>
      api.recordMarkStep(
        markId,
        {
          step: fieldValue(formData, "step", 30),
          on: fieldValue(formData, "on", 10),
          number: fieldValue(formData, "number", 40),
        },
        by,
      ),
    "Recorded.",
  );
}

export async function markStatusAction(_previous: ActionState, formData: FormData) {
  const markId = idOf(formData, "mark_id");
  if (!markId) return NO_MARK;
  return act(
    formData,
    markId,
    (by) =>
      api.setMarkStatus(
        markId,
        { status: fieldValue(formData, "status", 30), on: fieldValue(formData, "on", 10) },
        by,
      ),
    "Saved.",
  );
}

export async function markRenewedAction(_previous: ActionState, formData: FormData) {
  const markId = idOf(formData, "mark_id");
  if (!markId) return NO_MARK;
  return act(
    formData,
    markId,
    (by) =>
      api.recordRenewal(
        markId,
        {
          renewed_on: fieldValue(formData, "renewed_on", 10),
          expires_on: fieldValue(formData, "expires_on", 10),
          srn: fieldValue(formData, "srn", 40),
        },
        by,
      ),
    "Recorded. The renewal dates start again from the new expiry.",
  );
}

export async function markWatchAction(_previous: ActionState, formData: FormData) {
  const markId = idOf(formData, "mark_id");
  if (!markId) return NO_MARK;
  return act(
    formData,
    markId,
    (by) =>
      api.addWatchNote(
        markId,
        { text: fieldValue(formData, "text", 1000), on: fieldValue(formData, "on", 10) },
        by,
        attemptOf(formData),
      ),
    "Noted.",
  );
}

export async function markFileAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const markId = idOf(formData, "mark_id");
  if (!markId) return NO_MARK;
  const detach = fieldValue(formData, "detach", 4) === "1";
  if (detach) {
    const fileId = idOf(formData, "file_id");
    return act(
      formData,
      markId,
      (by) => api.markFiles(markId, { file_id: fileId, detach: true }, by),
      "Detached. The file stays in Files.",
    );
  }
  const copy = await copyFrom(formData);
  if (isState(copy)) return copy;
  if (!("file_id" in copy) && !("content" in copy))
    return { status: "error", message: "Choose the file first." };
  const result = await act(formData, markId, (by) => api.markFiles(markId, copy, by), "Attached.");
  refreshData("/data/files");
  return result;
}
