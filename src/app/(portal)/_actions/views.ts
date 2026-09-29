"use server";

import { revalidatePath } from "next/cache";

import { requireStaff } from "@/lib/access/core";
import { HqApiRequestError } from "@/lib/api/core";
import { deleteView, saveView } from "@/lib/api/views";
import { fieldValue } from "@/lib/auth/forms";
import { sanitizeNextPath } from "@/lib/auth/route-policy";
import { crmRefusal } from "@/lib/crm/refusal";
import type { ActionState } from "@/lib/forms/action-state";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";

/** Save the list's current query under a name, for oneself or the team. */
export async function saveViewAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const basePath = sanitizeNextPath(fieldValue(formData, "base_path", 120));
  const context = await requireStaff(basePath);
  const name = fieldValue(formData, "name", 80).trim();
  if (!name) return { status: "error", message: "Name the view." };
  try {
    await saveView(context.token, {
      list_key: fieldValue(formData, "list_key", 40),
      name,
      query: fieldValue(formData, "query", 400),
      shared: formData.get("shared") === "on",
    });
  } catch (error) {
    if (error instanceof HqApiRequestError && error.code === "malformed_request") {
      const details = error.details ?? {};
      if ("name" in details) return { status: "error", message: String(details.name) };
      if ("reason" in details) return { status: "error", message: String(details.reason) };
    }
    return crmRefusal(error);
  }
  revalidatePath(basePath);
  return { status: "sent", message: "Saved.", sentAt: Date.now() };
}

export async function deleteViewAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const basePath = sanitizeNextPath(fieldValue(formData, "base_path", 120));
  const context = await requireStaff(basePath);
  try {
    await deleteView(context.token, fieldValue(formData, "view_id", 64));
  } catch (error) {
    return crmRefusal(error);
  }
  revalidatePath(basePath);
  return { status: "sent", message: null, sentAt: Date.now() };
}
