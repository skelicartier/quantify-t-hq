"use server";

import { revalidatePath } from "next/cache";

import { HqApiRequestError } from "@/lib/api/core";
import { QUOTE_TOKEN, acceptPublicQuote, declinePublicQuote } from "@/lib/api/quotes";
import { fieldValue } from "@/lib/auth/forms";
import type { ActionState } from "@/lib/forms/action-state";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";

function refusal(error: unknown): ActionState {
  if (error instanceof HqApiRequestError) {
    if (error.status === 404) return { status: "error", message: "This link is no longer open." };
    if (error.code === "rate_limited")
      return { status: "error", message: "Too many tries from here. Wait a little and try again." };
    const details = Object.values(error.details).filter((value) => typeof value === "string");
    if (details.length) return { status: "error", message: `Please check: ${details.join("; ")}.` };
  }
  return { status: "error", message: "That did not go through. Nothing was recorded; try again." };
}

/**
 * The customer accepts the quote: no session, the token in the address is the key, and
 * the service signs the quote only while the link is open and the quote valid.
 */
export async function acceptQuoteAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const token = fieldValue(formData, "token", 120);
  if (!QUOTE_TOKEN.test(token)) return { status: "error", message: "This link is not right." };
  try {
    await acceptPublicQuote(token, {
      name: fieldValue(formData, "name", 160).trim(),
      email: fieldValue(formData, "email", 254).trim(),
      agree: fieldValue(formData, "agree", 5) === "yes",
    });
  } catch (error) {
    return refusal(error);
  }
  revalidatePath(`/q/${token}`);
  return { status: "sent", message: "Accepted. Thank you.", sentAt: Date.now() };
}

export async function declineQuoteAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const token = fieldValue(formData, "token", 120);
  if (!QUOTE_TOKEN.test(token)) return { status: "error", message: "This link is not right." };
  try {
    await declinePublicQuote(token, {
      name: fieldValue(formData, "name", 160).trim(),
      reason: fieldValue(formData, "reason", 300).trim(),
    });
  } catch (error) {
    return refusal(error);
  }
  revalidatePath(`/q/${token}`);
  return { status: "sent", message: "Declined. Thank you for telling us.", sentAt: Date.now() };
}
