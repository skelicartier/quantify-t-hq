"use server";

import { revalidatePath } from "next/cache";

import { hasCapability, requireStaff } from "@/lib/access/core";
import * as authApi from "@/lib/api/auth";
import * as crmApi from "@/lib/api/crm";
import * as keysApi from "@/lib/api/keys";
import { fieldValue, refusalMessage } from "@/lib/auth/forms";
import { crmRefusal } from "@/lib/crm/refusal";
import type { ActionState } from "@/lib/forms/action-state";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";

const ADMIN_PAGES = new Set(["/admin/integrations", "/admin/settings/pipeline", "/admin/staff"]);

const NOT_ADMIN: ActionState = { status: "error", message: "Only HQ admins can change this." };

/** A fresh authenticator code opens the ten-minute window for sensitive changes. */
export async function confirmSudoAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction();
  const context = await requireStaff("/admin/integrations");
  const code = fieldValue(formData, "code", 6).trim();
  if (!/^\d{6}$/.test(code)) {
    return { status: "error", message: "Enter the six digits your authenticator app shows." };
  }
  try {
    await authApi.grantSudo(context.token, code);
  } catch (error) {
    return { status: "error", message: refusalMessage(error) };
  }
  const path = fieldValue(formData, "return_path", 64);
  if (ADMIN_PAGES.has(path)) revalidatePath(path);
  return { status: "sent", message: null, sentAt: Date.now() };
}

export async function mintKeyAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction();
  const context = await requireStaff("/admin/integrations");
  if (!hasCapability(context, "hq:admin")) return NOT_ADMIN;
  const name = fieldValue(formData, "name", 80).trim();
  const reason = fieldValue(formData, "reason", 400).trim();
  if (!name || !reason) {
    return { status: "error", message: "Name what holds the key and say why it is needed." };
  }
  try {
    const minted = await keysApi.mintApiKey(context.token, { name, reason });
    revalidatePath("/admin/integrations");
    return { status: "sent", message: null, sentAt: Date.now(), secret: minted.secret };
  } catch (error) {
    return crmRefusal(error);
  }
}

export async function revokeKeyAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction();
  const context = await requireStaff("/admin/integrations");
  if (!hasCapability(context, "hq:admin")) return NOT_ADMIN;
  const reason = fieldValue(formData, "reason", 400).trim();
  if (!reason) return { status: "error", message: "Say why the key is being revoked." };
  try {
    await keysApi.revokeApiKey(context.token, fieldValue(formData, "key_id", 64), reason);
  } catch (error) {
    return crmRefusal(error);
  }
  revalidatePath("/admin/integrations");
  return { status: "sent", message: "Revoked.", sentAt: Date.now() };
}

export async function updateStageAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction();
  const context = await requireStaff("/admin/settings/pipeline");
  if (!hasCapability(context, "hq:admin")) return NOT_ADMIN;
  const input: Record<string, unknown> = { key: fieldValue(formData, "key", 32).trim() };
  const label = fieldValue(formData, "label", 80).trim();
  if (label) input.label = label;
  for (const name of ["position", "win_probability", "stale_after_days"] as const) {
    const raw = fieldValue(formData, name, 4).trim();
    if (raw !== "") input[name] = Number(raw);
  }
  if (formData.has("exit_criteria")) {
    input.exit_criteria = fieldValue(formData, "exit_criteria", 1_000).trim();
  }
  if (fieldValue(formData, "archived", 5) === "true") input.archived = true;
  try {
    await crmApi.updatePipelineStage(context.token, input);
  } catch (error) {
    return crmRefusal(error);
  }
  revalidatePath("/admin/settings/pipeline");
  revalidatePath("/deals");
  return { status: "sent", message: input.archived ? "Archived." : "Saved.", sentAt: Date.now() };
}
