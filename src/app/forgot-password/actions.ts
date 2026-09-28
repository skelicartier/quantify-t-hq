"use server";

import { redirect } from "next/navigation";

import * as authApi from "@/lib/api/auth";
import { fieldValue, refusalMessage, type AuthFormState } from "@/lib/auth/forms";
import { setPendingCookie } from "@/lib/auth/session";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";

/** Always the same outcome on the surface, whatever the address is. */
export async function requestReset(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  await requireSameOriginServerAction(formData);
  const email = fieldValue(formData, "email", 254).trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { status: "error", message: "Enter your staff email address." };
  }
  try {
    await authApi.requestPasswordReset(email);
  } catch (error) {
    return { status: "error", message: refusalMessage(error) };
  }
  redirect("/forgot-password?sent=1");
}

export async function completeReset(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  await requireSameOriginServerAction(formData);
  const token = fieldValue(formData, "token", 2_048);
  const password = fieldValue(formData, "password");
  if (password.length < 12) {
    return { status: "error", message: "Choose a password of at least 12 characters." };
  }
  try {
    await authApi.resetPassword(token, password);
  } catch (error) {
    return { status: "error", message: refusalMessage(error) };
  }
  redirect("/login?notice=password-updated");
}

/** An invite link: set the password, then straight into authenticator enrollment. */
export async function completeInvite(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  await requireSameOriginServerAction(formData);
  const token = fieldValue(formData, "token", 2_048);
  const password = fieldValue(formData, "password");
  if (password.length < 12) {
    return { status: "error", message: "Choose a password of at least 12 characters." };
  }
  let pending: authApi.PendingLogin;
  try {
    pending = await authApi.acceptInvite(token, password);
  } catch (error) {
    return { status: "error", message: refusalMessage(error) };
  }
  await setPendingCookie("enroll", pending.pending_token);
  redirect("/login/enroll");
}
