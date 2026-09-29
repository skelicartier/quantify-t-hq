"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { hasCapability, requireStaff } from "@/lib/access/core";
import * as authApi from "@/lib/api/auth";
import { HqApiRequestError } from "@/lib/api/core";
import * as crmApi from "@/lib/api/crm";
import * as integrationsApi from "@/lib/api/integrations";
import * as keysApi from "@/lib/api/keys";
import * as settingsApi from "@/lib/api/settings";
import * as staffApi from "@/lib/api/staff";
import { fieldValue, refusalMessage } from "@/lib/auth/forms";
import { crmRefusal } from "@/lib/crm/refusal";
import type { ActionState } from "@/lib/forms/action-state";
import { sanitizeNextPath } from "@/lib/auth/route-policy";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";

const NOT_ADMIN: ActionState = { status: "error", message: "Only HQ admins can change this." };

/** A fresh authenticator code opens the ten-minute window for sensitive changes. */
export async function confirmSudoAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  // The gate is mounted on several pages; a lapsed session returns to the one it was on.
  const path = sanitizeNextPath(fieldValue(formData, "return_path", 120));
  const context = await requireStaff(path);
  const code = fieldValue(formData, "code", 6).trim();
  if (!/^\d{6}$/.test(code)) {
    return { status: "error", message: "Enter the six digits your authenticator app shows." };
  }
  try {
    await authApi.grantSudo(context.token, code);
  } catch (error) {
    return { status: "error", message: refusalMessage(error) };
  }
  revalidatePath(path);
  return { status: "sent", message: null, sentAt: Date.now() };
}

export async function mintKeyAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
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
  await requireSameOriginServerAction(formData);
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
  await requireSameOriginServerAction(formData);
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
  await requireSameOriginServerAction(formData);
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
  await requireSameOriginServerAction(formData);
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
  await requireSameOriginServerAction(formData);
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
  await requireSameOriginServerAction(formData);
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
  await requireSameOriginServerAction(formData);
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
  await requireSameOriginServerAction(formData);
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
  await requireSameOriginServerAction(formData);
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

// ---------------------------------------------------------------------------------------
// the team calendar
// ---------------------------------------------------------------------------------------

/** Send the browser to the calendar's consent screen; it returns to the callback. */
export async function connectCalendarAction(): Promise<ActionState> {
  await requireSameOriginServerAction();
  const context = await requireStaff("/admin/integrations");
  if (!hasCapability(context, "hq:admin")) return NOT_ADMIN;
  let target: string;
  try {
    target = (await integrationsApi.startCalendarConnect(context.token)).authorization_url;
  } catch (error) {
    const details =
      error && typeof error === "object" && "details" in error
        ? ((error as { details: Record<string, unknown> }).details ?? {})
        : {};
    if (details["reason"] === "not-configured") {
      return {
        status: "error",
        message: "The service has no calendar client yet. It must be set up there first.",
      };
    }
    return crmRefusal(error);
  }
  redirect(target);
}

export async function syncCalendarAction(): Promise<ActionState> {
  await requireSameOriginServerAction();
  const context = await requireStaff("/admin/integrations");
  if (!hasCapability(context, "hq:admin")) return NOT_ADMIN;
  try {
    const result = await integrationsApi.syncCalendarNow(context.token);
    revalidatePath("/admin/integrations");
    revalidatePath("/meetings");
    const { created, updated, canceled } = result.sync;
    return {
      status: "sent",
      message:
        created + updated + canceled === 0
          ? "In step. Nothing changed since the last sync."
          : `Synced: ${created} new, ${updated} updated, ${canceled} called off.`,
      sentAt: Date.now(),
    };
  } catch (error) {
    return crmRefusal(error);
  }
}

export async function disconnectCalendarAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/admin/integrations");
  if (!hasCapability(context, "hq:admin")) return NOT_ADMIN;
  const reason = fieldValue(formData, "reason", 400).trim();
  if (!reason) return { status: "error", message: "Say why the calendar is being disconnected." };
  try {
    await integrationsApi.disconnectCalendar(context.token, reason);
  } catch (error) {
    return crmRefusal(error);
  }
  revalidatePath("/admin/integrations");
  return {
    status: "sent",
    message: "Disconnected. Meetings already synced stay.",
    sentAt: Date.now(),
  };
}

/** A whole number from a form field, or null when it is anything else. */
function wholeNumber(formData: FormData, name: string): number | null {
  const raw = fieldValue(formData, name, 12).trim();
  return /^\d{1,6}$/.test(raw) ? Number(raw) : null;
}

export async function updateSlaAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/admin/settings");
  if (!hasCapability(context, "hq:admin")) return NOT_ADMIN;
  const first = wholeNumber(formData, "first_reply_minutes");
  const next = wholeNumber(formData, "next_reply_minutes");
  if (first === null || next === null) {
    return { status: "error", message: "Enter both targets as whole minutes." };
  }
  try {
    await settingsApi.updateSla(context.token, {
      priority: fieldValue(formData, "priority", 12),
      first_reply_minutes: first,
      next_reply_minutes: next,
    });
  } catch (error) {
    return crmRefusal(error);
  }
  revalidatePath("/admin/settings");
  return { status: "sent", message: "Saved.", sentAt: Date.now() };
}

