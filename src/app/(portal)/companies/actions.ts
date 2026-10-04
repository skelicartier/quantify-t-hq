"use server";

import { customFromForm } from "@/lib/forms/custom-fields";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { hasCapability, requireStaff } from "@/lib/access/core";
import * as crmApi from "@/lib/api/crm";
import * as targetsApi from "@/lib/api/targets";
import { dismissDuplicates } from "@/lib/api/data-quality";
import { fieldValue } from "@/lib/auth/forms";
import { sendImportPart, takeBackImport } from "@/lib/crm/record-import-actions";
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
    ["owner_staff_id", 64],
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
    companyId = (
      await crmApi.createCompany(context.token, { ...fields, custom: customFromForm(formData) })
    ).company.company_id;
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

/** Fold this company into another; on success the kept company opens. */
export async function mergeCompanyAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/companies");
  if (!hasCapability(context, "crm:write")) return READ_ONLY;
  const companyId = fieldValue(formData, "company_id", 64);
  const into = fieldValue(formData, "into", 64).trim();
  if (!into) return { status: "error", message: "Say which company to keep." };
  if (into === companyId) {
    return { status: "error", message: "A company cannot be merged into itself." };
  }
  try {
    await crmApi.mergeCompany(context.token, companyId, into);
  } catch (error) {
    return crmRefusal(error);
  }
  revalidatePath("/companies");
  revalidatePath(`/companies/${into}`);
  revalidatePath(`/companies/${companyId}`);
  redirect(`/companies/${into}`);
}

/** "Not the same" for companies or people: the review stops asking about them. */
export async function dismissCrmGroupAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/companies/duplicates");
  if (!hasCapability(context, "crm:write")) return READ_ONLY;
  const kind = fieldValue(formData, "kind", 10) === "person" ? "person" : "company";
  const ids = fieldValue(formData, "ids", 2_000)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 20);
  try {
    await dismissDuplicates(context.token, { kind, ids });
  } catch (error) {
    return crmRefusal(error);
  }
  revalidatePath("/companies/duplicates");
  revalidatePath("/data-health");
  return {
    status: "sent",
    message: "Kept apart. The review asks again only if another look-alike joins them.",
    sentAt: Date.now(),
  };
}

/** Rows a spreadsheet was mapped to, posted as JSON; the service validates each one. */
/** One part of a file, or a rehearsal of it: every row comes back accounted for. */
export async function importCompaniesAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  return sendImportPart("companies", formData);
}

/** Take a file back out: what nobody has touched since goes; the answer says what stayed. */
export async function rollbackCompaniesImportAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  return takeBackImport("companies", formData);
}

/** Make the company a target account, or change its tier and plan. */
export async function setTargetAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/targets");
  if (!hasCapability(context, "crm:write")) return READ_ONLY;
  const companyId = fieldValue(formData, "company_id", 64);
  try {
    await targetsApi.setTarget(context.token, companyId, {
      tier: Number(fieldValue(formData, "tier", 2) || 0),
      why: fieldValue(formData, "why", 400).trim(),
      next_step: fieldValue(formData, "next_step", 200).trim(),
      next_step_due: fieldValue(formData, "next_step_due", 10).trim(),
      reach: formData
        .getAll("reach")
        .map((value) => String(value).slice(0, 64))
        .slice(0, 12),
    });
  } catch (error) {
    return crmRefusal(error);
  }
  revalidatePath(`/companies/${companyId}`);
  revalidatePath("/targets");
  return { status: "sent", message: "Saved.", sentAt: Date.now() };
}

export async function removeTargetAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/targets");
  if (!hasCapability(context, "crm:write")) return READ_ONLY;
  const companyId = fieldValue(formData, "company_id", 64);
  try {
    await targetsApi.removeTarget(context.token, companyId);
  } catch (error) {
    return crmRefusal(error);
  }
  revalidatePath(`/companies/${companyId}`);
  revalidatePath("/targets");
  return { status: "sent", message: "No longer a target account.", sentAt: Date.now() };
}
