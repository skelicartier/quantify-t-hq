"use server";

import { revalidatePath } from "next/cache";

import { hasCapability, requireStaff } from "@/lib/access/core";
import * as crmApi from "@/lib/api/crm";
import * as dealsApi from "@/lib/api/deals";
import * as fieldsApi from "@/lib/api/fields";
import { fieldValue } from "@/lib/auth/forms";
import { customFromForm } from "@/lib/forms/custom-fields";
import type { ActionState } from "@/lib/forms/action-state";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";
import { privilegedRefusal } from "@/lib/security/privileged-refusal";

const NOT_ADMIN: ActionState = {
  status: "error",
  message: "Only HQ owners and admins change the fields.",
};

const RECORDS = {
  company: { path: "/companies", capability: "crm:write" },
  person: { path: "/people", capability: "crm:write" },
  lead: { path: "/leads", capability: "crm:write" },
  deal: { path: "/deals", capability: "deals:write" },
} as const;

function sent(message: string): ActionState {
  return { status: "sent", message, sentAt: Date.now() };
}

/** Choices typed one per line: `Label`, or `value = Label` to keep an existing value. */
function optionsFrom(text: string): { value?: string; label: string }[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 50)
    .map((line) => {
      const at = line.indexOf("=");
      if (at > 0) return { value: line.slice(0, at).trim(), label: line.slice(at + 1).trim() };
      return { label: line };
    });
}

/** A record's custom fields, saved together from its Fields section. */
export async function saveCustomFieldsAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const recordType = fieldValue(formData, "record_type", 12);
  const recordId = fieldValue(formData, "record_id", 64);
  const spec = RECORDS[recordType as keyof typeof RECORDS];
  if (!spec) return { status: "error", message: "That record cannot carry fields." };
  const path = `${spec.path}/${recordId}`;
  const context = await requireStaff(path);
  if (!hasCapability(context, spec.capability))
    return { status: "error", message: "Your role reads this record but does not change it." };
  const body = { custom: customFromForm(formData) };
  try {
    if (recordType === "company") await crmApi.updateCompany(context.token, recordId, body);
    else if (recordType === "person") await crmApi.updatePerson(context.token, recordId, body);
    else if (recordType === "lead") await crmApi.updateLead(context.token, recordId, body);
    else await dealsApi.updateDeal(context.token, recordId, body);
  } catch (error) {
    return privilegedRefusal(error);
  }
  revalidatePath(path);
  return sent("Saved.");
}

export async function createFieldAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/admin/fields");
  if (!hasCapability(context, "hq:admin")) return NOT_ADMIN;
  const kind = fieldValue(formData, "kind", 14);
  const body: Record<string, unknown> = {
    record_type: fieldValue(formData, "record_type", 12),
    label: fieldValue(formData, "label", 80).trim(),
    key: fieldValue(formData, "key", 40).trim(),
    kind,
    help: fieldValue(formData, "help", 200).trim(),
    required: formData.get("required") === "on",
    sensitive: formData.get("sensitive") === "on",
  };
  if (kind === "choice" || kind === "multi_choice")
    body.options = optionsFrom(fieldValue(formData, "options", 4000));
  try {
    await fieldsApi.createField(context.token, body);
  } catch (error) {
    return privilegedRefusal(error);
  }
  revalidatePath("/admin/fields");
  return sent("Field added. It is on every record of that kind now.");
}

export async function updateFieldAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/admin/fields");
  if (!hasCapability(context, "hq:admin")) return NOT_ADMIN;
  const fieldId = fieldValue(formData, "field_id", 64);
  const action = fieldValue(formData, "action", 12);
  let body: Record<string, unknown>;
  switch (action) {
    case "up":
    case "down":
      body = { move: action };
      break;
    case "archive":
      body = { archived: true };
      break;
    case "restore":
      body = { archived: false };
      break;
    default:
      body = {
        label: fieldValue(formData, "label", 80).trim(),
        help: fieldValue(formData, "help", 200).trim(),
        required: formData.get("required") === "on",
        sensitive: formData.get("sensitive") === "on",
      };
      if (formData.has("options"))
        body.options = optionsFrom(fieldValue(formData, "options", 4000));
  }
  try {
    await fieldsApi.updateField(context.token, fieldId, body);
  } catch (error) {
    return privilegedRefusal(error);
  }
  revalidatePath("/admin/fields");
  return sent(
    action === "archive"
      ? "Archived. Its values are kept and come back if it is restored."
      : action === "restore"
        ? "Restored."
        : "Saved.",
  );
}
