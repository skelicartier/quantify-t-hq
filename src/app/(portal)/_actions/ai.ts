"use server";

import { revalidatePath } from "next/cache";

import { hasCapability, requireStaff } from "@/lib/access/core";
import * as aiApi from "@/lib/api/ai";
import { createTask } from "@/lib/api/crm";
import { manageTicket } from "@/lib/api/tickets";
import { fieldValue, refusalMessage } from "@/lib/auth/forms";
import type { ActionState } from "@/lib/forms/action-state";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";

/**
 * The AI features' actions. Each returns the service's answer whole in `detail` (its state,
 * its words, what it found), and the component shows every state for what it is: a draft,
 * "nothing HQ holds answers this", "not configured". Only a failure to ask is an error.
 */
function answered(out: { state: string }): ActionState {
  return { status: "sent", message: null, sentAt: Date.now(), detail: JSON.stringify(out) };
}

function failed(error: unknown): ActionState {
  return { status: "error", message: refusalMessage(error) };
}

const NOT_YOURS: ActionState = { status: "error", message: "Your role does not use this." };

export async function draftReplyAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const ticketId = fieldValue(formData, "ticket_id", 40);
  const context = await requireStaff(`/support/${ticketId}`);
  if (!hasCapability(context, "tickets:write")) return NOT_YOURS;
  try {
    return answered(await aiApi.draftReply(context.token, ticketId));
  } catch (error) {
    return failed(error);
  }
}

export async function triageAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const ticketId = fieldValue(formData, "ticket_id", 40);
  const context = await requireStaff(`/support/${ticketId}`);
  if (!hasCapability(context, "tickets:write")) return NOT_YOURS;
  try {
    return answered(await aiApi.suggestTriage(context.token, ticketId));
  } catch (error) {
    return failed(error);
  }
}

/** Apply a triage suggestion through the desk's ordinary route, and record it was used. */
export async function applyTriageAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const ticketId = fieldValue(formData, "ticket_id", 40);
  const context = await requireStaff(`/support/${ticketId}`);
  if (!hasCapability(context, "tickets:write")) return NOT_YOURS;
  const tags = fieldValue(formData, "tags", 400)
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  const priority = fieldValue(formData, "priority", 12);
  try {
    await manageTicket(context.token, ticketId, { ...(priority ? { priority } : {}), tags });
    const runId = fieldValue(formData, "run_id", 64);
    if (runId) await aiApi.sendAiFeedback(context.token, runId, "used").catch(() => undefined);
  } catch (error) {
    return failed(error);
  }
  revalidatePath(`/support/${ticketId}`);
  return { status: "sent", message: "Filed as suggested.", sentAt: Date.now() };
}

export async function briefAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/home");
  if (!hasCapability(context, "crm:read")) return NOT_YOURS;
  try {
    return answered(
      await aiApi.briefMe(
        context.token,
        fieldValue(formData, "subject_type", 12),
        fieldValue(formData, "subject_id", 64),
      ),
    );
  } catch (error) {
    return failed(error);
  }
}

export async function tasksFromNotesAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const meetingId = fieldValue(formData, "meeting_id", 64);
  const context = await requireStaff(`/meetings/${meetingId}`);
  if (!hasCapability(context, "crm:write")) return NOT_YOURS;
  try {
    return answered(await aiApi.tasksFromNotes(context.token, meetingId));
  } catch (error) {
    return failed(error);
  }
}

/** Add one proposed task as an ordinary task, with the line it came from as its note. */
export async function addProposedTaskAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const meetingId = fieldValue(formData, "meeting_id", 64);
  const context = await requireStaff(`/meetings/${meetingId}`);
  if (!hasCapability(context, "crm:write")) return NOT_YOURS;
  const companyId = fieldValue(formData, "company_id", 64);
  try {
    await createTask(context.token, {
      title: fieldValue(formData, "title", 200).trim(),
      due_on: fieldValue(formData, "due_on", 10),
      body: `From the meeting notes: “${fieldValue(formData, "quote", 400).trim()}”`,
      ...(companyId ? { company_id: companyId } : {}),
    });
    const runId = fieldValue(formData, "run_id", 64);
    if (runId) await aiApi.sendAiFeedback(context.token, runId, "used").catch(() => undefined);
  } catch (error) {
    return failed(error);
  }
  revalidatePath(`/meetings/${meetingId}`);
  revalidatePath("/tasks");
  return { status: "sent", message: "Added to your tasks.", sentAt: Date.now() };
}

export async function filterAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const list = fieldValue(formData, "list", 30);
  const context = await requireStaff(`/${list}`);
  if (!hasCapability(context, "crm:read")) return NOT_YOURS;
  let fields: unknown = [];
  try {
    fields = JSON.parse(fieldValue(formData, "fields", 20000) || "[]");
  } catch {
    return { status: "error", message: "The list's fields could not be read." };
  }
  try {
    return answered(
      await aiApi.filterInWords(context.token, {
        list,
        text: fieldValue(formData, "text", 300).trim(),
        fields: Array.isArray(fields) ? (fields as never) : [],
      }),
    );
  } catch (error) {
    return failed(error);
  }
}

export async function aiFeedbackAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/home");
  const verdict = fieldValue(formData, "verdict", 12);
  if (verdict !== "used" && verdict !== "edited" && verdict !== "dismissed")
    return { status: "error", message: "Unknown verdict." };
  try {
    await aiApi.sendAiFeedback(context.token, fieldValue(formData, "run_id", 64), verdict);
  } catch (error) {
    return failed(error);
  }
  return { status: "sent", message: null, sentAt: Date.now() };
}
