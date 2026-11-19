"use server";

import { fieldValue } from "@/lib/auth/forms";
import * as api from "@/lib/data/api/close";
import { gate, refreshData, refusal, refused, sent, staffOf } from "@/lib/data/gate";
import type { ActionState } from "@/lib/forms/action-state";

/**
 * Month close's writes (ws-notes/duties/spec.md §9.7, §9.11), for Owners and Admins alike:
 * a row's state and note, a file attached to it, the commentary, sent, acknowledged, the
 * lock and reopening with a reason. Nothing here sends the pack: he sends it himself and
 * records that he did.
 */

const BASE = "/data/money/close";
const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;
const NO_MONTH: ActionState = { status: "error", message: "There is no such month." };
const MAX_FILE_BYTES = 3 * 1024 * 1024;

const periodFrom = (formData: FormData) => {
  const value = fieldValue(formData, "period", 7);
  return PERIOD.test(value) ? value : "";
};

function refreshClose(period: string): void {
  refreshData(
    BASE,
    `${BASE}/${period}`,
    "/data/numbers",
    "/data/numbers/mis",
    `/data/numbers/mis/${period}`,
  );
}

export async function closeItemAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, BASE);
  if (refused(context)) return context;
  const period = periodFrom(formData);
  if (!period) return NO_MONTH;
  try {
    await api.setCloseItem(
      period,
      fieldValue(formData, "key", 40),
      { state: fieldValue(formData, "state", 20), note: fieldValue(formData, "note", 500) },
      staffOf(context),
    );
  } catch (error) {
    return refusal(error);
  }
  refreshClose(period);
  return sent("Saved.");
}

export async function attachFileAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, BASE);
  if (refused(context)) return context;
  const period = periodFrom(formData);
  if (!period) return NO_MONTH;
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0)
    return { status: "error", message: "Choose the file." };
  if (file.size > MAX_FILE_BYTES)
    return { status: "error", message: "That file is over 3 MB. Add a smaller copy." };
  try {
    await api.setCloseItem(
      period,
      fieldValue(formData, "key", 40),
      {
        name: file.name.slice(0, 200),
        content: Buffer.from(await file.arrayBuffer()).toString("base64"),
      },
      staffOf(context),
    );
  } catch (error) {
    return refusal(error);
  }
  refreshClose(period);
  return sent("Attached. It is kept in Files under Money › Close.");
}

export async function detachFileAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, BASE);
  if (refused(context)) return context;
  const period = periodFrom(formData);
  if (!period) return NO_MONTH;
  try {
    await api.setCloseItem(
      period,
      fieldValue(formData, "key", 40),
      { detach: fieldValue(formData, "file_id", 64) },
      staffOf(context),
    );
  } catch (error) {
    return refusal(error);
  }
  refreshClose(period);
  return sent("Taken off the row. The file stays in Files.");
}

export async function commentaryAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, BASE);
  if (refused(context)) return context;
  const period = periodFrom(formData);
  if (!period) return NO_MONTH;
  try {
    await api.saveCommentary(period, fieldValue(formData, "commentary", 4_000), staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshClose(period);
  return sent("Saved.");
}

export async function sentAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const context = await gate(formData, BASE);
  if (refused(context)) return context;
  const period = periodFrom(formData);
  if (!period) return NO_MONTH;
  try {
    await api.recordSent(
      period,
      {
        on: fieldValue(formData, "on", 10),
        to_name: fieldValue(formData, "to_name", 120),
        how: fieldValue(formData, "how", 120),
      },
      staffOf(context),
    );
  } catch (error) {
    return refusal(error);
  }
  refreshClose(period);
  return sent("Recorded that it was sent.");
}

export async function acknowledgedAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, BASE);
  if (refused(context)) return context;
  const period = periodFrom(formData);
  if (!period) return NO_MONTH;
  try {
    await api.recordAcknowledged(
      period,
      {
        on: fieldValue(formData, "on", 10),
        by_name: fieldValue(formData, "by_name", 120),
        note: fieldValue(formData, "note", 500),
      },
      staffOf(context),
    );
  } catch (error) {
    return refusal(error);
  }
  refreshClose(period);
  return sent("Recorded the acknowledgement.");
}

export async function lockAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const context = await gate(formData, BASE);
  if (refused(context)) return context;
  const period = periodFrom(formData);
  if (!period) return NO_MONTH;
  try {
    await api.lockMonth(period, staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshClose(period);
  return sent("Locked. The month's MIS is frozen.");
}

export async function reopenAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, BASE);
  if (refused(context)) return context;
  const period = periodFrom(formData);
  if (!period) return NO_MONTH;
  try {
    await api.reopenMonth(period, fieldValue(formData, "why", 500), staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshClose(period);
  return sent("Reopened. Lock it again once it is put right.");
}
