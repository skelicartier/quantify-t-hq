"use server";

import { redirect } from "next/navigation";

import * as authApi from "@/lib/api/auth";
import { fieldValue, refusalMessage, type AuthFormState } from "@/lib/auth/forms";
import type { EnrollmentState } from "@/lib/auth/form-state";
import { sanitizeNextPath } from "@/lib/auth/route-policy";
import {
  clearPendingCookie,
  clearSessionCookie,
  readPendingCookie,
  setPendingCookie,
  setSessionCookie,
} from "@/lib/auth/session";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";

/**
 * Step one: the password. Success never signs anybody in — it parks the typed
 * pending token in a five-minute cookie and moves to the code step the token's own
 * kind names.
 */
export async function login(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  await requireSameOriginServerAction();
  const email = fieldValue(formData, "email", 254).trim().toLowerCase();
  const password = fieldValue(formData, "password");
  const next = sanitizeNextPath(fieldValue(formData, "next", 512));
  if (!email || !email.includes("@") || !password) {
    return { status: "error", message: "Enter your email address and password." };
  }
  let pending: authApi.PendingLogin;
  try {
    pending = await authApi.login(email, password);
  } catch (error) {
    return { status: "error", message: refusalMessage(error) };
  }
  await setPendingCookie(pending.mfa === "enroll" ? "enroll" : "totp", pending.pending_token);
  redirect(
    pending.mfa === "enroll"
      ? `/login/enroll?next=${encodeURIComponent(next)}`
      : `/login/verify?next=${encodeURIComponent(next)}`,
  );
}

/** Step two: the authenticator code. The session cookie exists only past this line. */
export async function verifyCode(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  await requireSameOriginServerAction();
  const pending = await readPendingCookie();
  if (!pending || pending.kind !== "totp") {
    redirect("/login?notice=step-expired");
  }
  const code = fieldValue(formData, "code", 8).trim();
  const next = sanitizeNextPath(fieldValue(formData, "next", 512));
  let session: authApi.MintedSession;
  try {
    session = await authApi.verifyTotp(pending.token, code);
  } catch (error) {
    return { status: "error", message: refusalMessage(error) };
  }
  await clearPendingCookie();
  await setSessionCookie(session.token);
  redirect(next);
}

/** The fallback for a lost authenticator: one recovery code, burned on use. */
export async function verifyRecoveryCode(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  await requireSameOriginServerAction();
  const pending = await readPendingCookie();
  if (!pending || pending.kind !== "totp") {
    redirect("/login?notice=step-expired");
  }
  const recoveryCode = fieldValue(formData, "recovery_code", 32).trim();
  const next = sanitizeNextPath(fieldValue(formData, "next", 512));
  let session: authApi.MintedSession;
  try {
    session = await authApi.useRecoveryCode(pending.token, recoveryCode);
  } catch (error) {
    return { status: "error", message: refusalMessage(error) };
  }
  await clearPendingCookie();
  await setSessionCookie(session.token);
  redirect(next);
}

/**
 * First sign-in: mint the secret. Repeatable until confirmed — beginning again
 * replaces the unconfirmed secret, which is what somebody who closed the tab needs.
 */
export async function beginEnrollment(
  _previous: EnrollmentState,
  _formData: FormData,
): Promise<EnrollmentState> {
  void _previous;
  void _formData;
  await requireSameOriginServerAction();
  const pending = await readPendingCookie();
  if (!pending || pending.kind !== "enroll") {
    redirect("/login?notice=step-expired");
  }
  try {
    const begun = await authApi.beginEnrollment(pending.token);
    return {
      step: "show-secret",
      secret: begun.secret,
      otpauthUri: begun.otpauth_uri,
      message: null,
    };
  } catch (error) {
    return { step: "begin", message: refusalMessage(error) };
  }
}

/**
 * Proving the app holds the secret finishes the account: the session cookie is set
 * here, and the recovery codes ride back for their one and only display.
 */
export async function confirmEnrollment(
  previous: EnrollmentState,
  formData: FormData,
): Promise<EnrollmentState> {
  await requireSameOriginServerAction();
  const pending = await readPendingCookie();
  if (!pending || pending.kind !== "enroll") {
    redirect("/login?notice=step-expired");
  }
  if (previous.step !== "show-secret") return previous;
  const code = fieldValue(formData, "code", 8).trim();
  const next = sanitizeNextPath(fieldValue(formData, "next", 512));
  try {
    const session = await authApi.confirmEnrollment(pending.token, code);
    // The pending cookie is deliberately NOT cleared here: mutating it re-renders the
    // enroll page on the server, whose guard would redirect and unmount this screen
    // before the recovery codes were ever seen. It is five minutes long and spent
    // server-side; it dies on its own.
    await setSessionCookie(session.token);
    return { step: "done", recoveryCodes: session.recovery_codes, next };
  } catch (error) {
    return { ...previous, message: refusalMessage(error) };
  }
}

/** Signed-out everywhere this cookie is concerned, whatever the service said. */
export async function signOutAction(): Promise<void> {
  await requireSameOriginServerAction();
  const { readSessionToken } = await import("@/lib/auth/session");
  const token = await readSessionToken();
  if (token) {
    try {
      await authApi.signOut(token);
    } catch {
      // The cookie still dies; a revocation the service missed expires on its own.
    }
  }
  await clearSessionCookie();
  redirect("/login");
}
