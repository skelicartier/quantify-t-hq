import "server-only";

import { hasCapability, type StaffContext } from "@/lib/access/core";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import { gate, refused } from "@/lib/data/gate";
import type { ActionState } from "@/lib/forms/action-state";

/**
 * The people ledger is for the Owner only (ws-notes/company/spec.md §8.2). Owner and Admin
 * hold the same capabilities, so the role is the only difference: the effective role, as
 * Admin › Backup checks it (an Admin elevated to Owner acts as the Owner while elevated).
 * Every People page, action and route checks it here; nothing is read for anyone else.
 */

export const DATA_OWNER_LINE = "The people ledger is for the Owner only.";

export const isDataOwner = (context: StaffContext): boolean => context.me.role === "owner";

/** `requireData`, and the role: `allowed` only for the Owner. */
export async function requireDataOwner(
  path: string,
): Promise<{ context: StaffContext; allowed: boolean }> {
  const { context, allowed } = await requireData(path);
  return { context, allowed: allowed && isDataOwner(context) };
}

/** What a page says to someone it is not for: Data's own line, or the Owner's. */
export function notOwnerLine(context: StaffContext): string {
  return hasCapability(context, "mail:send") ? DATA_OWNER_LINE : DATA_ROLE_LINE;
}

/** `gate()`, then the role: an Admin's action is refused with the owner line. */
export async function gateOwner(
  formData: FormData,
  path: string,
): Promise<StaffContext | ActionState> {
  const context = await gate(formData, path);
  if (refused(context)) return context;
  if (!isDataOwner(context)) return { status: "error", message: DATA_OWNER_LINE };
  return context;
}
