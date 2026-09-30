"use server";

import { revalidatePath } from "next/cache";

import { hasCapability, requireStaff } from "@/lib/access/core";
import * as platformApi from "@/lib/api/platform";
import { sanitizeNextPath } from "@/lib/auth/route-policy";
import { fieldValue } from "@/lib/auth/forms";
import type { ActionState } from "@/lib/forms/action-state";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";
import { privilegedRefusal } from "@/lib/security/privileged-refusal";

const NOT_ADMIN: ActionState = {
  status: "error",
  message: "Only HQ owners and admins change this.",
};

function sent(message: string | null, extra: Partial<ActionState> = {}): ActionState {
  return { status: "sent", message, sentAt: Date.now(), ...extra };
}

/** The page a record form was on, checked like any return path. */
function pathOf(formData: FormData): string {
  return sanitizeNextPath(fieldValue(formData, "return_path", 200));
}

// --- comments ------------------------------------------------------------------------------------

export async function addCommentAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const path = pathOf(formData);
  const context = await requireStaff(path);
  const parentId = fieldValue(formData, "parent_id", 64);
  try {
    await platformApi.addComment(context.token, {
      subject_type: fieldValue(formData, "subject_type", 20),
      subject_id: fieldValue(formData, "subject_id", 64),
      body: fieldValue(formData, "body", 4000).trim(),
      ...(parentId ? { parent_id: parentId } : {}),
    });
  } catch (error) {
    return privilegedRefusal(error);
  }
  revalidatePath(path);
  return sent(null);
}

export async function resolveCommentAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const path = pathOf(formData);
  const context = await requireStaff(path);
  try {
    await platformApi.resolveComment(
      context.token,
      fieldValue(formData, "comment_id", 64),
      fieldValue(formData, "resolved", 5) !== "false",
    );
  } catch (error) {
    return privilegedRefusal(error);
  }
  revalidatePath(path);
  return sent(null);
}

export async function deleteCommentAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const path = pathOf(formData);
  const context = await requireStaff(path);
  try {
    await platformApi.deleteComment(context.token, fieldValue(formData, "comment_id", 64));
  } catch (error) {
    return privilegedRefusal(error);
  }
  revalidatePath(path);
  return sent(null);
}

// --- templates ----------------------------------------------------------------------------------

export async function applyTemplateAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const path = pathOf(formData);
  const context = await requireStaff(path);
  if (!hasCapability(context, "crm:write"))
    return { status: "error", message: "Your role reads the CRM without writing to it." };
  let created = 0;
  try {
    created = (
      await platformApi.applyTemplate(
        context.token,
        fieldValue(formData, "template_id", 64),
        fieldValue(formData, "subject_id", 64),
      )
    ).created;
  } catch (error) {
    return privilegedRefusal(error);
  }
  revalidatePath(path);
  revalidatePath("/tasks");
  return sent(`${created} ${created === 1 ? "task" : "tasks"} added to yours.`);
}

export async function saveTemplateAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/tasks/templates");
  if (!hasCapability(context, "crm:write"))
    return { status: "error", message: "Your role reads the CRM without writing to it." };
  const titles = formData.getAll("item_title").map(String);
  const days = formData.getAll("item_days").map(String);
  const priorities = formData.getAll("item_priority").map(String);
  const items = titles
    .map((title, index) => ({
      title: title.trim(),
      due_in_days: Number.parseInt(days[index] ?? "0", 10) || 0,
      priority: priorities[index] || "medium",
    }))
    .filter((item) => item.title);
  const templateId = fieldValue(formData, "template_id", 64);
  const body = {
    name: fieldValue(formData, "name", 120).trim(),
    description: fieldValue(formData, "description", 400).trim(),
    items,
  };
  try {
    if (templateId) await platformApi.updateTemplate(context.token, templateId, body);
    else
      await platformApi.createTemplate(context.token, {
        ...body,
        applies_to: fieldValue(formData, "applies_to", 16),
      });
  } catch (error) {
    return privilegedRefusal(error);
  }
  revalidatePath("/tasks/templates");
  return sent(templateId ? "Saved." : "Template added.");
}

