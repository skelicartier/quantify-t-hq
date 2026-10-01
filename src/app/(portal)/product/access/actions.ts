"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import {
  AccountApiRequestError,
  fetchAccountApiMe,
  setAccountApiAdminStaffRole,
} from "@/lib/product/account-api";
import {
  canManageStaff,
  hasAdminPortalAccess,
  hasPrivilegedRole,
  hasSatisfiedPrivilegedAssurance,
} from "@/lib/product/access";
import { roleLabel } from "@/lib/product/role-labels";
import {
  isGrantableStaffRole,
  STAFF_REASON_MAX_LENGTH,
  type AdminStaffActionState,
} from "@/lib/product/staff-input";
import { getCurrentAssurance } from "@/lib/product/assurance-guard";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";
import { createServerAzureClient } from "@/lib/product/session";

/**
 * Granting and removing a staff role, from the console.
 *
 * The three properties the other admin actions hold, hold here too: nothing returned came
 * back from the service, the caller is re-derived because a Server Action is a POST
 * endpoint of its own, and every write carries its own idempotency key.
 *
 * One more is specific to this file. The role is checked against the grantable list before
 * anything is sent, so a crafted submission naming `owner` is refused here and not only
 * upstream. The service refuses it too — that is the guarantee — but a console that would
 * happily send it is a console whose page is lying about what it can do.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const failure = (userId: string, message: string): AdminStaffActionState => ({
  status: "error",
  message,
  userId,
});

/** One value for a name, of bounded size, or nothing. Repeated fields are a rejection. */
function singleValue(formData: FormData, name: string, limit: number): string | null {
  const values = formData.getAll(name);
  if (values.length > 1) return null;
  const value = values[0];
  if (value === undefined) return "";
  if (typeof value !== "string" || value.length > limit) return null;
  return value;
}

type Caller = { ok: true; accessToken: string } | { ok: false; message: string };

async function grantingCaller(): Promise<Caller> {
  const azure = await createServerAzureClient();
  const accessToken = azure.getAccessToken();
  if (!accessToken) return { ok: false, message: "Sign in again to change staff access." };

  const me = await fetchAccountApiMe(accessToken);
  if (!hasAdminPortalAccess(me) || !canManageStaff(me)) {
    return { ok: false, message: "This account cannot change staff access." };
  }
  if (hasPrivilegedRole(me) && !hasSatisfiedPrivilegedAssurance(await getCurrentAssurance())) {
    return { ok: false, message: "Verify your authenticator code before changing staff access." };
  }
  return { ok: true, accessToken };
}

export async function setStaffRole(
  _state: AdminStaffActionState,
  formData: FormData,
): Promise<AdminStaffActionState> {
  const rawUserId = singleValue(formData, "userId", 64);
  const rawRole = singleValue(formData, "role", 32);
  const rawReason = singleValue(formData, "reason", STAFF_REASON_MAX_LENGTH);
  const userId = (rawUserId ?? "").trim().toLowerCase();

  if (rawUserId === null || !UUID_PATTERN.test(userId)) {
    return failure("", "That account could not be identified. Paste the account id again.");
  }
  if (rawRole === null || !isGrantableStaffRole(rawRole.trim())) {
    // Owner and Admin live in Roles, which only an Owner holds.
    return failure(userId, "Owner and Admin are set from Roles, not from here.");
  }
  if (rawReason === null || !rawReason.trim()) {
    // A role nobody can account for is how an account keeps access long after the reason
    // for it ended.
    return failure(userId, "Say why this access is being changed.");
  }
  const role = rawRole.trim();
  if (!isGrantableStaffRole(role)) return failure(userId, "That is not a role this section sets.");

  try {
    await requireSameOriginServerAction();
    const caller = await grantingCaller();
    if (!caller.ok) return failure(userId, caller.message);

    const result = await setAccountApiAdminStaffRole(
      caller.accessToken,
      userId,
      { role, reason: rawReason.trim() },
      { idempotencyKey: `portal-${randomUUID()}` },
    );
    revalidatePath("/product/access");
    revalidatePath("/product/roles");
    revalidatePath("/product/users");
    revalidatePath(`/product/users/${userId}`);

    if (!result.changed) {
      return { status: "success", userId, message: `Already ${roleLabel(role)}. Nothing changed.` };
    }
    return {
      status: "success",
      userId,
      message:
        role === "user"
          ? "Staff access removed. Existing sessions keep working until they expire."
          : `Now ${roleLabel(role)}. It takes effect on their next request.`,
    };
  } catch (error) {
    return staffFailure(userId, error);
  }
}

/** What the operator is told when the service refuses. Never the service's own words. */
function staffFailure(userId: string, error: unknown): AdminStaffActionState {
  if (error instanceof AccountApiRequestError) {
    if (error.status === 404) return failure(userId, "There is no account with that id.");
    if (error.status === 403) {
      return failure(
        userId,
        "That account is out of reach from here. An Owner or Admin is changed from Roles, and nobody can change their own access.",
      );
    }
    if (error.status === 400) return failure(userId, "That is not a role this section sets.");
  }
  return failure(userId, "Staff access could not be changed right now. Nothing was saved.");
}
