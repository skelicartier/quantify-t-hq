"use server";

import { revalidatePath } from "next/cache";

import { HqApiRequestError } from "@/lib/api/core";
import { unsubscribe } from "@/lib/api/mail";
import { fieldValue } from "@/lib/auth/forms";
import type { ActionState } from "@/lib/forms/action-state";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";

/**
 * The recipient's own choices. No session: the token in the URL names one message, and
 * the service will only ever stop mail to the address that message went to.
 */
export async function stopMailAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const token = fieldValue(formData, "token", 200);
  const mode = fieldValue(formData, "mode", 10);
  const topicsOff = formData.getAll("topics_off").map(String).slice(0, 5);
  if (!["all", "topics", "sales"].includes(mode))
    return { status: "error", message: "Choose what to stop." };
  try {
    await unsubscribe(token, mode as "all" | "topics" | "sales", topicsOff);
  } catch (error) {
    if (error instanceof HqApiRequestError && error.status === 404) {
      return {
        status: "error",
        message: "This link is not valid. Use the link in the email itself.",
      };
    }
    if (error instanceof HqApiRequestError && error.status === 429) {
      return {
        status: "error",
        message: "Too many requests from here. Try again in a few minutes.",
      };
    }
    return { status: "error", message: "It could not be saved just now. Try again shortly." };
  }
  revalidatePath(`/u/${token}`);
  return {
    status: "sent",
    message:
      mode === "topics"
        ? "Saved. You will only hear about what is still ticked."
        : "Done. It took effect immediately; nothing more is on its way.",
    sentAt: Date.now(),
  };
}
