"use server";

import { revalidatePath } from "next/cache";

import { hasCapability, requireStaff } from "@/lib/access/core";
import * as teamApi from "@/lib/api/team";
import { fieldValue } from "@/lib/auth/forms";
import { crmRefusal } from "@/lib/crm/refusal";
import type { ActionState } from "@/lib/forms/action-state";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";

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
