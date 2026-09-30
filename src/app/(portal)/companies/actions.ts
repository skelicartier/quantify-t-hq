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

/** Rows a spreadsheet was mapped to, posted as JSON; the service validates each one. */
export async function importCompaniesAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/companies/import");
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
    const result = await crmApi.importCompanies(context.token, rows, reason);
    revalidatePath("/companies");
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
