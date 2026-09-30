"use server";

import { revalidatePath } from "next/cache";

import * as authApi from "@/lib/api/auth";
import * as securityApi from "@/lib/api/security";
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

// --- passkeys ---------------------------------------------------------------------------

/** The creation options for a new passkey; called from the client before the browser prompt. */
export async function passkeyRegisterOptionsAction(): Promise<
  | {
      ok: true;
      options: Omit<authApi.CreationOptionsPayload, "ok" | "challenge_token">;
      challenge_token: string;
    }
  | { ok: false; message: string }
> {
  await requireSameOriginServerAction();
  const { token } = await requireStaff("/me/security");
  try {
    const { challenge_token, ...options } = await authApi.passkeyRegisterOptions(token);
    return { ok: true, options, challenge_token };
  } catch (error) {
    if (
      error instanceof HqApiRequestError &&
      error.status === 403 &&
      error.details["sudo_required"] === true
    ) {
      return {
        ok: false,
        message: "Confirm it's you first: enter a code from your authenticator app above.",
      };
    }
    return { ok: false, message: refusalMessage(error) };
  }
}

export async function registerPasskeyAction(input: {
  challenge_token: string;
  label: string;
  client_data_json: string;
  attestation_object: string;
  transports: string[];
}): Promise<{ ok: true; label: string } | { ok: false; message: string }> {
  await requireSameOriginServerAction();
  const { token } = await requireStaff("/me/security");
  const label = String(input.label ?? "").slice(0, 80);
  try {
    const saved = await authApi.registerPasskey(token, {
      challenge_token: String(input.challenge_token ?? "").slice(0, 2_000),
      label,
      client_data_json: String(input.client_data_json ?? "").slice(0, 8_000),
      attestation_object: String(input.attestation_object ?? "").slice(0, 16_000),
      transports: Array.isArray(input.transports) ? input.transports.map(String).slice(0, 6) : [],
    });
    revalidatePath("/me/security");
    return { ok: true, label: saved.passkey.label };
  } catch (error) {
    if (error instanceof HqApiRequestError && error.code === "malformed_request") {
      const details = error.details ?? {};
      if ("credential" in details) return { ok: false, message: String(details.credential) };
      if ("reason" in details) return { ok: false, message: String(details.reason) };
    }
    return { ok: false, message: refusalMessage(error) };
  }
}

export async function deletePasskeyAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const { token } = await requireStaff("/me/security");
  try {
    await authApi.deletePasskey(token, fieldValue(formData, "passkey_id", 64));
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
  revalidatePath("/me/security");
  return { status: "sent", message: "Removed.", sentAt: Date.now() };
}

/** Forget a device: its next sign-in counts as new again, and is mailed. */
export async function forgetDeviceAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const { token } = await requireStaff("/me/security");
  try {
    await securityApi.forgetDevice(token, fieldValue(formData, "device_id", 64));
  } catch (error) {
    return { status: "error", message: refusalMessage(error) };
  }
  revalidatePath("/me/security");
  return { status: "sent", message: "Forgotten.", sentAt: Date.now() };
}
