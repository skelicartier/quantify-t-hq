"use server";

import { customFromForm } from "@/lib/forms/custom-fields";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { hasCapability, requireStaff } from "@/lib/access/core";
import * as crmApi from "@/lib/api/crm";
import { fieldValue } from "@/lib/auth/forms";
import { crmRefusal } from "@/lib/crm/refusal";
import type { ActionState } from "@/lib/forms/action-state";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";

const READ_ONLY: ActionState = {
  status: "error",
  message: "Your role reads the CRM without writing to it.",
};

export async function createPersonAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/people");
  if (!hasCapability(context, "crm:write")) return READ_ONLY;
  const fullName = fieldValue(formData, "full_name", 160).trim();
  const email = fieldValue(formData, "email", 254).trim().toLowerCase();
  if (!fullName && !email) return { status: "error", message: "Give a name or an email." };
  const input: Record<string, string> = { full_name: fullName, email };
  const title = fieldValue(formData, "title", 120).trim();
  if (title) input.title = title;
  const companyId = fieldValue(formData, "company_id", 64);
  if (companyId) input.company_id = companyId;
  let personId: string;
  try {
    personId = (
      await crmApi.createPerson(context.token, { ...input, custom: customFromForm(formData) })
    ).person.person_id;
  } catch (error) {
    return crmRefusal(error);
  }
  revalidatePath("/people");
  if (companyId) revalidatePath(`/companies/${companyId}`);
  redirect(`/people/${personId}`);
}

export async function updatePersonAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/people");
  if (!hasCapability(context, "crm:write")) return READ_ONLY;
  const personId = fieldValue(formData, "person_id", 64);
  const input: Record<string, unknown> = {};
  // The full form carries the checkbox (absent means unticked); a single-field edit
  // from the properties panel says so explicitly, so it can never untick it by accident.
  if (formData.has("do_not_contact_choice")) {
    input.do_not_contact = fieldValue(formData, "do_not_contact_choice", 3) === "yes";
  } else if (formData.has("full_form")) {
    input.do_not_contact = formData.get("do_not_contact") === "on";
  }
  for (const [name, limit] of [
    ["full_name", 160],
    ["title", 120],
    ["role_category", 40],
    ["phone", 40],
    ["notes", 2_000],
    ["company_id", 64],
  ] as const) {
    if (formData.has(name)) input[name] = fieldValue(formData, name, limit).trim();
  }
  try {
    await crmApi.updatePerson(context.token, personId, input);
  } catch (error) {
    return crmRefusal(error);
  }
  revalidatePath(`/people/${personId}`);
  revalidatePath("/people");
  return { status: "sent", message: "Saved.", sentAt: Date.now() };
}

/** Fold this person into another; on success the kept person opens. */
export async function mergePersonAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/people");
  if (!hasCapability(context, "crm:write")) return READ_ONLY;
  const personId = fieldValue(formData, "person_id", 64);
  const into = fieldValue(formData, "into", 64).trim();
  if (!into) return { status: "error", message: "Say which person to keep." };
  if (into === personId)
    return { status: "error", message: "A person cannot be merged into themself." };
  try {
    await crmApi.mergePerson(context.token, personId, into);
  } catch (error) {
    return crmRefusal(error);
  }
  revalidatePath("/people");
  revalidatePath(`/people/${into}`);
  revalidatePath(`/people/${personId}`);
  redirect(`/people/${into}`);
}

export async function importPeopleAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/people/import");
  if (!hasCapability(context, "crm:write")) return READ_ONLY;
  const reason = fieldValue(formData, "reason", 400).trim();
  if (reason.length < 4) return { status: "error", message: "Say where the file came from." };
  let rows: Record<string, string>[];
  try {
    const parsed: unknown = JSON.parse(fieldValue(formData, "rows_json", 2_000_000) || "[]");
    if (!Array.isArray(parsed)) throw new Error("not a list");
    rows = parsed.filter(
      (row): row is Record<string, string> => typeof row === "object" && row !== null,
    );
  } catch {
    return { status: "error", message: "The rows could not be read. Map the columns again." };
  }
  if (rows.length === 0) return { status: "error", message: "No rows to import." };
  if (rows.length > 500) return { status: "error", message: "At most 500 rows at a time." };
  try {
    const result = await crmApi.importPeople(context.token, rows, reason);
    revalidatePath("/people");
    return {
      status: "sent",
      message: `${result.created.length} created · ${result.skipped.length} skipped · ${result.invalid.length} invalid`,
      sentAt: Date.now(),
      detail: JSON.stringify(result),
    };
  } catch (error) {
    return crmRefusal(error);
  }
}
