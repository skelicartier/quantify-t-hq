"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { hasCapability, requireStaff } from "@/lib/access/core";
import * as revenueApi from "@/lib/api/revenue";
import { fieldValue } from "@/lib/auth/forms";
import { crmRefusal } from "@/lib/crm/refusal";
import type { ActionState } from "@/lib/forms/action-state";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";

const READ_ONLY: ActionState = {
  status: "error",
  message: "Your role reads revenue without changing it.",
};

function refreshRevenue(contractId?: string, companyId?: string) {
  revalidatePath("/revenue/contracts");
  revalidatePath("/revenue/mrr");
  revalidatePath("/reports");
  if (contractId) revalidatePath(`/revenue/contracts/${contractId}`);
  if (companyId) revalidatePath(`/companies/${companyId}`);
}

export async function createContractAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/revenue/contracts");
  if (!hasCapability(context, "revenue:write")) return READ_ONLY;
  const companyId = fieldValue(formData, "company_id", 64);
  const input: Record<string, unknown> = {
    company_id: companyId,
    plan_name: fieldValue(formData, "plan_name", 80).trim(),
    mrr_amount: fieldValue(formData, "mrr_amount", 16),
    currency: fieldValue(formData, "currency", 3),
    seats: fieldValue(formData, "seats", 6) || "1",
    billing_cadence: fieldValue(formData, "billing_cadence", 10) || "monthly",
    starts_on: fieldValue(formData, "starts_on", 10),
    term_months: fieldValue(formData, "term_months", 3) || "12",
  };
  const dealId = fieldValue(formData, "deal_id", 64);
  if (dealId) input.deal_id = dealId;
  let contractId: string;
  try {
    contractId = (await revenueApi.createContract(context.token, input)).contract.contract_id;
  } catch (error) {
    return crmRefusal(error);
  }
  refreshRevenue(undefined, companyId);
  redirect(`/revenue/contracts/${contractId}`);
}

export async function changePriceAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/revenue/contracts");
  if (!hasCapability(context, "revenue:write")) return READ_ONLY;
  const contractId = fieldValue(formData, "contract_id", 64);
  const input: Record<string, unknown> = {
    mrr_amount: fieldValue(formData, "mrr_amount", 16),
    effective_on: fieldValue(formData, "effective_on", 10),
  };
  const seats = fieldValue(formData, "seats", 6);
  if (seats) input.seats = seats;
  const note = fieldValue(formData, "note", 400).trim();
  if (note) input.note = note;
  try {
    await revenueApi.updateContract(context.token, contractId, input);
  } catch (error) {
    return crmRefusal(error);
  }
  refreshRevenue(contractId);
  return { status: "sent", message: "Price changed from that date.", sentAt: Date.now() };
}

export async function cancelContractAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/revenue/contracts");
  if (!hasCapability(context, "revenue:write")) return READ_ONLY;
  const contractId = fieldValue(formData, "contract_id", 64);
  try {
    await revenueApi.cancelContract(context.token, contractId, {
      ends_on: fieldValue(formData, "ends_on", 10),
      cancel_reason: fieldValue(formData, "cancel_reason", 40),
      note: fieldValue(formData, "note", 400).trim(),
    });
  } catch (error) {
    return crmRefusal(error);
  }
  refreshRevenue(contractId);
  return { status: "sent", message: "Cancellation recorded.", sentAt: Date.now() };
}

export async function adjustMrrAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/revenue/mrr");
  if (!hasCapability(context, "revenue:write")) return READ_ONLY;
  const reason = fieldValue(formData, "reason", 400).trim();
  if (!reason) return { status: "error", message: "Say why the figure needs correcting." };
  try {
    await revenueApi.adjustMrr(context.token, {
      company_id: fieldValue(formData, "company_id", 64),
      amount: fieldValue(formData, "amount", 16),
      currency: fieldValue(formData, "currency", 3),
      effective_on: fieldValue(formData, "effective_on", 10),
      reason,
    });
  } catch (error) {
    return crmRefusal(error);
  }
  refreshRevenue();
  return { status: "sent", message: "Adjustment recorded.", sentAt: Date.now() };
}

/**
 * One property of a contract, edited where it sits: the plan's name, the seat count,
 * how it is billed, when it renews, the notes. The price itself changes through
 * `changePriceAction`, because a price needs an effective date to land in the ledger.
 */
export async function updateContractAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/revenue/contracts");
  if (!hasCapability(context, "revenue:write")) return READ_ONLY;
  const contractId = fieldValue(formData, "contract_id", 64);
  const input: Record<string, string> = {};
  for (const [name, limit] of [
    ["plan_name", 80],
    ["seats", 6],
    ["billing_cadence", 10],
    ["renews_on", 10],
    ["notes", 2_000],
  ] as const) {
    if (formData.has(name)) input[name] = fieldValue(formData, name, limit).trim();
  }
  if (Object.keys(input).length === 0) return { status: "error", message: "Nothing to save." };
  try {
    await revenueApi.updateContract(context.token, contractId, input);
  } catch (error) {
    return crmRefusal(error);
  }
  refreshRevenue(contractId);
  return { status: "sent", message: "Saved.", sentAt: Date.now() };
}
