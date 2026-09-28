"use server";

import { revalidatePath } from "next/cache";

import * as authApi from "@/lib/api/auth";
import { HqApiRequestError } from "@/lib/api/core";
import { requireStaff } from "@/lib/access/core";
import type { ActionState } from "@/lib/forms/action-state";
import { fieldValue, refusalMessage, type AuthFormState } from "@/lib/auth/forms";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";

export async function revokeSessionAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const { token } = await requireStaff("/me/security");
  const sessionId = fieldValue(formData, "session_id", 64);
  try {
    await authApi.revokeSession(token, sessionId);
  } catch (error) {
    return { status: "error", message: refusalMessage(error) };
  }
  revalidatePath("/me/security");
  return { status: "sent", message: "Signed out.", sentAt: Date.now() };
}

/** Ten fresh recovery codes, shown once; the service asks for a fresh code first. */
export async function regenerateRecoveryCodesAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const { token } = await requireStaff("/me/security");
  try {
    const outcome = await authApi.regenerateRecoveryCodes(token);
    revalidatePath("/me/security");
    return {
      status: "sent",
      message: "New recovery codes. Copy them now; they will not be shown again.",
      sentAt: Date.now(),
      secret: outcome.recovery_codes.join(" "),
    };
  } catch (error) {
    if (
      error instanceof HqApiRequestError &&
      error.status === 403 &&
      error.details["sudo_required"] === true
    ) {
      return {
        status: "error",
        message: "Confirm it's you first: enter a code from your authenticator app above.",
      };
    }
    return { status: "error", message: refusalMessage(error) };
  }
}

export async function changePasswordAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  await requireSameOriginServerAction(formData);
  const { token } = await requireStaff("/me/security");
  const current = fieldValue(formData, "current_password");
  const next = fieldValue(formData, "new_password");
  if (next.length < 12) {
    return { status: "error", message: "Choose a password of at least 12 characters." };
  }
  try {
    const outcome = await authApi.changePassword(token, current, next);
    revalidatePath("/me/security");
    return {
      status: "idle",
      message:
        outcome.other_sessions_revoked > 0
          ? `Password updated. ${outcome.other_sessions_revoked} other session${outcome.other_sessions_revoked === 1 ? " was" : "s were"} signed out.`
          : "Password updated.",
    };
  } catch (error) {
    return { status: "error", message: refusalMessage(error) };
  }
}
