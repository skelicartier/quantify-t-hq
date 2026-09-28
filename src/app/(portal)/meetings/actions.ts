"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { hasCapability, requireStaff } from "@/lib/access/core";
import * as meetingsApi from "@/lib/api/meetings";
import { fieldValue } from "@/lib/auth/forms";
import { crmRefusal } from "@/lib/crm/refusal";
import type { ActionState } from "@/lib/forms/action-state";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";

const READ_ONLY: ActionState = {
  status: "error",
  message: "Your role reads meetings without changing them.",
};

function refreshMeeting(meetingId: string) {
  revalidatePath(`/meetings/${meetingId}`);
  revalidatePath("/meetings");
  revalidatePath("/home");
  revalidatePath("/tasks");
}

export async function createMeetingAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/meetings");
  if (!hasCapability(context, "crm:write")) return READ_ONLY;
  const title = fieldValue(formData, "title", 200).trim();
  const startsAt = fieldValue(formData, "starts_at", 40);
  if (!title || !startsAt) {
    return { status: "error", message: "A title and a start time are required." };
  }
  const input: Record<string, unknown> = {
    title,
    kind: fieldValue(formData, "kind", 20) || "other",
    starts_at: startsAt,
    attendees: fieldValue(formData, "attendees", 4_000),
  };
  const endsAt = fieldValue(formData, "ends_at", 40);
  if (endsAt) input.ends_at = endsAt;
  const companyId = fieldValue(formData, "company_id", 64);
  if (companyId) input.company_id = companyId;
  let meetingId: string;
  try {
    meetingId = (await meetingsApi.createMeeting(context.token, input)).meeting.meeting_id;
  } catch (error) {
    return crmRefusal(error);
  }
  revalidatePath("/meetings");
  revalidatePath("/home");
  if (companyId) revalidatePath(`/companies/${companyId}`);
  redirect(`/meetings/${meetingId}`);
}

export async function updatePrepAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/meetings");
  if (!hasCapability(context, "crm:write")) return READ_ONLY;
  const meetingId = fieldValue(formData, "meeting_id", 64);
  try {
    await meetingsApi.updateMeeting(context.token, meetingId, {
      prep_notes: fieldValue(formData, "prep_notes", 8_000),
      recording_url: fieldValue(formData, "recording_url", 400).trim(),
    });
  } catch (error) {
    return crmRefusal(error);
  }
  refreshMeeting(meetingId);
  return { status: "sent", message: "Saved.", sentAt: Date.now() };
}

export async function recordOutcomeAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/meetings");
  if (!hasCapability(context, "crm:write")) return READ_ONLY;
  const meetingId = fieldValue(formData, "meeting_id", 64);
  const status = fieldValue(formData, "status", 20);
  const input: { status: string; outcome?: string; outcome_notes?: string } = { status };
  if (status === "completed") input.outcome = fieldValue(formData, "outcome", 20);
  const notes = fieldValue(formData, "outcome_notes", 2_000).trim();
  if (notes) input.outcome_notes = notes;
  try {
    const recorded = await meetingsApi.recordMeetingOutcome(context.token, meetingId, input);
    refreshMeeting(meetingId);
    return {
      status: "sent",
      message:
        recorded.follow_ups_created > 0
          ? `Recorded. ${recorded.follow_ups_created} follow-up tasks were added.`
          : "Recorded.",
      sentAt: Date.now(),
    };
  } catch (error) {
    return crmRefusal(error);
  }
}

export async function linkMeetingAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/meetings");
  if (!hasCapability(context, "crm:write")) return READ_ONLY;
  const meetingId = fieldValue(formData, "meeting_id", 64);
  const companyId = fieldValue(formData, "company_id", 64);
  if (!companyId) return { status: "error", message: "Choose a company." };
  try {
    await meetingsApi.updateMeeting(context.token, meetingId, { company_id: companyId });
  } catch (error) {
    return crmRefusal(error);
  }
  refreshMeeting(meetingId);
  revalidatePath(`/companies/${companyId}`);
  return { status: "sent", message: "Linked.", sentAt: Date.now() };
}
