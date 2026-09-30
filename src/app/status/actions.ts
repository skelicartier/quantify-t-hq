"use server";

import { HqApiRequestError } from "@/lib/api/core";
import {
  confirmStatusSubscription,
  stopStatusSubscription,
  subscribeToStatus,
} from "@/lib/api/status";
import { fieldValue } from "@/lib/auth/forms";
import type { ActionState } from "@/lib/forms/action-state";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";

function trouble(error: unknown): ActionState {
  if (error instanceof HqApiRequestError && error.status === 429)
    return {
      status: "error",
      message: "Too many tries from here. Wait a few minutes and try again.",
    };
  if (error instanceof HqApiRequestError && error.status === 404)
    return {
      status: "error",
      message: "This link is not valid. Use the newest one we mailed you.",
    };
  if (error instanceof HqApiRequestError && error.status === 400)
    return { status: "error", message: "Enter an email address." };
  return { status: "error", message: "It could not be done just now. Try again in a moment." };
}

/** A mailed token is base64url and short; anything else never leaves this server. */
const TOKEN = /^[A-Za-z0-9_-]{8,120}$/;
const BAD_LINK: ActionState = {
  status: "error",
  message: "This link is not valid. Use the newest one we mailed you.",
};

/** Subscribe: always the same answer, so the form cannot reveal who already subscribes. */
export async function subscribeAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  try {
    await subscribeToStatus({
      email: fieldValue(formData, "email", 254).trim(),
      website: fieldValue(formData, "website", 10),
    });
  } catch (error) {
    return trouble(error);
  }
  return {
    status: "sent",
    message: "Check your inbox: we sent a link to confirm. Nothing is sent until you press it.",
    sentAt: Date.now(),
  };
}

export async function confirmAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const token = fieldValue(formData, "token", 120);
  if (!TOKEN.test(token)) return BAD_LINK;
  try {
    await confirmStatusSubscription(token);
  } catch (error) {
    return trouble(error);
  }
  return {
    status: "sent",
    message: "Confirmed. You will hear from us when something is wrong, and when it is fixed.",
    sentAt: Date.now(),
  };
}

export async function stopAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const token = fieldValue(formData, "token", 120);
  if (!TOKEN.test(token)) return BAD_LINK;
  try {
    await stopStatusSubscription(token);
  } catch (error) {
    return trouble(error);
  }
  return {
    status: "sent",
    message: "Stopped. No more status mail goes to this address.",
    sentAt: Date.now(),
  };
}
