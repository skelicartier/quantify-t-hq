"use server";

import { revalidatePath } from "next/cache";

import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { createSavedReply, updateSavedReply } from "@/lib/api/tickets";
import { fieldValue } from "@/lib/auth/forms";
import type { DeskActionState } from "@/lib/support/desk-state";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";

function refusal(error: unknown): DeskActionState {
  if (error instanceof HqApiRequestError || error instanceof HqApiUnavailableError) {
    return { status: "error", message: "That could not be saved. Try again shortly." };
  }
  throw error;
}

export async function createReplyAction(
  _previous: DeskActionState,
  formData: FormData,
): Promise<DeskActionState> {
  await requireSameOriginServerAction();
  const context = await requireStaff("/support/replies");
  if (!hasCapability(context, "tickets:manage")) {
    return { status: "error", message: "Your role cannot edit saved replies." };
  }
  const title = fieldValue(formData, "title", 120).trim();
  const body = fieldValue(formData, "body", 8_000).trim();
  if (!title || !body) return { status: "error", message: "A title and a body are required." };
  try {
    await createSavedReply(context.token, { title, body });
  } catch (error) {
    return refusal(error);
  }
  revalidatePath("/support/replies");
  return { status: "sent", message: null, sentAt: Date.now() };
}

export async function archiveReplyAction(formData: FormData): Promise<void> {
  await requireSameOriginServerAction();
  const context = await requireStaff("/support/replies");
  if (!hasCapability(context, "tickets:manage")) return;
  const replyId = fieldValue(formData, "reply_id", 64);
  const archived = fieldValue(formData, "archived", 8) === "true";
  try {
    await updateSavedReply(context.token, replyId, { archived });
  } catch {
    // The list re-renders from the service; a failed archive stays visible.
  }
  revalidatePath("/support/replies");
}
