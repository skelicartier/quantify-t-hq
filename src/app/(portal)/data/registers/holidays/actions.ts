"use server";

import { fieldValue } from "@/lib/auth/forms";
import * as api from "@/lib/data/api/holidays";
import { gate, refreshData, refusal, refused, sent, staffOf } from "@/lib/data/gate";
import type { ActionState } from "@/lib/forms/action-state";

/**
 * Holidays' writes (duties spec §7.4): one holiday, the three national days of a year, a
 * pasted list, a change, a removal, and the working week. Owners and Admins, as every Data
 * page; the service checks every field again.
 */

const PATH = "/data/registers/holidays";
const ROUTE_ID = /^[A-Za-z0-9-]{1,64}$/;
const NO_HOLIDAY: ActionState = { status: "error", message: "That holiday is not here." };

const attemptOf = (formData: FormData): string =>
  fieldValue(formData, "attempt", 64) || crypto.randomUUID();

const holidayIdFrom = (formData: FormData): string => {
  const value = fieldValue(formData, "holiday_id", 64);
  return ROUTE_ID.test(value) ? value : "";
};

function refresh(): void {
  refreshData(PATH, "/data/calendar");
}

export async function addHolidayAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, PATH);
  if (refused(context)) return context;
  let name = "";
  try {
    name = (
      await api.addHoliday(
        {
          on: fieldValue(formData, "on", 10),
          name: fieldValue(formData, "name", 120),
          kind: fieldValue(formData, "kind", 12),
          note: fieldValue(formData, "note", 500),
        },
        staffOf(context),
        attemptOf(formData),
      )
    ).holiday.name;
  } catch (error) {
    return refusal(error);
  }
  refresh();
  return sent(`Added ${name}.`);
}

export async function addNationalAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, PATH);
  if (refused(context)) return context;
  const year = Number(fieldValue(formData, "year", 4));
  let added = 0;
  try {
    added = (await api.addNationalHolidays(year, staffOf(context))).added;
  } catch (error) {
    return refusal(error);
  }
  refresh();
  return sent(
    added === 0
      ? "All three were already there."
      : `Added ${added} national ${added === 1 ? "holiday" : "holidays"}.`,
  );
}

export async function pasteHolidaysAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, PATH);
  if (refused(context)) return context;
  let added = 0;
  try {
    added = (
      await api.pasteHolidays(
        fieldValue(formData, "text", 12_000),
        staffOf(context),
        attemptOf(formData),
      )
    ).added;
  } catch (error) {
    return refusal(error);
  }
  refresh();
  return sent(`Added ${added} ${added === 1 ? "holiday" : "holidays"}.`);
}

export async function updateHolidayAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, PATH);
  if (refused(context)) return context;
  const holidayId = holidayIdFrom(formData);
  if (!holidayId) return NO_HOLIDAY;
  try {
    await api.updateHoliday(
      holidayId,
      {
        on: fieldValue(formData, "on", 10),
        name: fieldValue(formData, "name", 120),
        kind: fieldValue(formData, "kind", 12),
        note: fieldValue(formData, "note", 500),
      },
      staffOf(context),
    );
  } catch (error) {
    return refusal(error);
  }
  refresh();
  return sent("Saved.");
}

export async function removeHolidayAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, PATH);
  if (refused(context)) return context;
  const holidayId = holidayIdFrom(formData);
  if (!holidayId) return NO_HOLIDAY;
  try {
    await api.removeHoliday(holidayId, staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refresh();
  return sent("Removed.");
}

export async function saveSetupAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, PATH);
  if (refused(context)) return context;
  const weekOff = formData
    .getAll("week_off")
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6);
  try {
    await api.saveHolidaySetup(
      {
        week_off: weekOff,
        state: fieldValue(formData, "state", 4),
        state_minimum: fieldValue(formData, "state_minimum", 4),
        optional_allowance: fieldValue(formData, "optional_allowance", 4),
      },
      staffOf(context),
    );
  } catch (error) {
    return refusal(error);
  }
  refresh();
  return sent("Saved.");
}
