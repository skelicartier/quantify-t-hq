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

export async function createLeadAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction();
  const context = await requireStaff("/leads");
  if (!hasCapability(context, "crm:write")) return READ_ONLY;
  const email = fieldValue(formData, "email", 254).trim();
  const fullName = fieldValue(formData, "full_name", 160).trim();
  if (!email && !fullName) return { status: "error", message: "Give a name or an email." };
  let leadId: string;
  try {
    const created = await crmApi.createLead(context.token, {
      email,
      full_name: fullName,
      company_name: fieldValue(formData, "company_name", 200).trim(),
      source_key: fieldValue(formData, "source_key", 32),
      message: fieldValue(formData, "message", 8_000).trim(),
    });
    leadId = created.lead.lead_id;
  } catch (error) {
    return crmRefusal(error);
  }
  revalidatePath("/leads");
  redirect(`/leads/${leadId}`);
}

export async function updateLeadStageAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction();
  const context = await requireStaff("/leads");
  if (!hasCapability(context, "crm:write")) return READ_ONLY;
  const leadId = fieldValue(formData, "lead_id", 64);
  const stage = fieldValue(formData, "stage", 20);
  const input: Record<string, unknown> = { stage };
  if (stage === "disqualified") {
    input.disqualify_reason = fieldValue(formData, "disqualify_reason", 40);
  }
  try {
    await crmApi.updateLead(context.token, leadId, input);
  } catch (error) {
    return crmRefusal(error);
  }
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  revalidatePath("/home");
  return { status: "sent", message: "Stage saved.", sentAt: Date.now() };
}

/** Qualify: find-or-create the company and the person, optionally open the deal. */
export async function convertLeadAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction();
  const context = await requireStaff("/leads");
  if (!hasCapability(context, "crm:write")) return READ_ONLY;
  const leadId = fieldValue(formData, "lead_id", 64);

  const company: Record<string, string> = {};
  const companyId = fieldValue(formData, "company_id", 64);
  if (companyId) {
    company.company_id = companyId;
  } else {
    const name = fieldValue(formData, "company_name", 200).trim();
    const domain = fieldValue(formData, "domain", 255).trim().toLowerCase();
    if (name) company.name = name;
    if (domain) company.domain = domain;
  }
  const input: Record<string, unknown> = { company };
  if (formData.get("with_deal") === "on") {
    const nextStep = fieldValue(formData, "next_step", 400).trim();
    const due = fieldValue(formData, "next_step_due", 10);
    if (!nextStep || !due) {
      return { status: "error", message: "A new deal needs its next step and a date." };
    }
    const mrr = Number(fieldValue(formData, "mrr_amount", 16) || 0);
    input.deal = {
      stage_key: fieldValue(formData, "stage_key", 32) || "demo_booked",
      mrr_amount: Number.isFinite(mrr) && mrr > 0 ? mrr : 0,
      next_step: nextStep,
      next_step_due: due,
    };
  }
  let target: string;
  try {
    const converted = await crmApi.convertLead(context.token, leadId, input);
    target = converted.deal_id
      ? `/deals/${converted.deal_id}`
      : `/companies/${converted.company_id}`;
  } catch (error) {
    return crmRefusal(error);
  }
  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/deals");
  revalidatePath("/companies");
  revalidatePath("/home");
  redirect(target);
}
