"use server";

import { HqApiRequestError } from "@/lib/api/core";
import { requestTrustDocument } from "@/lib/api/trust-centre";
import { fieldValue } from "@/lib/auth/forms";
import type { ActionState } from "@/lib/forms/action-state";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";

/** A document request: the same answer whatever happens, so it reveals nothing. */
export async function requestDocumentAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  try {
    await requestTrustDocument({
      document_id: fieldValue(formData, "document_id", 64),
      name: fieldValue(formData, "name", 160).trim(),
      email: fieldValue(formData, "email", 254).trim(),
      company: fieldValue(formData, "company", 160).trim(),
      reason: fieldValue(formData, "reason", 1000).trim(),
      website: fieldValue(formData, "website", 10),
    });
  } catch (error) {
    if (error instanceof HqApiRequestError && error.status === 429)
      return { status: "error", message: "Too many requests from here. Try again in an hour." };
    if (error instanceof HqApiRequestError && error.status === 400) {
      const detail = Object.values(error.details).find((value) => typeof value === "string");
      return {
        status: "error",
        message: typeof detail === "string" ? `Check ${detail}.` : "Check the form.",
      };
    }
    return { status: "error", message: "It could not be sent just now. Try again in a moment." };
  }
  return {
    status: "sent",
    message: "Received. Someone on the team replies by email.",
    sentAt: Date.now(),
  };
}
