"use server";

import { revalidatePath } from "next/cache";

import { hasCapability, requireStaff } from "@/lib/access/core";
import * as privilegedApi from "@/lib/api/privileged";
import * as teamApi from "@/lib/api/team";
import { fieldValue } from "@/lib/auth/forms";
import { crmRefusal } from "@/lib/crm/refusal";
import type { ActionState } from "@/lib/forms/action-state";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";
import { privilegedRefusal } from "@/lib/security/privileged-refusal";

const NOT_HR: ActionState = { status: "error", message: "Team records are kept by HQ admins." };

function detailsOf(error: unknown): Record<string, unknown> {
  return error && typeof error === "object" && "details" in error
    ? ((error as { details: Record<string, unknown> }).details ?? {})
    : {};
}

function refreshPerson(staffId: string) {
  revalidatePath(`/team/${staffId}`);
  revalidatePath("/team");
}

export async function saveDocumentAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/team");
  if (!hasCapability(context, "hr:write")) return NOT_HR;
  const staffId = fieldValue(formData, "staff_id", 64);
  const input: Record<string, unknown> = {
    status: fieldValue(formData, "status", 12),
    signed_on: fieldValue(formData, "signed_on", 10),
    reference: fieldValue(formData, "reference", 400).trim(),
  };
  const documentId = fieldValue(formData, "document_id", 64);
  if (documentId) input.document_id = documentId;
  else {
    input.kind = fieldValue(formData, "kind", 24);
    input.title = fieldValue(formData, "title", 120).trim();
  }
  try {
    await teamApi.saveDocument(context.token, staffId, input);
  } catch (error) {
    return crmRefusal(error);
  }
  refreshPerson(staffId);
  return { status: "sent", message: "Recorded.", sentAt: Date.now() };
}

export async function grantAccessAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/team");
  if (!hasCapability(context, "hr:write")) return NOT_HR;
  const staffId = fieldValue(formData, "staff_id", 64);
  const input: Record<string, unknown> = {
    system: fieldValue(formData, "system", 60).trim(),
    level: fieldValue(formData, "level", 40).trim(),
    expires_on: fieldValue(formData, "expires_on", 10),
    notes: fieldValue(formData, "notes", 400).trim(),
  };
  const override = fieldValue(formData, "override_reason", 400).trim();
  if (override) input.override_reason = override;
  try {
    await teamApi.grantAccess(context.token, staffId, input);
  } catch (error) {
    if (detailsOf(error)["reason"] === "documents-missing") {
      return {
        status: "error",
        message:
          "Their NDA and IP assignment are not both signed or waived. Record them first, or give a reason to grant anyway.",
      };
    }
    return crmRefusal(error);
  }
  refreshPerson(staffId);
  return { status: "sent", message: "Access recorded.", sentAt: Date.now() };
}

export async function revokeAccessAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/team");
  if (!hasCapability(context, "hr:write")) return NOT_HR;
  const staffId = fieldValue(formData, "staff_id", 64);
  try {
    await teamApi.revokeAccess(
      context.token,
      staffId,
      fieldValue(formData, "access_id", 64),
      fieldValue(formData, "reason", 400).trim(),
    );
  } catch (error) {
    return crmRefusal(error);
  }
  refreshPerson(staffId);
  revalidatePath("/access-review");
  return { status: "sent", message: "Revoked.", sentAt: Date.now() };
}

export async function startChecklistAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/team");
  if (!hasCapability(context, "hr:write")) return NOT_HR;
  const staffId = fieldValue(formData, "staff_id", 64);
  try {
    await teamApi.startChecklist(context.token, staffId, fieldValue(formData, "kind", 12));
  } catch (error) {
    return crmRefusal(error);
  }
  refreshPerson(staffId);
  return { status: "sent", message: "Started.", sentAt: Date.now() };
}

/** Tick or untick a checklist step. The row says so when the service refuses. */
export async function checklistStepAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/team");
  if (!hasCapability(context, "hr:write")) {
    return { status: "error", message: "Your role cannot change checklists." };
  }
  const staffId = fieldValue(formData, "staff_id", 64);
  try {
    await teamApi.markChecklistStep(
      context.token,
      fieldValue(formData, "run_id", 64),
      Number(fieldValue(formData, "position", 4)),
      fieldValue(formData, "done", 5) === "true",
    );
  } catch (error) {
    return crmRefusal(error);
  }
  refreshPerson(staffId);
  return { status: "sent", message: null, sentAt: Date.now() };
}

