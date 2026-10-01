"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import {
  AccountApiRequestError,
  fetchAccountApiMe,
  restoreAccountApiAdminSecret,
  revokeAccountApiAdminSecret,
  setAccountApiAdminSecret,
  type AccountApiAdminSecretWriteBody,
} from "@/lib/product/account-api";
import {
  canWriteManagedSecrets,
  hasAdminPortalAccess,
  hasSatisfiedPrivilegedAssurance,
} from "@/lib/product/access";
import {
  isAdminSecretMode,
  SECRET_FINGERPRINT_PATTERN,
  SECRET_SLOT_PATTERN,
  SECRET_VALUE_MAX_LENGTH,
  type AdminSecretActionState,
  type AdminSecretMode,
} from "@/lib/product/secret-input";
import { getCurrentAssurance } from "@/lib/product/assurance-guard";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";
import { createServerAzureClient } from "@/lib/product/session";

/**
 * Changing a credential, from the console.
 *
 * Three properties hold this file together, and none of them is incidental:
 *
 * 1. Nothing returned from here came back from the service. Every outcome is one of the
 *    literal strings below. Provider error bodies routinely quote the credential that was
 *    rejected, and an upstream `details` object is propagated verbatim — so echoing either
 *    would put a key into the page, the payload, and any screenshot taken of them.
 * 2. Every action re-derives the caller. A Server Action is a POST endpoint of its own: the
 *    page's gate is not its gate, so origin, identity, capability and assurance are all
 *    checked here as well, in that order, before anything is sent.
 * 3. Every write carries its own idempotency key, so a double submission is one change.
 */

