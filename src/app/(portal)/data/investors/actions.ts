"use server";

import { fieldValue } from "@/lib/auth/forms";
import * as api from "@/lib/data/api/investors";
import { dayValue, gate, refreshData, refusal, refused, sent, staffOf } from "@/lib/data/gate";
import type { ActionState } from "@/lib/forms/action-state";

/**
 * Investors' writes: choosing the investor list, moving a firm to a stage, one field from
 * the record's side, a note and an amount. The service checks each one and says no in a
 * sentence, which the form shows as it is.
 */

const INVESTOR_ID = /^[0-9a-f]{32}$/;
const ROUTE_ID = /^[A-Za-z0-9-]{1,64}$/;
const STAGES = new Set<string>(api.investorStageSchema.options);
const AMOUNT_STATES = new Set<string>(api.amountStateSchema.options);
const CURRENCIES = new Set<string>(api.currencySchema.options);
const NO_FIRM: ActionState = { status: "error", message: "That investor is not here." };

const attemptOf = (formData: FormData): string =>
  fieldValue(formData, "attempt", 64) || crypto.randomUUID();

function investorIdFrom(formData: FormData): string {
  const value = fieldValue(formData, "investor_id", 64);
  return INVESTOR_ID.test(value) ? value : "";
}

function refreshInvestor(investorId: string): void {
  refreshData(
    "/data/investors",
    "/data/leads",
    ...(investorId ? [`/data/investors/${investorId}`] : []),
  );
}

export async function chooseInvestorListAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/data/investors");
  if (refused(context)) return context;
  const ids = formData
    .getAll("list_id")
    .filter((value): value is string => typeof value === "string" && ROUTE_ID.test(value));
  if (ids.length === 0) return { status: "error", message: "Choose the investor list." };
  let firms = 0;
  try {
    firms = (await api.chooseInvestorLists(ids, staffOf(context))).firms;
  } catch (error) {
    return refusal(error);
  }
  refreshInvestor("");
  return sent(`${firms.toLocaleString("en-GB")} ${firms === 1 ? "firm" : "firms"} from the list.`);
}

export async function moveInvestorAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const investorId = investorIdFrom(formData);
  const context = await gate(formData, `/data/investors/${investorId}`);
  if (refused(context)) return context;
  if (!investorId) return NO_FIRM;
  const stage = fieldValue(formData, "stage", 40);
  if (!STAGES.has(stage)) return { status: "error", message: "Choose a stage." };
  const nextOn = fieldValue(formData, "next_step_on", 10).trim();
  const until = fieldValue(formData, "set_aside_until", 10).trim();
  if ((nextOn && !dayValue(nextOn)) || (until && !dayValue(until)))
    return { status: "error", message: "That is not a day." };
  try {
    await api.moveInvestor(
      investorId,
      {
        stage: stage as api.InvestorStageKey,
        next_step: fieldValue(formData, "next_step", 200),
        next_step_on: nextOn,
        ...(stage === "set_aside" ? { set_aside_until: until } : {}),
        ...(stage === "passed" ? { passed_reason: fieldValue(formData, "passed_reason", 40) } : {}),
      },
      staffOf(context),
    );
  } catch (error) {
    return refusal(error);
  }
  refreshInvestor(investorId);
  return sent("Moved.");
}

export async function updateInvestorAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const investorId = investorIdFrom(formData);
  const context = await gate(formData, `/data/investors/${investorId}`);
  if (refused(context)) return context;
  if (!investorId) return NO_FIRM;
  const field = api.INVESTOR_FIELDS.find((key) => formData.has(key));
  if (!field) return { status: "error", message: "Nothing to change." };
  const value = fieldValue(formData, field, 200).trim();
  if (field === "next_step_on" && value && !dayValue(value))
    return { status: "error", message: "That is not a day." };
  try {
    await api.updateInvestor(investorId, field, value, staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshInvestor(investorId);
  return sent("Saved.");
}

export async function addInvestorNoteAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const investorId = investorIdFrom(formData);
  const context = await gate(formData, `/data/investors/${investorId}`);
  if (refused(context)) return context;
  if (!investorId) return NO_FIRM;
  const text = fieldValue(formData, "text", 4_000).trim();
  if (!text) return { status: "error", message: "Write the note first." };
  try {
    await api.addInvestorNote(investorId, text, staffOf(context), attemptOf(formData));
  } catch (error) {
    return refusal(error);
  }
  refreshInvestor(investorId);
  return sent("Note added.");
}

export async function recordAmountAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const investorId = investorIdFrom(formData);
  const context = await gate(formData, `/data/investors/${investorId}`);
  if (refused(context)) return context;
  if (!investorId) return NO_FIRM;
  const state = fieldValue(formData, "state", 20);
  if (!AMOUNT_STATES.has(state))
    return { status: "error", message: "Choose Asked, Soft, Signed or Money in." };
  const currency = fieldValue(formData, "currency", 3);
  if (!CURRENCIES.has(currency)) return { status: "error", message: "Choose USD or INR." };
  const amount = fieldValue(formData, "amount", 40).trim();
  if (!amount) return { status: "error", message: "Type the amount." };
  const on = fieldValue(formData, "on", 10).trim();
  if (on && !dayValue(on)) return { status: "error", message: "That is not a day." };
  try {
    await api.recordInvestorAmount(
      investorId,
      {
        state: state as api.RecordAmountInput["state"],
        amount,
        currency: currency as api.RecordAmountInput["currency"],
        instrument: fieldValue(formData, "instrument", 40),
        on,
      },
      staffOf(context),
      attemptOf(formData),
    );
  } catch (error) {
    return refusal(error);
  }
  refreshInvestor(investorId);
  return sent("Amount recorded.");
}