export async function issueCertificateAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/certificates");
  if (!hasCapability(context, "certificates:issue")) {
    return { status: "error", message: "Certificates are issued by HQ admins." };
  }
  const input: Record<string, unknown> = {
    recipient_name: fieldValue(formData, "recipient_name", 120).trim(),
    title: fieldValue(formData, "title", 120).trim(),
    starts_on: fieldValue(formData, "starts_on", 10),
    ends_on: fieldValue(formData, "ends_on", 10),
    summary: fieldValue(formData, "summary", 600).trim(),
  };
  const staffId = fieldValue(formData, "staff_id", 64);
  if (staffId) input.staff_id = staffId;
  try {
    const issued = await teamApi.issueCertificate(context.token, input);
    revalidatePath("/certificates");
    if (staffId) refreshPerson(staffId);
    return {
      status: "sent",
      message: `Issued ${issued.serial}.`,
      sentAt: Date.now(),
      secret: issued.serial,
    };
  } catch (error) {
    return crmRefusal(error);
  }
}

export async function revokeCertificateAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/certificates");
  if (!hasCapability(context, "certificates:issue")) {
    return { status: "error", message: "Certificates are revoked by HQ admins." };
  }
  const reason = fieldValue(formData, "reason", 400).trim();
  if (!reason) return { status: "error", message: "Say why the certificate is revoked." };
  try {
    await teamApi.revokeCertificate(context.token, fieldValue(formData, "serial", 24), reason);
  } catch (error) {
    return crmRefusal(error);
  }
  revalidatePath("/certificates");
  return { status: "sent", message: "Revoked. The public check now says so.", sentAt: Date.now() };
}

export async function startReviewAction(): Promise<ActionState> {
  await requireSameOriginServerAction();
  const context = await requireStaff("/access-review");
  if (!hasCapability(context, "hr:write")) return NOT_HR;
  try {
    await teamApi.startAccessReview(context.token);
  } catch (error) {
    return crmRefusal(error);
  }
  revalidatePath("/access-review");
  return { status: "sent", message: "Review started.", sentAt: Date.now() };
}

export async function decideReviewItemAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/access-review");
  if (!hasCapability(context, "hr:write")) return NOT_HR;
  try {
    await teamApi.decideReviewItem(
      context.token,
      fieldValue(formData, "review_id", 64),
      fieldValue(formData, "access_id", 64),
      {
        decision: fieldValue(formData, "decision", 8),
        evidence: fieldValue(formData, "evidence", 400).trim(),
      },
    );
  } catch (error) {
    return crmRefusal(error);
  }
  revalidatePath("/access-review");
  revalidatePath("/team");
  return { status: "sent", message: null, sentAt: Date.now() };
}

export async function completeReviewAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/access-review");
  if (!hasCapability(context, "hr:write")) return NOT_HR;
  try {
    await teamApi.completeAccessReview(
      context.token,
      fieldValue(formData, "review_id", 64),
      fieldValue(formData, "notes", 1_000).trim(),
    );
  } catch (error) {
    return crmRefusal(error);
  }
  revalidatePath("/access-review");
  return { status: "sent", message: "Review complete.", sentAt: Date.now() };
}

export async function submitCheckinAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/checkin");
  try {
    await teamApi.submitCheckin(context.token, {
      week: fieldValue(formData, "week", 8),
      wins: fieldValue(formData, "wins", 2_000).trim(),
      priorities: fieldValue(formData, "priorities", 2_000).trim(),
      blockers: fieldValue(formData, "blockers", 2_000).trim(),
      mood: Number(fieldValue(formData, "mood", 1)),
    });
  } catch (error) {
    return crmRefusal(error);
  }
  revalidatePath("/checkin");
  revalidatePath("/team");
  return { status: "sent", message: "Check-in saved. Thank you.", sentAt: Date.now() };
}

export async function requestTimeOffAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/time-off");
  try {
    await teamApi.requestTimeOff(context.token, {
      kind: fieldValue(formData, "kind", 10),
      starts_on: fieldValue(formData, "starts_on", 10),
      ends_on: fieldValue(formData, "ends_on", 10),
      note: fieldValue(formData, "note", 400).trim(),
    });
  } catch (error) {
    return crmRefusal(error);
  }
  revalidatePath("/time-off");
  return {
    status: "sent",
    message: "Requested. You will see the decision here.",
    sentAt: Date.now(),
  };
}

