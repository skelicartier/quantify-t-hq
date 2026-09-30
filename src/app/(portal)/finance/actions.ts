"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError } from "@/lib/api/core";
import * as fin from "@/lib/api/finance";
import { fieldValue, refusalMessage } from "@/lib/auth/forms";
import type { ActionState } from "@/lib/forms/action-state";
import { requireSameOriginServerAction } from "@/lib/security/action-origin";

const NOT_FINANCE: ActionState = {
  status: "error",
  message: "Cash, vendors and investor updates are kept by Owners and Admins.",
};

function refusal(error: unknown): ActionState {
  if (error instanceof HqApiRequestError) {
    const detail = Object.values(error.details).find((value) => typeof value === "string");
    if (
      (error.code === "malformed_request" || error.code === "forbidden") &&
      typeof detail === "string"
    )
      return { status: "error", message: `${detail.charAt(0).toUpperCase()}${detail.slice(1)}.` };
  }
  return { status: "error", message: refusalMessage(error) };
}

function sent(message: string): ActionState {
  return { status: "sent", message, sentAt: Date.now() };
}

function collect(formData: FormData, fields: ReadonlyArray<readonly [string, number]>) {
  const body: Record<string, string> = {};
  for (const [name, limit] of fields) {
    if (formData.has(name)) body[name] = fieldValue(formData, name, limit).trim();
  }
  return body;
}

async function finance(formData: FormData, path: string) {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff(path);
  return { context, allowed: hasCapability(context, "revenue:write") };
}

// --- cash ------------------------------------------------------------------------------------------

export async function createCashAccountAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { context, allowed } = await finance(formData, "/finance");
  if (!allowed) return NOT_FINANCE;
  try {
    await fin.createCashAccount(
      context.token,
      collect(formData, [
        ["name", 120],
        ["institution", 120],
        ["currency", 3],
      ]),
    );
  } catch (error) {
    return refusal(error);
  }
  revalidatePath("/finance");
  return sent("Account added. Record its balance to count it.");
}

export async function recordBalanceAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { context, allowed } = await finance(formData, "/finance");
  if (!allowed) return NOT_FINANCE;
  let corrected = false;
  try {
    corrected = (
      await fin.recordBalance(
        context.token,
        collect(formData, [
          ["account_id", 64],
          ["as_of", 10],
          ["amount", 24],
          ["note", 400],
        ]),
      )
    ).corrected;
  } catch (error) {
    return refusal(error);
  }
  revalidatePath("/finance");
  return sent(corrected ? "That day's balance is corrected." : "Balance recorded.");
}

export async function archiveCashAccountAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { context, allowed } = await finance(formData, "/finance");
  if (!allowed) return NOT_FINANCE;
  try {
    await fin.updateCashAccount(context.token, fieldValue(formData, "account_id", 64), {
      archived: fieldValue(formData, "action", 10) === "archive",
    });
  } catch (error) {
    return refusal(error);
  }
  revalidatePath("/finance");
  return sent("Saved.");
}

// --- vendors ---------------------------------------------------------------------------------------

const VENDOR_FIELDS = [
  ["name", 160],
  ["category", 16],
  ["amount", 24],
  ["currency", 3],
  ["billing", 10],
  ["renews_on", 10],
  ["notice_days", 4],
  ["owner_staff_id", 64],
  ["contract_ref", 120],
  ["notes", 2000],
  ["status", 12],
] as const;

function vendorBody(formData: FormData): Record<string, unknown> {
  const body: Record<string, unknown> = collect(formData, VENDOR_FIELDS);
  if (formData.has("auto_renews:present")) body.auto_renews = formData.get("auto_renews") === "on";
  return body;
}

export async function createVendorAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { context, allowed } = await finance(formData, "/finance/vendors");
  if (!allowed) return NOT_FINANCE;
  try {
    await fin.createVendor(context.token, vendorBody(formData));
  } catch (error) {
    return refusal(error);
  }
  revalidatePath("/finance/vendors");
  return sent("Vendor added.");
}

export async function updateVendorAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const vendorId = fieldValue(formData, "vendor_id", 64);
  const { context, allowed } = await finance(formData, `/finance/vendors/${vendorId}`);
  if (!allowed) return NOT_FINANCE;
  try {
    await fin.updateVendor(context.token, vendorId, vendorBody(formData));
  } catch (error) {
    return refusal(error);
  }
  revalidatePath("/finance/vendors");
  revalidatePath(`/finance/vendors/${vendorId}`);
  return sent("Saved.");
}

// --- expense claims: everyone's own, decided by someone else ---------------------------------------

export async function claimExpenseAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/expenses");
  try {
    await fin.createExpense(
      context.token,
      collect(formData, [
        ["spent_on", 10],
        ["amount", 24],
        ["currency", 3],
        ["category", 16],
        ["description", 400],
        ["receipt_ref", 400],
      ]),
    );
  } catch (error) {
    return refusal(error);
  }
  revalidatePath("/expenses");
  return sent("Claimed. Someone else approves it.");
}

export async function actOnExpenseAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSameOriginServerAction(formData);
  const context = await requireStaff("/expenses");
  const action = fieldValue(formData, "action", 10);
  try {
    await fin.actOnExpense(context.token, fieldValue(formData, "claim_id", 64), {
      action,
      ...collect(formData, [
        ["note", 400],
        ["paid_on", 10],
      ]),
    });
  } catch (error) {
    return refusal(error);
  }
  revalidatePath("/expenses");
  const said: Record<string, string> = {
    approve: "Approved.",
    reject: "Rejected, with your reason.",
    pay: "Recorded as paid.",
    withdraw: "Withdrawn.",
  };
  return sent(said[action] ?? "Saved.");
}

// --- investor updates ------------------------------------------------------------------------------

export async function createInvestorUpdateAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { context, allowed } = await finance(formData, "/finance/updates");
  if (!allowed) return NOT_FINANCE;
  let updateId = "";
  try {
    updateId = (await fin.createInvestorUpdate(context.token, collect(formData, [["period", 7]])))
      .update.update_id;
  } catch (error) {
    return refusal(error);
  }
  revalidatePath("/finance/updates");
  redirect(`/finance/updates/${updateId}`);
}

export async function actOnInvestorUpdateAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const updateId = fieldValue(formData, "update_id", 64);
  const { context, allowed } = await finance(formData, `/finance/updates/${updateId}`);
  if (!allowed) return NOT_FINANCE;
  const action = fieldValue(formData, "action", 10);
  try {
    await fin.actOnInvestorUpdate(context.token, updateId, {
      action,
      ...collect(formData, [
        ["title", 160],
        ["highlights", 4000],
        ["lowlights", 4000],
        ["asks", 4000],
      ]),
    });
  } catch (error) {
    return refusal(error);
  }
  revalidatePath("/finance/updates");
  revalidatePath(`/finance/updates/${updateId}`);
  const said: Record<string, string> = {
    edit: "Saved.",
    refresh: "The figures are read again, as of now.",
    finalise: "Final. It is kept as it stands.",
  };
  return sent(said[action] ?? "Saved.");
}
