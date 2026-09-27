"use server";

import { revalidatePath } from "next/cache";

import { hasCapability, requireStaff } from "@/lib/access/core";
import * as crmApi from "@/lib/api/crm";
import { fieldValue } from "@/lib/auth/forms";
import { crmRefusal } from "@/lib/crm/refusal";
import { safeReturnPath } from "@/lib/crm/return-path";
import type { ActionState } from "@/lib/forms/action-state";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";

const LINK_FIELDS = ["company_id", "person_id", "deal_id", "lead_id", "meeting_id"] as const;

function linksFrom(formData: FormData): Record<string, string> {
  const links: Record<string, string> = {};
  for (const name of LINK_FIELDS) {
    const value = fieldValue(formData, name, 64).trim();
    if (value) links[name] = value;
  }
  return links;
}

function refresh(formData: FormData) {
  const path = safeReturnPath(fieldValue(formData, "return_path", 120));
  if (path) revalidatePath(path);
  revalidatePath("/home");
}

/** Log a note, call or email against a record. Shared by every record page. */
export async function logActivityAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction();
  const context = await requireStaff("/home");
  if (!hasCapability(context, "crm:write")) {
    return { status: "error", message: "Your role reads the CRM without writing to it." };
  }
  const body = fieldValue(formData, "body", 8_000).trim();
  if (!body) return { status: "error", message: "Write what happened first." };
  const links = linksFrom(formData);
  if (Object.keys(links).length === 0) {
    return { status: "error", message: "This entry is not attached to a record." };
  }
  try {
    await crmApi.logActivity(context.token, {
      kind: fieldValue(formData, "kind", 20),
      body,
      ...links,
    });
  } catch (error) {
    return crmRefusal(error);
  }
  refresh(formData);
  return { status: "sent", message: null, sentAt: Date.now() };
}

export async function createTaskAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction();
  const context = await requireStaff("/tasks");
  if (!hasCapability(context, "crm:write")) {
    return { status: "error", message: "Your role cannot add tasks." };
  }
  const title = fieldValue(formData, "title", 200).trim();
  if (!title) return { status: "error", message: "Say what the task is." };
  const input: Record<string, unknown> = { title, ...linksFrom(formData) };
  const dueOn = fieldValue(formData, "due_on", 10);
  if (dueOn) input.due_on = dueOn;
  const priority = fieldValue(formData, "priority", 12);
  if (priority) input.priority = priority;
  const assignee = fieldValue(formData, "assignee_staff_id", 64);
  if (assignee) input.assignee_staff_id = assignee;
  try {
    await crmApi.createTask(context.token, input);
  } catch (error) {
    return crmRefusal(error);
  }
  refresh(formData);
  revalidatePath("/tasks");
  return { status: "sent", message: null, sentAt: Date.now() };
}

/** Tick or untick a task. A plain form post; the list re-renders from the service. */
export async function setTaskStatusAction(formData: FormData): Promise<void> {
  await requireSameOriginServerAction();
  const context = await requireStaff("/tasks");
  if (!hasCapability(context, "crm:write")) return;
  const taskId = fieldValue(formData, "task_id", 64);
  const status = fieldValue(formData, "status", 12) === "open" ? "open" : "done";
  try {
    await crmApi.updateTask(context.token, taskId, { status });
  } catch {
    // The list re-renders from the service either way; a failed tick stays unticked.
  }
  refresh(formData);
  revalidatePath("/tasks");
}
