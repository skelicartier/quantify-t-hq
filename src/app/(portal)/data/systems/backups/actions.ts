"use server";

import { attemptOf, copyFrom, idOf, isState } from "@/components/data/meetings/form-values";
import { fieldValue } from "@/lib/auth/forms";
import * as api from "@/lib/data/api/recovery";
import { gate, refreshData, refusal, refused, sent, staffOf } from "@/lib/data/gate";
import type { ActionState } from "@/lib/forms/action-state";

/**
 * The writes of Systems › Backups (ws-notes/security/spec.md §7.4): add or edit a backup,
 * record a restore test with how long it took and what came back, retire a backup (it stays
 * listed).
 */

const BASE = "/data/systems/backups";
const NOT_HERE: ActionState = { status: "error", message: "That backup is not here." };

const FIELDS = [
  "kind",
  "tool_id",
  "name",
  "what",
  "how_often",
  "where",
  "off_system",
  "cannot_be_changed",
  "owner",
  "every_months",
  "notes",
] as const;
const TEST_FIELDS = ["on", "by_name", "minutes", "outcome", "what_restored", "note"] as const;

function fieldsOf(formData: FormData, names: readonly string[]): Record<string, string> {
  const input: Record<string, string> = {};
  for (const name of names) if (formData.has(name)) input[name] = fieldValue(formData, name, 2000);
  return input;
}

function refresh(backupId?: string): void {
  refreshData(BASE, ...(backupId ? [`${BASE}/${backupId}`] : []));
}

async function act(
  formData: FormData,
  backupId: string | null,
  call: (by: ReturnType<typeof staffOf>) => Promise<unknown>,
  said: string,
): Promise<ActionState> {
  const context = await gate(formData, backupId ? `${BASE}/${backupId}` : BASE);
  if (refused(context)) return context;
  try {
    await call(staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refresh(backupId ?? undefined);
  return sent(said);
}

export async function addBackupAction(_previous: ActionState, formData: FormData) {
  return act(
    formData,
    null,
    (by) => api.addBackup(fieldsOf(formData, FIELDS), by, attemptOf(formData)),
    "Added. Record a restore from its page: a backup is only proven by restoring it.",
  );
}

export async function updateBackupAction(_previous: ActionState, formData: FormData) {
  const backupId = idOf(formData, "backup_id");
  if (!backupId) return NOT_HERE;
  return act(
    formData,
    backupId,
    (by) => api.updateBackup(backupId, fieldsOf(formData, FIELDS), by),
    "Saved.",
  );
}

export async function recordRestoreAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const backupId = idOf(formData, "backup_id");
  if (!backupId) return NOT_HERE;
  const copy = await copyFrom(formData);
  if (isState(copy)) return copy;
  return act(
    formData,
    backupId,
    (by) =>
      api.recordRestore(backupId, fieldsOf(formData, TEST_FIELDS), copy, by, attemptOf(formData)),
    "Restore test recorded.",
  );
}

export async function retireBackupAction(_previous: ActionState, formData: FormData) {
  const backupId = idOf(formData, "backup_id");
  if (!backupId) return NOT_HERE;
  return act(
    formData,
    backupId,
    (by) =>
      api.retireBackup(
        backupId,
        { on: fieldValue(formData, "on", 10), why: fieldValue(formData, "why", 300) },
        by,
      ),
    "Retired. It stays listed.",
  );
}