const failure = (slot: string, message: string): AdminSecretActionState => ({
  status: "error",
  message,
  slot,
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

function slotName(formData: FormData): string | null {
  const value = singleValue(formData, "slot", 80);
  return value && SECRET_SLOT_PATTERN.test(value) ? value : null;
}

/**
 * The fingerprint of the key the operator was looking at when they decided to act. Optional
 * — a slot with nothing in it has none — but when present it is what turns "replace this
 * key" into a statement about a specific key rather than about whatever is there now.
 */
function expectedFingerprint(formData: FormData): string | null | undefined {
  const value = singleValue(formData, "expectedFingerprint", 64);
  if (value === null) return undefined;
  if (value === "") return null;
  return SECRET_FINGERPRINT_PATTERN.test(value) ? value : undefined;
}

type Caller = { ok: true; accessToken: string } | { ok: false; message: string };

/**
 * Who is asking, and may they. Re-read on every action rather than carried from the page,
 * because the page's answer is minutes old and was given to a different request.
 */
async function writingCaller(): Promise<Caller> {
  const azure = await createServerAzureClient();
  const accessToken = azure.getAccessToken();
  if (!accessToken) return { ok: false, message: "Sign in again to change a credential." };
  const me = await fetchAccountApiMe(accessToken);
  if (!hasAdminPortalAccess(me) || !canWriteManagedSecrets(me)) {
    return { ok: false, message: "This account cannot change credentials." };
  }
  if (!hasSatisfiedPrivilegedAssurance(await getCurrentAssurance())) {
    return { ok: false, message: "Verify your authenticator code before changing a credential." };
  }
  return { ok: true, accessToken };
}

/** The outcomes worth naming; everything else is one sentence that does not speculate. */
function writeFailure(slot: string, error: unknown): AdminSecretActionState {
  if (error instanceof AccountApiRequestError) {
    if (error.status === 409) {
      return failure(slot, "This credential changed since the page loaded. Reload and try again.");
    }
    if (error.status === 403) {
      return failure(slot, "This account cannot change credentials.");
    }
    if (error.status === 404) {
      return failure(slot, "That credential is no longer managed here. Reload the page.");
    }
  }
  return failure(slot, "The credential could not be saved. Reload to check what is stored now.");
}

export async function setAdminSecret(
  _previous: AdminSecretActionState,
  formData: FormData,
): Promise<AdminSecretActionState> {
  const slot = slotName(formData);
  if (!slot) return failure("", "Check the credential and try again.");

  const raw = singleValue(formData, "value", SECRET_VALUE_MAX_LENGTH);
  const fingerprint = expectedFingerprint(formData);
  const modeField = singleValue(formData, "mode", 16);
  const mode: AdminSecretMode = isAdminSecretMode(modeField) ? modeField : "replace";
  if (
    raw === null ||
    fingerprint === undefined ||
    (modeField !== "" && !isAdminSecretMode(modeField))
  ) {
    return failure(slot, "Check the credential and try again.");
  }
  if (singleValue(formData, "confirm", 8) !== "on") {
    return failure(slot, "Confirm the change before saving.");
  }

  // Whitespace around a pasted key is the single most common paste defect; an empty field
  // after trimming is a mistake, never an instruction to delete. Clearing a credential is
  // its own action with its own confirmation, because the two are not the same decision.
  const value = raw.trim();
  if (!value) {
    return failure(slot, "Enter the credential value. To clear it, use Clear this credential.");
  }

  try {
    await requireSameOriginServerAction();
    const caller = await writingCaller();
    if (!caller.ok) return failure(slot, caller.message);

    const body: AccountApiAdminSecretWriteBody = { value, mode };
    if (fingerprint) body.expected_fingerprint = fingerprint;
    await setAccountApiAdminSecret(caller.accessToken, slot, body, {
      idempotencyKey: `portal-${randomUUID()}`,
    });
    revalidatePath("/product/secrets");
    return {
      status: "success",
      slot,
      message:
        mode === "append"
          ? "Key added. The new fingerprint is in the table above."
          : "Credential saved. The new fingerprint is in the table above.",
    };
  } catch (error) {
    return writeFailure(slot, error);
  }
}

export async function revokeAdminSecret(
  _previous: AdminSecretActionState,
  formData: FormData,
): Promise<AdminSecretActionState> {
  const slot = slotName(formData);
  if (!slot) return failure("", "Check the credential and try again.");
  const fingerprint = expectedFingerprint(formData);
  if (fingerprint === undefined) return failure(slot, "Check the credential and try again.");
  if (singleValue(formData, "confirm", 8) !== "on") {
    return failure(slot, "Confirm before clearing this credential.");
  }

  try {
    await requireSameOriginServerAction();
    const caller = await writingCaller();
    if (!caller.ok) return failure(slot, caller.message);

    const body: { expected_fingerprint?: string } = {};
    if (fingerprint) body.expected_fingerprint = fingerprint;
    await revokeAccountApiAdminSecret(caller.accessToken, slot, body, {
      idempotencyKey: `portal-${randomUUID()}`,
    });
    revalidatePath("/product/secrets");
    return {
      status: "success",
      slot,
      message:
        "Credential cleared. A machine that already holds a copy keeps working until it refreshes.",
    };
  } catch (error) {
    return writeFailure(slot, error);
  }
}

export async function restoreAdminSecret(
  _previous: AdminSecretActionState,
  formData: FormData,
): Promise<AdminSecretActionState> {
  const slot = slotName(formData);
  if (!slot) return failure("", "Check the credential and try again.");
  if (singleValue(formData, "confirm", 8) !== "on") {
    return failure(slot, "Confirm before putting the previous credential back.");
  }

  try {
    await requireSameOriginServerAction();
    const caller = await writingCaller();
    if (!caller.ok) return failure(slot, caller.message);

    await restoreAccountApiAdminSecret(caller.accessToken, slot, {
      idempotencyKey: `portal-${randomUUID()}`,
    });
    revalidatePath("/product/secrets");
    return {
      status: "success",
      slot,
      message: "The previous credential is back in place. Its fingerprint is in the table above.",
    };
  } catch (error) {
    if (error instanceof AccountApiRequestError && error.status === 404) {
      return failure(slot, "There is no previous credential kept for this one.");
    }
    return writeFailure(slot, error);
  }
}
