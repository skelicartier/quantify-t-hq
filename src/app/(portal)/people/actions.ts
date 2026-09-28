"use server";

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
    personId = (await crmApi.createPerson(context.token, input)).person.person_id;
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
  const input: Record<string, unknown> = {
    do_not_contact: formData.get("do_not_contact") === "on",
  };
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