/** Approve, decline or withdraw. Withdrawing one's own request needs no HR right. */
export async function decideTimeOffAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/time-off");
  const decision = fieldValue(formData, "decision", 10);
  if (decision !== "canceled" && !hasCapability(context, "hr:write")) {
    return { status: "error", message: "Only HR decides requests." };
  }
  try {
    await teamApi.decideTimeOff(context.token, fieldValue(formData, "request_id", 64), decision);
  } catch (error) {
    return crmRefusal(error);
  }
  revalidatePath("/time-off");
  revalidatePath("/team");
  return { status: "sent", message: null, sentAt: Date.now() };
}

// --- people ops -----------------------------------------------------------------------

/** Manager, probation end and emergency contact, one field or several at once. */
export async function updateProfileAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/team");
  if (!hasCapability(context, "hr:write")) return NOT_HR;
  const staffId = fieldValue(formData, "staff_id", 64);
  const input: Record<string, unknown> = {};
  for (const [name, limit] of [
    ["manager_id", 64],
    ["probation_ends_on", 10],
    ["emergency_contact_name", 120],
    ["emergency_contact_phone", 40],
    ["emergency_contact_relation", 60],
  ] as const) {
    if (formData.has(name)) input[name] = fieldValue(formData, name, limit).trim();
  }
  if (Object.keys(input).length === 0) return { status: "error", message: "Nothing to change." };
  try {
    await teamApi.updateProfile(context.token, staffId, input);
  } catch (error) {
    const details = detailsOf(error);
    if ("manager_id" in details) {
      return { status: "error", message: `Manager: ${String(details.manager_id)}.` };
    }
    return crmRefusal(error);
  }
  refreshPerson(staffId);
  return { status: "sent", message: "Saved.", sentAt: Date.now() };
}

/** Issue something (no asset id) or record it back (asset id + returned on). */
export async function saveAssetAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/team");
  if (!hasCapability(context, "hr:write")) return NOT_HR;
  const staffId = fieldValue(formData, "staff_id", 64);
  const assetId = fieldValue(formData, "asset_id", 64);
  const input: Record<string, unknown> = {};
  if (assetId) {
    input.asset_id = assetId;
    if (formData.has("returned_on")) input.returned_on = fieldValue(formData, "returned_on", 10);
    if (formData.has("notes")) input.notes = fieldValue(formData, "notes", 400).trim();
  } else {
    input.kind = fieldValue(formData, "kind", 16);
    input.label = fieldValue(formData, "label", 120).trim();
    input.serial = fieldValue(formData, "serial", 80).trim();
    input.issued_on = fieldValue(formData, "issued_on", 10);
    input.notes = fieldValue(formData, "notes", 400).trim();
    if (!input.label) return { status: "error", message: "Say what was issued." };
  }
  try {
    await teamApi.saveAsset(context.token, staffId, input);
  } catch (error) {
    const details = detailsOf(error);
    if ("returned_on" in details) {
      return { status: "error", message: "The return date cannot be before it was issued." };
    }
    return crmRefusal(error);
  }
  refreshPerson(staffId);
  return {
    status: "sent",
    message: assetId ? "Recorded as returned." : "Issued.",
    sentAt: Date.now(),
  };
}

export async function addTrainingAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/team");
  if (!hasCapability(context, "hr:write")) return NOT_HR;
  const staffId = fieldValue(formData, "staff_id", 64);
  const input = {
    title: fieldValue(formData, "title", 160).trim(),
    provider: fieldValue(formData, "provider", 120).trim(),
    completed_on: fieldValue(formData, "completed_on", 10),
    expires_on: fieldValue(formData, "expires_on", 10),
    reference: fieldValue(formData, "reference", 400).trim(),
  };
  if (!input.title || !input.completed_on) {
    return { status: "error", message: "Name the training and say when it was completed." };
  }
  try {
    await teamApi.addTraining(context.token, staffId, input);
  } catch (error) {
    const details = detailsOf(error);
    if ("expires_on" in details) {
      return { status: "error", message: "The expiry must come after the completion date." };
    }
    return crmRefusal(error);
  }
  refreshPerson(staffId);
  return { status: "sent", message: "Recorded.", sentAt: Date.now() };
}

