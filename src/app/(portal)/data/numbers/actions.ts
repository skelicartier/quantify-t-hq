"use server";

import { fieldValue } from "@/lib/auth/forms";
import { addDate } from "@/lib/data/api/dates";
import * as api from "@/lib/data/api/numbers";
import { gate, refreshData, refusal, refused, sent, staffOf } from "@/lib/data/gate";
import type { ActionState } from "@/lib/forms/action-state";

/**
 * Numbers' writes: the cash and burn he types, the buyer firm types, one month's update
 * (its words, freezing its numbers, handing its recipients to Mail merge as a list he
 * sends himself), and the monthly reminder in Key dates. Nothing here sends anything.
 */

const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;
const NO_UPDATE: ActionState = { status: "error", message: "There is no update for that month." };

const attemptOf = (formData: FormData): string =>
  fieldValue(formData, "attempt", 64) || crypto.randomUUID();

const periodFrom = (formData: FormData): string => {
  const value = fieldValue(formData, "period", 7);
  return PERIOD.test(value) ? value : "";
};

function refreshNumbers(period?: string): void {
  refreshData("/data/numbers", ...(period ? [`/data/numbers/updates/${period}`] : []));
}

/** "8.0": a runway as the page writes it. */
const runwayWords = (months: number) => (Math.round(months * 10) / 10).toFixed(1);

export async function saveMoneyAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/data/numbers");
  if (refused(context)) return context;
  let runway: number | null = null;
  try {
    runway = (
      await api.saveMoney(
        {
          currency: fieldValue(formData, "currency", 3),
          cash: fieldValue(formData, "cash", 40),
          burn_per_month: fieldValue(formData, "burn_per_month", 40),
          as_of: fieldValue(formData, "as_of", 10),
          note: fieldValue(formData, "note", 500),
        },
        staffOf(context),
        attemptOf(formData),
      )
    ).runway_months;
  } catch (error) {
    return refusal(error);
  }
  refreshNumbers();
  return sent(runway === null ? "Saved." : `Saved. Runway ${runwayWords(runway)} months.`);
}

export async function saveBuyerTypesAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/data/numbers");
  if (refused(context)) return context;
  const types = formData
    .getAll("buyer_type")
    .map((value) => (typeof value === "string" ? value.trim().slice(0, 80) : ""))
    .filter(Boolean);
  const another = fieldValue(formData, "another", 80).trim();
  if (another) types.push(another);
  try {
    await api.saveNumbersSetup({ buyer_types: types }, staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshNumbers();
  return sent("Saved.");
}

export async function saveUpdateAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/data/numbers");
  if (refused(context)) return context;
  const period = periodFrom(formData);
  if (!period) return NO_UPDATE;
  try {
    await api.saveUpdate(
      period,
      {
        opening: fieldValue(formData, "opening", 400),
        asks: fieldValue(formData, "asks", 2_000),
        highlights: fieldValue(formData, "highlights", 2_000),
        lowlights: fieldValue(formData, "lowlights", 2_000),
        thanks: fieldValue(formData, "thanks", 1_000),
        sign_off: fieldValue(formData, "sign_off", 120),
      },
      staffOf(context),
    );
  } catch (error) {
    return refusal(error);
  }
  refreshNumbers(period);
  return sent("Saved the draft.");
}

export async function freezeUpdateAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/data/numbers");
  if (refused(context)) return context;
  const period = periodFrom(formData);
  if (!period) return NO_UPDATE;
  try {
    await api.freezeUpdate(period, staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshNumbers(period);
  return sent("Froze the numbers: the email and the list will match.");
}

export async function unfreezeUpdateAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/data/numbers");
  if (refused(context)) return context;
  const period = periodFrom(formData);
  if (!period) return NO_UPDATE;
  try {
    await api.unfreezeUpdate(period, staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshNumbers(period);
  return sent("The numbers are live again: counted each time you open the page.");
}

export async function handOverAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/data/numbers");
  if (refused(context)) return context;
  const period = periodFrom(formData);
  if (!period) return NO_UPDATE;
  const split = (name: string, limit: number) =>
    fieldValue(formData, name, limit)
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
  const stages = split("stages", 400);
  const everyone = split("people", 200_000);
  const ticked = new Set(
    formData
      .getAll("person")
      .map((value) => (typeof value === "string" ? value.trim().toLowerCase() : "")),
  );
  const exclude = everyone.filter((email) => !ticked.has(email.toLowerCase())).slice(0, 500);
  let message = "";
  try {
    const made = await api.handOver(
      period,
      { stages, exclude },
      staffOf(context),
      attemptOf(formData),
    );
    message = `Made the list “${made.list.name}” with ${made.list.people} ${made.list.people === 1 ? "person" : "people"} in Mail merge. Open Mail merge to send it yourself.`;
  } catch (error) {
    return refusal(error);
  }
  refreshNumbers(period);
  refreshData("/mail/merge");
  return sent(message);
}

/** The next 10th: this month's when today is the 10th or earlier, else next month's. */
function nextTenth(today: string): string {
  const [year = 0, month = 1, date = 1] = today.split("-").map(Number);
  const index = year * 12 + (month - 1) + (date <= 10 ? 0 : 1);
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}-10`;
}

export async function addUpdateDateAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/data/numbers");
  if (refused(context)) return context;
  const by = staffOf(context);
  try {
    const { today } = await api.readNumbers();
    const { date } = await addDate(
      {
        title: "Send the monthly investor update",
        kind: "other",
        due_on: nextTenth(today),
        repeats: "monthly",
        entity: "The Indian company",
        handled_by: by.name,
        remind_days: 2,
        notes: "Draft it on Data › Numbers.",
        file_id: "",
      },
      by,
      attemptOf(formData),
    );
    await api.saveNumbersSetup({ update_date_id: date.date_id }, by);
  } catch (error) {
    return refusal(error);
  }
  refreshNumbers();
  refreshData("/data/dates");
  return sent("Added to Key dates: the 10th of every month, with a reminder two days before.");
}
