"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { hasCapability, requireStaff } from "@/lib/access/core";
import * as dealsApi from "@/lib/api/deals";
import { fieldValue } from "@/lib/auth/forms";
import { crmRefusal } from "@/lib/crm/refusal";
import type { ActionState } from "@/lib/forms/action-state";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";

const READ_ONLY: ActionState = {
  status: "error",
  message: "Your role reads the pipeline without changing it.",
};

function refreshDeal(dealId: string, companyId?: string) {
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/deals");
  revalidatePath("/home");
  if (companyId) revalidatePath(`/companies/${companyId}`);
}

function money(formData: FormData, name: string): number | undefined {
  const raw = fieldValue(formData, name, 16).trim();
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

export async function createDealAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/deals");
  if (!hasCapability(context, "deals:write")) return READ_ONLY;
  const companyId = fieldValue(formData, "company_id", 64);
  const nextStep = fieldValue(formData, "next_step", 400).trim();
  const due = fieldValue(formData, "next_step_due", 10);
  if (!nextStep || !due) {
    return { status: "error", message: "An open deal needs its next step and a date." };
  }
  const input: Record<string, unknown> = {
    company_id: companyId,
    stage_key: fieldValue(formData, "stage_key", 32) || "demo_booked",
    next_step: nextStep,
    next_step_due: due,
    seats: Math.max(1, Math.round(money(formData, "seats") ?? 1)),
  };
  const name = fieldValue(formData, "name", 200).trim();
  if (name) input.name = name;
  const mrr = money(formData, "mrr_amount");
  if (mrr !== undefined) input.mrr_amount = mrr;
  const person = fieldValue(formData, "primary_person_id", 64);
  if (person) input.primary_person_id = person;
  const planKey = fieldValue(formData, "plan_key", 32).trim();
  if (planKey) input.plan_key = planKey;
  let dealId: string;
  try {
    dealId = (await dealsApi.createDeal(context.token, input)).deal.deal_id;
  } catch (error) {
    return crmRefusal(error);
  }
  refreshDeal(dealId, companyId);
  redirect(`/deals/${dealId}`);
}

export async function moveDealStageAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/deals");
  if (!hasCapability(context, "deals:write")) return READ_ONLY;
  const dealId = fieldValue(formData, "deal_id", 64);
  const nextStep = fieldValue(formData, "next_step", 400).trim();
  const due = fieldValue(formData, "next_step_due", 10);
  if (!nextStep || !due) {
    return { status: "error", message: "Say what happens next, and by when." };
  }
  try {
    await dealsApi.moveDealStage(context.token, dealId, {
      stage_key: fieldValue(formData, "stage_key", 32),
      next_step: nextStep,
      next_step_due: due,
    });
  } catch (error) {
    return crmRefusal(error);
  }
  refreshDeal(dealId);
  return { status: "sent", message: "Moved.", sentAt: Date.now() };
}

export async function updateNextStepAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/deals");
  if (!hasCapability(context, "deals:write")) return READ_ONLY;
  const dealId = fieldValue(formData, "deal_id", 64);
  try {
    await dealsApi.updateDeal(context.token, dealId, {
      next_step: fieldValue(formData, "next_step", 400).trim(),
      next_step_due: fieldValue(formData, "next_step_due", 10),
    });
  } catch (error) {
    return crmRefusal(error);
  }
  refreshDeal(dealId);
  return { status: "sent", message: null, sentAt: Date.now() };
}

export async function updateDealAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/deals");
  if (!hasCapability(context, "deals:write")) return READ_ONLY;
  const dealId = fieldValue(formData, "deal_id", 64);
  const input: Record<string, unknown> = {};
  const name = fieldValue(formData, "name", 200).trim();
  if (name) input.name = name;
  const mrr = money(formData, "mrr_amount");
  if (mrr !== undefined) input.mrr_amount = mrr;
  const seats = money(formData, "seats");
  if (seats !== undefined) input.seats = Math.max(1, Math.round(seats));
  if (formData.has("expected_close_date")) {
    input.expected_close_date = fieldValue(formData, "expected_close_date", 10);
  }
  if (formData.has("notes")) input.notes = fieldValue(formData, "notes", 8_000);
  if (formData.has("owner_staff_id"))
    input.owner_staff_id = fieldValue(formData, "owner_staff_id", 64);
  if (formData.has("primary_person_id")) {
    input.primary_person_id = fieldValue(formData, "primary_person_id", 64);
  }
  if (formData.has("currency")) input.currency = fieldValue(formData, "currency", 3).toUpperCase();
  if (formData.has("plan_key")) input.plan_key = fieldValue(formData, "plan_key", 32).trim();
  try {
    await dealsApi.updateDeal(context.token, dealId, input);
  } catch (error) {
    return crmRefusal(error);
  }
  refreshDeal(dealId);
  return { status: "sent", message: "Saved.", sentAt: Date.now() };
}

export async function closeDealAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/deals");
  if (!hasCapability(context, "deals:write")) return READ_ONLY;
  const dealId = fieldValue(formData, "deal_id", 64);
  const outcome = fieldValue(formData, "outcome", 16);
  const input: Record<string, unknown> = { outcome };
  if (outcome === "lost") {
    input.loss_reason = fieldValue(formData, "loss_reason", 40);
    input.loss_competitor = fieldValue(formData, "loss_competitor", 120).trim();
    input.loss_detail = fieldValue(formData, "loss_detail", 400).trim();
  }
  try {
    await dealsApi.closeDeal(context.token, dealId, input);
  } catch (error) {
    return crmRefusal(error);
  }
  refreshDeal(dealId);
  revalidatePath("/companies");
  return { status: "sent", message: "Closed.", sentAt: Date.now() };
}