/** A one-to-one with up to four actions; the service decides who may write it. */
export async function addOneOnOneAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/team");
  const staffId = fieldValue(formData, "staff_id", 64);
  const actions: { title: string; due_on: string; owner: string }[] = [];
  for (let index = 0; index < 4; index += 1) {
    const title = fieldValue(formData, `action_title_${index}`, 200).trim();
    if (!title) continue;
    actions.push({
      title,
      due_on: fieldValue(formData, `action_due_${index}`, 10),
      owner: fieldValue(formData, `action_owner_${index}`, 4) === "me" ? "me" : "them",
    });
  }
  const input = {
    held_on: fieldValue(formData, "held_on", 10),
    notes: fieldValue(formData, "notes", 2000).trim(),
    actions,
  };
  if (!input.held_on) return { status: "error", message: "Say when it was held." };
  try {
    await teamApi.addOneOnOne(context.token, staffId, input);
  } catch (error) {
    if (
      error instanceof Error &&
      "status" in error &&
      (error as { status: number }).status === 403
    ) {
      return {
        status: "error",
        message: "Only HQ admins or the person's manager record a one-to-one.",
      };
    }
    return crmRefusal(error);
  }
  refreshPerson(staffId);
  return { status: "sent", message: "Recorded.", sentAt: Date.now() };
}

export async function toggleActionItemAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/team");
  const staffId = fieldValue(formData, "staff_id", 64);
  const actionId = fieldValue(formData, "action_id", 64);
  const done = fieldValue(formData, "done", 5) === "true";
  try {
    await teamApi.toggleAction(context.token, actionId, done);
  } catch (error) {
    return crmRefusal(error);
  }
  refreshPerson(staffId);
  return { status: "sent", message: null, sentAt: Date.now() };
}

/** The signed-in person acknowledges the current version of a policy. */
export async function acknowledgePolicyAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/me/security");
  const key = fieldValue(formData, "policy_key", 40);
  try {
    await teamApi.acknowledgePolicy(context.token, key);
  } catch (error) {
    return crmRefusal(error);
  }
  revalidatePath("/me/security");
  revalidatePath("/home");
  return { status: "sent", message: "Acknowledged.", sentAt: Date.now() };
}

/**
 * One masked value, for a reason. It comes back only in this answer, to the person who
 * asked, and the page shows it for a minute; the reveal is in the audit log.
 */
export async function revealFieldAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const staffId = fieldValue(formData, "staff_id", 64);
  const context = await requireStaff(`/team/${staffId}`);
  if (!hasCapability(context, "hr:read")) return NOT_HR;
  const oneOnOneId = fieldValue(formData, "one_on_one_id", 64);
  let value = "";
  try {
    value = (
      await privilegedApi.revealField(context.token, staffId, {
        field: fieldValue(formData, "field", 40),
        reason: fieldValue(formData, "reason", 400).trim(),
        ...(oneOnOneId ? { one_on_one_id: oneOnOneId } : {}),
      })
    ).value;
  } catch (error) {
    return privilegedRefusal(error);
  }
  revalidatePath(`/team/${staffId}`);
  return { status: "sent", message: null, sentAt: Date.now(), secret: value };
}

function count(value: number, one: string, many: string): string {
  return `${value.toLocaleString("en-GB")} ${value === 1 ? one : many}`;
}

/**
 * Hand a leaver's work in hand to one colleague. The service moves each kind only to a
 * role that works on it and says what it left; the message says both.
 */
export async function handoverAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/team");
  if (!hasCapability(context, "hq:admin"))
    return { status: "error", message: "Only those who manage HQ hand work over." };
  const staffId = fieldValue(formData, "staff_id", 64);
  const keys = formData
    .getAll("keys")
    .map((value) => String(value).slice(0, 40))
    .filter(Boolean);
  if (!keys.length) return { status: "error", message: "Tick what should move." };
  try {
    const result = await teamApi.runHandover(context.token, staffId, {
      to_staff_id: fieldValue(formData, "to_staff_id", 64),
      reason: fieldValue(formData, "reason", 400).trim(),
      keys,
    });
    refreshPerson(staffId);
    const moved = result.moved
      .filter((line) => line.count > 0)
      .map((line) => `${line.count.toLocaleString("en-GB")} ${line.label.toLowerCase()}`);
    const parts = [`Moved to ${result.to_name}: ${moved.join(", ") || "nothing"}.`];
    if (result.sequences_ended)
      parts.push(
        `${count(result.sequences_ended, "sequence", "sequences")} ended: ${result.to_name} has no identity of their own to send from.`,
      );
    if (result.skipped.length)
      parts.push(
        `Left for someone else: ${result.skipped
          .map(
            (line) =>
              `${line.count.toLocaleString("en-GB")} ${line.label.toLowerCase()} (${line.why})`,
          )
          .join("; ")}.`,
      );
    if (result.offboarding_ticked) parts.push("The offboarding step is ticked.");
    return { status: "sent", message: parts.join(" "), sentAt: Date.now() };
  } catch (error) {
    return crmRefusal(error);
  }
}
