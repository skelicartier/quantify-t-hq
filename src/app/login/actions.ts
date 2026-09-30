"use server";

import { redirect } from "next/navigation";

import * as authApi from "@/lib/api/auth";
import { fieldValue, refusalMessage, type AuthFormState } from "@/lib/auth/forms";
import type { EnrollmentState } from "@/lib/auth/form-state";
import { sanitizeNextPath } from "@/lib/auth/route-policy";
import {
  clearPendingCookie,
  clearSessionCookie,
  readOrMintDeviceId,
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
  await requireSameOriginServerAction(formData);
  const email = fieldValue(formData, "email", 254).trim().toLowerCase();
  const password = fieldValue(formData, "password");
  const next = sanitizeNextPath(fieldValue(formData, "next", 512));
  const enrolTicket = fieldValue(formData, "enrol_ticket", 128).trim();
  if (!email || !email.includes("@") || !password) {
    return { status: "error", message: "Enter your email address and password." };
  }
  let pending: authApi.PendingLogin;
  try {
    pending = await authApi.login(email, password, enrolTicket);
  } catch (error) {
    return { status: "error", message: refusalMessage(error) };
  }
  await setPendingCookie(pending.mfa === "enroll" ? "enroll" : "totp", pending.pending_token, {
    passkeys: pending.passkeys === true,
  });
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
  await requireSameOriginServerAction(formData);
  const pending = await readPendingCookie();
  if (!pending || pending.kind !== "totp") {
    redirect("/login?notice=step-expired");
  }
  const code = fieldValue(formData, "code", 8).trim();
  const next = sanitizeNextPath(fieldValue(formData, "next", 512));
  let session: authApi.MintedSession;
  try {
    session = await authApi.verifyTotp(pending.token, code, await readOrMintDeviceId());
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
  await requireSameOriginServerAction(formData);
  const pending = await readPendingCookie();
  if (!pending || pending.kind !== "totp") {
    redirect("/login?notice=step-expired");
  }
  const recoveryCode = fieldValue(formData, "recovery_code", 32).trim();
  const next = sanitizeNextPath(fieldValue(formData, "next", 512));
  let session: authApi.MintedSession;
  try {
    session = await authApi.useRecoveryCode(
      pending.token,
      recoveryCode,
      await readOrMintDeviceId(),
    );
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
  await requireSameOriginServerAction(_formData);
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
  await requireSameOriginServerAction(formData);
  const pending = await readPendingCookie();
  if (!pending || pending.kind !== "enroll") {
    redirect("/login?notice=step-expired");
  }
  if (previous.step !== "show-secret") return previous;
  const code = fieldValue(formData, "code", 8).trim();
  const next = sanitizeNextPath(fieldValue(formData, "next", 512));
  try {
    const session = await authApi.confirmEnrollment(
      pending.token,
      code,
      await readOrMintDeviceId(),
    );
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

/**
 * The browser asks for the passkey challenge before it asks the authenticator. Called
 * from the client, so it answers with a plain result rather than throwing.
 */
export async function passkeyOptionsAction(): Promise<
  | {
      ok: true;
      options: Omit<authApi.AssertionOptionsPayload, "ok" | "challenge_token">;
      challenge_token: string;
    }
  | { ok: false; message: string }
> {
  await requireSameOriginServerAction();
  const pending = await readPendingCookie();
  if (!pending || pending.kind !== "totp") {
    return { ok: false, message: "This sign-in step has expired. Start again." };
  }
  try {
    const { challenge_token, ...options } = await authApi.passkeyOptions(pending.token);
    return { ok: true, options, challenge_token };
  } catch (error) {
    return { ok: false, message: refusalMessage(error) };
  }
}

/** Step two by passkey: the authenticator's answer opens the session, as a code would. */
export async function verifyPasskey(formData: FormData): Promise<void> {
  await requireSameOriginServerAction(formData);
  const pending = await readPendingCookie();
  if (!pending || pending.kind !== "totp") {
    redirect("/login?notice=step-expired");
  }
  const next = sanitizeNextPath(fieldValue(formData, "next", 512));
  let session: authApi.MintedSession;
  const deviceId = await readOrMintDeviceId();
  try {
    session = await authApi.signInWithPasskey(
      pending.token,
      {
        challenge_token: fieldValue(formData, "challenge_token", 2_000),
        credential_id: fieldValue(formData, "credential_id", 2_000),
        client_data_json: fieldValue(formData, "client_data_json", 8_000),
        authenticator_data: fieldValue(formData, "authenticator_data", 8_000),
        signature: fieldValue(formData, "signature", 4_000),
      },
      deviceId,
    );
  } catch {
    redirect(`/login/verify?notice=passkey-refused&next=${encodeURIComponent(next)}`);
  }
  await clearPendingCookie();
  await setSessionCookie(session.token);
  redirect(next);
}
