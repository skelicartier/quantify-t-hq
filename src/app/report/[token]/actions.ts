"use server";

import { HqApiRequestError } from "@/lib/api/core";
import { reportAccount } from "@/lib/api/security";
import { fieldValue } from "@/lib/auth/forms";
import type { ActionState } from "@/lib/forms/action-state";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";

/**
 * "This wasn't me". No session — the person may be locked out already — just the signed
 * token from the security mail, which names their account and the event.
 */
export async function reportAccountAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const token = fieldValue(formData, "token", 2_000);
  try {
    const result = await reportAccount(token);
    return {
      status: "sent",
      message: result.already
        ? "Your account was already locked from this link. Use the reset link we mailed you to choose a new password."
        : "Done. Every session on your account has ended and your password no longer works. We mailed a reset link to your address, and the owners have been told.",
      sentAt: Date.now(),
    };
  } catch (error) {
    if (error instanceof HqApiRequestError && error.status === 429) {
      return {
        status: "error",
        message: "Too many tries from here. Wait a few minutes and press again.",
      };
    }
    if (error instanceof HqApiRequestError && error.status === 401) {
      return {
        status: "error",
        message:
          "This link has expired or is not valid. If someone else is using your account, tell an owner now.",
      };
    }
    return {
      status: "error",
      message: "It could not be done just now. Press again in a moment, or tell an owner now.",
    };
  }
}
