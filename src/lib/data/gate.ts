import "server-only";

import { revalidatePath } from "next/cache";

import { hasCapability, requireStaff, type StaffContext } from "@/lib/access/core";
import { DATA_ROLE_LINE } from "@/lib/data/access";
import { DataRequestError, DataUnavailableError, dataConfigured } from "@/lib/data/socket";
import type { ActionState } from "@/lib/forms/action-state";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";

/**
 * What every Data server action does first and last. Not a `"use server"` module: those
 * may export only async functions, so the shared pieces live here and each area's
 * `actions.ts` imports them.
 */

export type Staff = { staff_id: string; name: string };

export const NOT_ALLOWED: ActionState = { status: "error", message: DATA_ROLE_LINE };

/** The checks, in order: this portal, the service is set up, signed in, may send mail. */
export async function gate(formData: FormData, path: string): Promise<StaffContext | ActionState> {
  await requireSameOriginServerAction(formData);
  if (!dataConfigured()) return { status: "error", message: "Data is not set up here." };
  const context = await requireStaff(path);
  if (!hasCapability(context, "mail:send")) return NOT_ALLOWED;
  return context;
}

export const refused = (value: StaffContext | ActionState): value is ActionState =>
  "status" in value;

/** The service's own sentence when it says no; a plain one when it is not there. */
export function refusal(error: unknown): ActionState {
  if (error instanceof DataRequestError) return { status: "error", message: error.message };
  if (error instanceof DataUnavailableError)
    return {
      status: "error",
      message: "The service on this computer is not running, so nothing was changed.",
    };
  throw error;
}

export function sent(message: string | null): ActionState {
  return { status: "sent", message, sentAt: Date.now() };
}

/** Who is making the change, as every POST body carries it. */
export function staffOf(context: StaffContext): Staff {
  return {
    staff_id: context.me.staff.staff_id,
    name: context.me.staff.display_name || context.me.staff.email,
  };
}

/** The Data pages that show what changed; the overview always. */
export function refreshData(...paths: string[]): void {
  for (const path of new Set(["/data", ...paths])) revalidatePath(path);
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A typed calendar date, or "" when it is not one. */
export function dayValue(value: string): string {
  return DAY.test(value) ? value : "";
}