export async function archiveTemplateAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/tasks/templates");
  if (!hasCapability(context, "crm:write"))
    return { status: "error", message: "Your role reads the CRM without writing to it." };
  const archived = fieldValue(formData, "archived", 5) === "true";
  try {
    await platformApi.updateTemplate(context.token, fieldValue(formData, "template_id", 64), {
      archived,
    });
  } catch (error) {
    return privilegedRefusal(error);
  }
  revalidatePath("/tasks/templates");
  return sent(archived ? "Archived." : "Restored.");
}

// --- validation rules ----------------------------------------------------------------------------

export async function createRuleAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/admin/rules");
  if (!hasCapability(context, "hq:admin")) return NOT_ADMIN;
  const [recordType = "", field = ""] = fieldValue(formData, "target", 60).split(":");
  try {
    await platformApi.createRule(context.token, {
      record_type: recordType,
      field,
      check_kind: fieldValue(formData, "check_kind", 16),
      value: fieldValue(formData, "value", 60).trim(),
      message: fieldValue(formData, "message", 200).trim(),
    });
  } catch (error) {
    return privilegedRefusal(error);
  }
  revalidatePath("/admin/rules");
  return sent("Rule added. It applies to every write from now on.");
}

export async function toggleRuleAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/admin/rules");
  if (!hasCapability(context, "hq:admin")) return NOT_ADMIN;
  try {
    await platformApi.updateRule(context.token, fieldValue(formData, "rule_id", 64), {
      active: fieldValue(formData, "active", 5) === "true",
    });
  } catch (error) {
    return privilegedRefusal(error);
  }
  revalidatePath("/admin/rules");
  return sent(null);
}

// --- outbound webhooks ---------------------------------------------------------------------------

export async function createWebhookAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/admin/webhooks");
  if (!hasCapability(context, "hq:admin")) return NOT_ADMIN;
  let secret = "";
  try {
    secret = (
      await platformApi.createWebhook(context.token, {
        url: fieldValue(formData, "url", 500).trim(),
        description: fieldValue(formData, "description", 200).trim(),
        event_types: formData.getAll("event_types").map(String).slice(0, 20),
      })
    ).secret;
  } catch (error) {
    return privilegedRefusal(error);
  }
  revalidatePath("/admin/webhooks");
  // The signing secret travels only in this answer, once.
  return sent("Added. Copy the signing secret now: it is not shown again.", { secret });
}

export async function webhookAct(_previous: ActionState, formData: FormData): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const endpointId = fieldValue(formData, "endpoint_id", 64);
  const context = await requireStaff(`/admin/webhooks/${endpointId}`);
  if (!hasCapability(context, "hq:admin")) return NOT_ADMIN;
  const act = fieldValue(formData, "act", 12);
  let result: ActionState;
  try {
    if (act === "test") {
      await platformApi.testWebhook(context.token, endpointId);
      result = sent("A test event is queued; it goes out with the next delivery pass.");
    } else if (act === "rotate") {
      const secret = (await platformApi.rotateWebhook(context.token, endpointId)).secret;
      result = sent(
        "New signing secret: copy it now, and update the receiver. The old one stops working.",
        { secret },
      );
    } else if (act === "on" || act === "off") {
      await platformApi.updateWebhook(context.token, endpointId, { active: act === "on" });
      result = sent(act === "on" ? "Switched on." : "Switched off.");
    } else return { status: "error", message: "Unknown action." };
  } catch (error) {
    return privilegedRefusal(error);
  }
  revalidatePath("/admin/webhooks");
  revalidatePath(`/admin/webhooks/${endpointId}`);
  return result;
}
