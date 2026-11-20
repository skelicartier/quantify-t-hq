"use server";

import { attemptOf, copyFrom, idOf, isState } from "@/components/data/meetings/form-values";
import { fieldValue } from "@/lib/auth/forms";
import * as api from "@/lib/data/api/logs";
import { gate, refreshData, refusal, refused, sent, staffOf } from "@/lib/data/gate";
import type { ActionState } from "@/lib/forms/action-state";

/**
 * The writes of Systems › Logs and time (ws-notes/security/spec.md §7.4): add or edit a
 * system, record a look, retire a system (it stays listed), and his months between looks.
 */

const BASE = "/data/systems/logs";
const NOT_HERE: ActionState = { status: "error", message: "That system is not here." };

const FIELDS = [
  "tool_id",
  "name",
  "where",
  "retention_days",
  "place",
  "region",
  "time_source",
  "time_detail",
  "zone_recorded",
  "notes",
] as const;

function fieldsOf(formData: FormData): Record<string, string | string[]> {
  const input: Record<string, string | string[]> = {};
  for (const name of FIELDS) if (formData.has(name)) input[name] = fieldValue(formData, name, 2000);
  // The checkboxes: every box ticked, and none when none is (the form always sends the set).
  input.kinds = formData
    .getAll("kinds")
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.slice(0, 20));
  return input;
}

function refresh(logId?: string): void {
  refreshData(BASE, ...(logId ? [`${BASE}/${logId}`] : []));
}

async function act(
  formData: FormData,
  logId: string | null,
  call: (by: ReturnType<typeof staffOf>) => Promise<unknown>,
  said: string,
): Promise<ActionState> {
  const context = await gate(formData, logId ? `${BASE}/${logId}` : BASE);
  if (refused(context)) return context;
  try {
    await call(staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refresh(logId ?? undefined);
  return sent(said);
}

export async function addLogAction(_previous: ActionState, formData: FormData) {
  return act(
    formData,
    null,
    (by) => api.addLog(fieldsOf(formData), by, attemptOf(formData)),
    "Added. Adding it counts as its first look.",
  );
}

export async function updateLogAction(_previous: ActionState, formData: FormData) {
  const logId = idOf(formData, "log_id");
  if (!logId) return NOT_HERE;
  return act(formData, logId, (by) => api.updateLog(logId, fieldsOf(formData), by), "Saved.");
}

export async function recordLookAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const logId = idOf(formData, "log_id");
  if (!logId) return NOT_HERE;
  const copy = await copyFrom(formData);
  if (isState(copy)) return copy;
  return act(
    formData,
    logId,
    (by) =>
      api.recordLook(
        logId,
        {
          on: fieldValue(formData, "on", 10),
          by_name: fieldValue(formData, "by_name", 120),
          note: fieldValue(formData, "note", 1000),
        },
        copy,
        by,
        attemptOf(formData),
      ),
    "Look recorded.",
  );
}

export async function retireLogAction(_previous: ActionState, formData: FormData) {
  const logId = idOf(formData, "log_id");
  if (!logId) return NOT_HERE;
  return act(
    formData,
    logId,
    (by) =>
      api.retireLog(
        logId,
        { on: fieldValue(formData, "on", 10), why: fieldValue(formData, "why", 300) },
        by,
      ),
    "Retired. It stays listed.",
  );
}

export async function saveLogsSetupAction(_previous: ActionState, formData: FormData) {
  return act(
    formData,
    null,
    (by) => api.saveLogsSetup(fieldValue(formData, "check_months", 4), by),
    "Saved.",
  );
}
