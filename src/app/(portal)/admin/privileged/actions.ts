"use server";

import { revalidatePath } from "next/cache";

import { hasCapability, requireStaff } from "@/lib/access/core";
import * as privilegedApi from "@/lib/api/privileged";
import { fieldValue } from "@/lib/auth/forms";
import type { ActionState } from "@/lib/forms/action-state";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";
import { privilegedRefusal } from "@/lib/security/privileged-refusal";

const PATH = "/admin/privileged";
const NOT_ADMIN: ActionState = { status: "error", message: "Only HQ owners and admins see this." };

function sent(message: string): ActionState {
  return { status: "sent", message, sentAt: Date.now() };
}

export async function grantEligibilityAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff(PATH);
  if (!hasCapability(context, "hq:admin")) return NOT_ADMIN;
  const hours = Number.parseInt(fieldValue(formData, "max_hours", 3), 10);
  try {
    await privilegedApi.grantEligibility(context.token, fieldValue(formData, "staff_id", 64), {
      role: fieldValue(formData, "role", 20),
      max_hours: Number.isNaN(hours) ? 4 : hours,
      eligible_until: fieldValue(formData, "eligible_until", 10),
      reason: fieldValue(formData, "reason", 400).trim(),
    });
  } catch (error) {
    return privilegedRefusal(error);
  }
  revalidatePath(PATH);
  return sent("Eligible. They take it themselves, with a reason, when the work needs it.");
}

export async function revokeEligibilityAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff(PATH);
  if (!hasCapability(context, "hq:admin")) return NOT_ADMIN;
  let ended = 0;
  try {
    ended = (
      await privilegedApi.revokeEligibility(
        context.token,
        fieldValue(formData, "staff_id", 64),
        fieldValue(formData, "eligibility_id", 64),
      )
    ).ended;
  } catch (error) {
    return privilegedRefusal(error);
  }
  revalidatePath(PATH);
  return sent(ended ? "Revoked, and the live elevation ended." : "Revoked.");
}

export async function endElevationAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const path = fieldValue(formData, "return_path", 40) === "/me/security" ? "/me/security" : PATH;
  const context = await requireStaff(path);
  try {
    await privilegedApi.endElevation(context.token, fieldValue(formData, "elevation_id", 64));
  } catch (error) {
    return privilegedRefusal(error);
  }
  revalidatePath(path);
  revalidatePath("/", "layout");
  return sent("Ended.");
}

export async function markBreakGlassAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff(PATH);
  if (!hasCapability(context, "hq:admin")) return NOT_ADMIN;
  const on = fieldValue(formData, "on", 5) === "true";
  try {
    await privilegedApi.markBreakGlass(
      context.token,
      fieldValue(formData, "staff_id", 64),
      on,
      fieldValue(formData, "reason", 400).trim(),
    );
  } catch (error) {
    return privilegedRefusal(error);
  }
  revalidatePath(PATH);
  return sent(
    on
      ? "Marked. Every sign-in on it now alerts every other owner. Seal its credentials."
      : "No longer a break-glass account.",
  );
}

export async function recordBreakGlassTestAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff(PATH);
  if (!hasCapability(context, "hq:admin")) return NOT_ADMIN;
  try {
    await privilegedApi.recordBreakGlassTest(
      context.token,
      fieldValue(formData, "staff_id", 64),
      fieldValue(formData, "note", 400).trim(),
    );
  } catch (error) {
    return privilegedRefusal(error);
  }
  revalidatePath(PATH);
  return sent("Recorded. The next test is due in 90 days.");
}

export async function liftExportQuotaAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff(PATH);
  if (!hasCapability(context, "hq:admin")) return NOT_ADMIN;
  const extra = Number.parseInt(fieldValue(formData, "extra_rows", 7).replace(/[,\s]/g, ""), 10);
  if (Number.isNaN(extra) || extra < 1)
    return { status: "error", message: "Enter how many more records, as a whole number." };
  try {
    await privilegedApi.liftExportQuota(
      context.token,
      fieldValue(formData, "staff_id", 64),
      extra,
      fieldValue(formData, "reason", 400).trim(),
    );
  } catch (error) {
    return privilegedRefusal(error);
  }
  revalidatePath(PATH);
  return sent("Lifted for the next 24 hours.");
}
