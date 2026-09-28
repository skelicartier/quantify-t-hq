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

function companyFields(formData: FormData): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const [name, limit] of [
    ["name", 200],
    ["domain", 255],
    ["firm_type", 40],
    ["team_size_band", 20],
    ["country", 60],
    ["notes", 2_000],
    ["lifecycle", 20],
  ] as const) {
    if (formData.has(name)) fields[name] = fieldValue(formData, name, limit).trim();
  }
  if (fields.domain) fields.domain = fields.domain.toLowerCase();
  return fields;
}

export async function createCompanyAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/companies");
  if (!hasCapability(context, "crm:write")) return READ_ONLY;
  const fields = companyFields(formData);
  if (!fields.name) return { status: "error", message: "Give the firm a name." };
  let companyId: string;
  try {
    companyId = (await crmApi.createCompany(context.token, fields)).company.company_id;
  } catch (error) {
    return crmRefusal(error);
  }
  revalidatePath("/companies");
  redirect(`/companies/${companyId}`);
}

export async function updateCompanyAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/companies");
  if (!hasCapability(context, "crm:write")) return READ_ONLY;
  const companyId = fieldValue(formData, "company_id", 64);
  try {
    await crmApi.updateCompany(context.token, companyId, companyFields(formData));
  } catch (error) {
    return crmRefusal(error);
  }
  revalidatePath(`/companies/${companyId}`);
  revalidatePath("/companies");
  return { status: "sent", message: "Saved.", sentAt: Date.now() };
}
