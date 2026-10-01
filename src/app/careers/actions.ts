"use server";

import { HqApiRequestError } from "@/lib/api/core";
import { applyToRole } from "@/lib/api/hiring";
import { fieldValue } from "@/lib/auth/forms";
import type { ActionState } from "@/lib/forms/action-state";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";

/** An application: the same answer whatever happens, so the form reveals nothing. */
export async function applyAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  try {
    await applyToRole({
      opening_id: fieldValue(formData, "opening_id", 64),
      full_name: fieldValue(formData, "full_name", 160).trim(),
      email: fieldValue(formData, "email", 254).trim(),
      links: fieldValue(formData, "links", 1000).trim(),
      cover_note: fieldValue(formData, "cover_note", 4000).trim(),
      keep_longer: formData.get("keep_longer") === "on",
      website: fieldValue(formData, "website", 10),
    });
  } catch (error) {
    if (error instanceof HqApiRequestError && error.status === 429)
      return { status: "error", message: "Too many applications from here. Try again in an hour." };
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
    message: "Received. A person reads every application and replies.",
    sentAt: Date.now(),
  };
}
