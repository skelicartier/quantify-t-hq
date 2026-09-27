"use server";

import { revalidatePath } from "next/cache";

import { hasCapability, requireStaff } from "@/lib/access/core";
import * as authApi from "@/lib/api/auth";
import * as crmApi from "@/lib/api/crm";
import * as keysApi from "@/lib/api/keys";
import * as staffApi from "@/lib/api/staff";
import { fieldValue, refusalMessage } from "@/lib/auth/forms";
import { crmRefusal } from "@/lib/crm/refusal";
import type { ActionState } from "@/lib/forms/action-state";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";

const ADMIN_PAGE = /^\/admin\/(?:integrations|settings\/pipeline|staff(?:\/[A-Za-z0-9-]{1,64})?)$/;

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
  const path = fieldValue(formData, "return_path", 120);
  if (ADMIN_PAGE.test(path)) revalidatePath(path);
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

// ---------------------------------------------------------------------------------------
// staff
// ---------------------------------------------------------------------------------------

/** Refusals that mean something specific on the staff pages. */
function staffRefusal(error: unknown): ActionState {
  const refusal = crmRefusal(error);
  const details =
    error && typeof error === "object" && "details" in error
      ? ((error as { details: Record<string, unknown> }).details ?? {})
      : {};
  if (details["required_role"] === "owner") {
    return { status: "error", message: "Only an Owner can do that to an Owner or Admin." };
  }
  if (details["reason"] === "own-role") {
    return { status: "error", message: "Nobody changes their own role. Ask another admin." };
  }
  if (details["reason"] === "own-account") {
    return { status: "error", message: "You cannot deactivate yourself." };
  }
  return refusal;
}

function refreshStaff(staffId?: string) {
  revalidatePath("/admin/staff");
  if (staffId) revalidatePath(`/admin/staff/${staffId}`);
}

export async function inviteStaffAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction();
  const context = await requireStaff("/admin/staff");
  if (!hasCapability(context, "hq:admin")) return NOT_ADMIN;
  const input: Record<string, string> = {};
  for (const [name, limit] of [
    ["email", 254],
    ["display_name", 120],
    ["role", 32],
    ["kind", 20],
    ["starts_on", 10],
    ["ends_on", 10],
    ["personal_email", 254],
  ] as const) {
    const value = fieldValue(formData, name, limit).trim();
    if (value) input[name] = name.endsWith("email") ? value.toLowerCase() : value;
  }
  if (!input.email || !input.role) {
    return { status: "error", message: "An email and a role are required." };
  }
  try {
    const invited = await staffApi.inviteStaff(context.token, input);
    refreshStaff();
    return {
      status: "sent",
      message: invited.emailed
        ? "Invite emailed. The link is also here, once."
        : "Mail is not set up, so nothing was emailed. Share this link privately.",
      sentAt: Date.now(),
      secret: invited.invite_url,
    };
  } catch (error) {
    return staffRefusal(error);
  }
}

export async function changeStaffRoleAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction();
  const context = await requireStaff("/admin/staff");
  if (!hasCapability(context, "hq:admin")) return NOT_ADMIN;
  const staffId = fieldValue(formData, "staff_id", 64);
  const reason = fieldValue(formData, "reason", 400).trim();
  if (!reason) return { status: "error", message: "Say why the role is changing." };
  try {
    await staffApi.updateStaffMember(context.token, staffId, {
      role: fieldValue(formData, "role", 32),
      reason,
    });
  } catch (error) {
    return staffRefusal(error);
  }
  refreshStaff(staffId);
  return {
    status: "sent",
    message: "Role changed. Their sessions were ended.",
    sentAt: Date.now(),
  };
}

export async function updateStaffDetailsAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction();
  const context = await requireStaff("/admin/staff");
  if (!hasCapability(context, "hq:admin")) return NOT_ADMIN;
  const staffId = fieldValue(formData, "staff_id", 64);
  const input: Record<string, string> = {};
  for (const [name, limit] of [
    ["display_name", 120],
    ["kind", 20],
    ["starts_on", 10],
    ["ends_on", 10],
    ["personal_email", 254],
  ] as const) {
    if (formData.has(name)) input[name] = fieldValue(formData, name, limit).trim();
  }
  try {
    await staffApi.updateStaffMember(context.token, staffId, input);
  } catch (error) {
    return staffRefusal(error);
  }
  refreshStaff(staffId);
  return { status: "sent", message: "Saved.", sentAt: Date.now() };
}

export async function deactivateStaffAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction();
  const context = await requireStaff("/admin/staff");
  if (!hasCapability(context, "hq:admin")) return NOT_ADMIN;
  const staffId = fieldValue(formData, "staff_id", 64);
  const reason = fieldValue(formData, "reason", 400).trim();
  if (!reason) return { status: "error", message: "Say why their access is ending." };
  try {
    const outcome = await staffApi.deactivateStaffMember(context.token, staffId, reason);
    refreshStaff(staffId);
    return {
      status: "sent",
      message: `Deactivated. ${outcome.sessions_revoked} live ${outcome.sessions_revoked === 1 ? "session was" : "sessions were"} ended.`,
      sentAt: Date.now(),
    };
  } catch (error) {
    return staffRefusal(error);
  }
}

export async function reactivateStaffAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction();
  const context = await requireStaff("/admin/staff");
  if (!hasCapability(context, "hq:admin")) return NOT_ADMIN;
  const staffId = fieldValue(formData, "staff_id", 64);
  const reason = fieldValue(formData, "reason", 400).trim();
  if (!reason) return { status: "error", message: "Say why their access is returning." };
  try {
    await staffApi.reactivateStaffMember(context.token, staffId, reason);
  } catch (error) {
    return staffRefusal(error);
  }
  refreshStaff(staffId);
  return { status: "sent", message: "Reactivated.", sentAt: Date.now() };
}

export async function resetAuthenticatorAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction();
  const context = await requireStaff("/admin/staff");
  if (!hasCapability(context, "hq:admin")) return NOT_ADMIN;
  const staffId = fieldValue(formData, "staff_id", 64);
  const reason = fieldValue(formData, "reason", 400).trim();
  if (!reason) return { status: "error", message: "Say why the authenticator is being reset." };
  try {
    await staffApi.resetStaffAuthenticator(context.token, staffId, reason);
  } catch (error) {
    return staffRefusal(error);
  }
  refreshStaff(staffId);
  return {
    status: "sent",
    message: "Reset. They enrol a new authenticator at their next sign-in.",
    sentAt: Date.now(),
  };
}

export async function reinviteStaffAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction();
  const context = await requireStaff("/admin/staff");
  if (!hasCapability(context, "hq:admin")) return NOT_ADMIN;
  const staffId = fieldValue(formData, "staff_id", 64);
  try {
    const invited = await staffApi.reinviteStaff(context.token, staffId);
    refreshStaff(staffId);
    return {
      status: "sent",
      message: invited.emailed
        ? "New invite emailed. The old link no longer works."
        : "Mail is not set up, so nothing was emailed. Share this link privately.",
      sentAt: Date.now(),
      secret: invited.invite_url,
    };
  } catch (error) {
    const details =
      error && typeof error === "object" && "details" in error
        ? ((error as { details: Record<string, unknown> }).details ?? {})
        : {};
    if (details["reason"] === "already-joined") {
      return { status: "error", message: "They have already joined. Reactivate them instead." };
    }
    return staffRefusal(error);
  }
}
