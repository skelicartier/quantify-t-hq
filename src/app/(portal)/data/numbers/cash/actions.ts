"use server";

import { fieldValue } from "@/lib/auth/forms";
import * as api from "@/lib/data/api/cash";
import { gate, refreshData, refusal, refused, sent, staffOf } from "@/lib/data/gate";
import type { ActionState } from "@/lib/forms/action-state";

/**
 * The cash view's writes (duties spec §7.6): lines of money expected in and other money out,
 * the opening figure while no statement gives one, the scenarios' assumptions and events, and
 * the two figures the thresholds need. Owners and Admins, as every Data page; none of these
 * touches the people ledger.
 */

const PATH = "/data/numbers/cash";
const ROUTE_ID = /^[A-Za-z0-9-]{1,64}$/;
const NOT_HERE: ActionState = { status: "error", message: "That line is not here." };

const attemptOf = (formData: FormData): string =>
  fieldValue(formData, "attempt", 64) || crypto.randomUUID();
const idOf = (formData: FormData, name: string): string => {
  const value = fieldValue(formData, name, 64);
  return ROUTE_ID.test(value) ? value : "";
};
const ticked = (formData: FormData, name: string): boolean =>
  ["1", "on", "true"].includes(fieldValue(formData, name, 10));

function refresh(): void {
  refreshData(PATH);
}

export async function addCashLineAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, PATH);
  if (refused(context)) return context;
  try {
    await api.addCashLine(
      {
        kind: fieldValue(formData, "kind", 12),
        on: fieldValue(formData, "on", 10),
        currency: fieldValue(formData, "currency", 3) || "INR",
        amount: fieldValue(formData, "amount", 24).trim(),
        name: fieldValue(formData, "name", 120),
        sure: !ticked(formData, "not_sure"),
        counted_at: fieldValue(formData, "counted_at", 3).trim(),
      },
      staffOf(context),
      attemptOf(formData),
    );
  } catch (error) {
    return refusal(error);
  }
  refresh();
  return sent("Added.");
}

export async function withdrawCashLineAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, PATH);
  if (refused(context)) return context;
  const lineId = idOf(formData, "line_id");
  if (!lineId) return NOT_HERE;
  try {
    await api.withdrawCashLine(lineId, staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refresh();
  return sent("Withdrawn.");
}

/** Any of the typed figures: only the fields the form carries are sent. */
export async function saveCashSetupAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, PATH);
  if (refused(context)) return context;
  const input: api.CashSetupInput = {};
  for (const name of [
    "opening_currency",
    "opening_amount",
    "opening_as_of",
    "burn",
    "collections",
    "growth",
    "hire_delay_months",
    "other_sales",
    "caro_amount",
    "caro_as_of",
  ] as const)
    if (formData.has(name)) input[name] = fieldValue(formData, name, 24).trim();
  try {
    await api.saveCashSetup(input, staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refresh();
  return sent("Saved.");
}

export async function addCashEventAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, PATH);
  if (refused(context)) return context;
  try {
    await api.addCashEvent(
      {
        kind: fieldValue(formData, "kind", 14),
        name: fieldValue(formData, "name", 120),
        period: fieldValue(formData, "period", 7),
        amount: fieldValue(formData, "amount", 24).trim(),
        flagged: ticked(formData, "flagged"),
      },
      staffOf(context),
      attemptOf(formData),
    );
  } catch (error) {
    return refusal(error);
  }
  refresh();
  return sent("Added.");
}

export async function removeCashEventAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, PATH);
  if (refused(context)) return context;
  const eventId = idOf(formData, "event_id");
  if (!eventId) return { status: "error", message: "That event is not here." };
  try {
    await api.removeCashEvent(eventId, staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refresh();
  return sent("Removed.");
}
