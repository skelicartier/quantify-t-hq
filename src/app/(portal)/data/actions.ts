"use server";

import { restartData } from "@/lib/data/api/status";
import { gate, refreshData, refusal, refused, sent, staffOf } from "@/lib/data/gate";
import type { ActionState } from "@/lib/forms/action-state";

/**
 * The Data section's own writes: for now, starting Data again after it stopped. Each
 * area (files, leads, replies, …) has an `actions.ts` of its own, built on the same
 * `gate` → call → `refreshData` → `sent` or `refusal` shape.
 */

export async function restartDataAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/data");
  if (refused(context)) return context;
  try {
    await restartData(staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshData();
  return sent("Data is starting again.");
}
