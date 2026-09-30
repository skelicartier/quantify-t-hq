"use server";

import { revalidatePath } from "next/cache";

import { hasCapability, requireStaff } from "@/lib/access/core";
import * as aiApi from "@/lib/api/ai";
import { fieldValue } from "@/lib/auth/forms";
import type { ActionState } from "@/lib/forms/action-state";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";
import { privilegedRefusal } from "@/lib/security/privileged-refusal";

const FEATURES = ["reply_draft", "triage", "brief", "tasks_from_notes", "filters"] as const;

export async function updateAiSettingsAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/admin/ai");
  if (!hasCapability(context, "hq:admin"))
    return { status: "error", message: "Only HQ owners and admins change this." };
  const enabled = Object.fromEntries(
    FEATURES.map((key) => [key, formData.get(`enabled:${key}`) === "on"]),
  );
  try {
    await aiApi.updateAiSettings(context.token, {
      enabled,
      daily_calls: fieldValue(formData, "daily_calls", 7).replace(/[,\s]/g, ""),
      monthly_tokens: fieldValue(formData, "monthly_tokens", 14).replace(/[,\s]/g, ""),
    });
  } catch (error) {
    return privilegedRefusal(error);
  }
  revalidatePath("/admin/ai");
  revalidatePath("/", "layout");
  return { status: "sent", message: "Saved.", sentAt: Date.now() };
}
