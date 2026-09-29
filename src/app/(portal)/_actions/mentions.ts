"use server";

import { revalidatePath } from "next/cache";

import { requireStaff } from "@/lib/access/core";
import * as crmApi from "@/lib/api/crm";
import { fieldValue } from "@/lib/auth/forms";
import { crmRefusal } from "@/lib/crm/refusal";
import type { ActionState } from "@/lib/forms/action-state";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";

/** The mentioned person has seen the note; it leaves their Home. */
export async function markMentionSeenAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/home");
  const mentionId = fieldValue(formData, "mention_id", 64);
  try {
    await crmApi.markMentionSeen(context.token, mentionId);
  } catch (error) {
    return crmRefusal(error);
  }
  revalidatePath("/home");
  return { status: "sent", message: null, sentAt: Date.now() };
}