export async function updatePlanAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/admin/settings");
  if (!hasCapability(context, "hq:admin")) return NOT_ADMIN;
  const input: Record<string, unknown> = { key: fieldValue(formData, "key", 32).trim() };
  for (const [name, limit] of [
    ["name", 80],
    ["unit_amount", 16],
    ["currency", 3],
    ["billing_cadence", 10],
    ["min_seats", 6],
  ] as const) {
    if (formData.has(name)) {
      const value = fieldValue(formData, name, limit).trim();
      if (value) input[name] = name === "currency" ? value.toUpperCase() : value;
    }
  }
  const archived = fieldValue(formData, "archived", 5);
  if (archived === "true") input.archived = true;
  if (archived === "false") input.archived = false;
  try {
    await settingsApi.updatePlan(context.token, input);
  } catch (error) {
    return crmRefusal(error);
  }
  revalidatePath("/admin/settings");
  return {
    status: "sent",
    message: archived === "true" ? "Archived." : archived === "false" ? "Restored." : "Saved.",
    sentAt: Date.now(),
  };
}

export async function updateSourceAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/admin/settings");
  if (!hasCapability(context, "hq:admin")) return NOT_ADMIN;
  const input: Record<string, unknown> = { key: fieldValue(formData, "key", 32).trim() };
  const label = fieldValue(formData, "label", 80).trim();
  if (label) input.label = label;
  const archived = fieldValue(formData, "archived", 5);
  if (archived === "true") input.archived = true;
  if (archived === "false") input.archived = false;
  try {
    await settingsApi.updateSource(context.token, input);
  } catch (error) {
    return crmRefusal(error);
  }
  revalidatePath("/admin/settings");
  return {
    status: "sent",
    message: archived === "true" ? "Archived." : archived === "false" ? "Restored." : "Saved.",
    sentAt: Date.now(),
  };
}

/**
 * The danger zone's phrase is bound to what the page showed. A refusal naming a
 * different phrase means the page is stale — the count moved — not that the person
 * mistyped, since the button only arms on an exact match.
 */
function dangerRefusal(error: unknown): ActionState {
  if (
    error instanceof HqApiRequestError &&
    error.code === "malformed_request" &&
    typeof error.details["confirm"] === "string"
  ) {
    revalidatePath("/admin/danger");
    return {
      status: "error",
      message:
        error.details["confirm"] === "nothing is due"
          ? "Nothing is due any more. Nothing was changed."
          : "The number due changed since this page loaded. Nothing was changed; check the new count and type it again.",
    };
  }
  return crmRefusal(error);
}

export async function updateRetentionAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/admin/danger");
  if (!hasCapability(context, "hq:admin")) return NOT_ADMIN;
  const disqualified = wholeNumber(formData, "disqualified_lead_days");
  const quiet = wholeNumber(formData, "quiet_lead_days");
  const reason = fieldValue(formData, "reason", 400).trim();
  if (disqualified === null || quiet === null) {
    return { status: "error", message: "Enter both rules as whole days; 0 turns a rule off." };
  }
  if (reason.length < 8) {
    return { status: "error", message: "Say why the rules are changing, in a sentence." };
  }
  try {
    await settingsApi.updateRetention(context.token, {
      disqualified_lead_days: disqualified,
      quiet_lead_days: quiet,
      reason,
    });
  } catch (error) {
    return crmRefusal(error);
  }
  revalidatePath("/admin/danger");
  return { status: "sent", message: "Rules saved.", sentAt: Date.now() };
}

export async function runRetentionAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/admin/danger");
  if (!hasCapability(context, "hq:admin")) return NOT_ADMIN;
  const reason = fieldValue(formData, "reason", 400).trim();
  if (reason.length < 8) {
    return { status: "error", message: "Say why this runs now, in a sentence." };
  }
  try {
    const result = await settingsApi.runRetention(context.token, {
      confirm: fieldValue(formData, "confirm", 60).trim(),
      reason,
    });
    revalidatePath("/admin/danger");
    const done = Object.values(result.anonymised).reduce((sum, count) => sum + count, 0);
    const left = result.remaining
      ? ` ${result.remaining} more ${result.remaining === 1 ? "is" : "are"} due; run again.`
      : "";
    return {
      status: "sent",
      message: `Anonymised ${done} ${done === 1 ? "lead" : "leads"}.${left}`,
      sentAt: Date.now(),
    };
  } catch (error) {
    return dangerRefusal(error);
  }
}

export async function signEveryoneOutAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/admin/danger");
  if (!hasCapability(context, "hq:admin")) return NOT_ADMIN;
  const reason = fieldValue(formData, "reason", 400).trim();
  if (reason.length < 8) {
    return { status: "error", message: "Say what happened, in a sentence." };
  }
  try {
    const { revoked } = await settingsApi.signEveryoneOut(context.token, {
      confirm: fieldValue(formData, "confirm", 60).trim(),
      reason,
    });
    revalidatePath("/admin/danger");
    revalidatePath("/me/security");
    return {
      status: "sent",
      message: `Signed out ${revoked} ${revoked === 1 ? "session" : "sessions"}. Yours stays open.`,
      sentAt: Date.now(),
    };
  } catch (error) {
    return dangerRefusal(error);
  }
}
