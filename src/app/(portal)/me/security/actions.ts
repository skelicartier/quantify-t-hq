"use server";

import { revalidatePath } from "next/cache";

import * as authApi from "@/lib/api/auth";
import { requireStaff } from "@/lib/access/core";
import { fieldValue, refusalMessage, type AuthFormState } from "@/lib/auth/forms";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";

export async function revokeSessionAction(formData: FormData): Promise<void> {
  await requireSameOriginServerAction();
  const { token } = await requireStaff("/me/security");
  const sessionId = fieldValue(formData, "session_id", 64);
  try {
    await authApi.revokeSession(token, sessionId);
  } catch {
    // The list re-renders from the service either way; a failed revoke stays visible.
  }
  revalidatePath("/me/security");
}

export async function changePasswordAction(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  await requireSameOriginServerAction();
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
