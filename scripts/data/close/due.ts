/**
 * The close's day and Due (ws-notes/duties/spec.md §5.5, §9.7): `close-by` working days after
 * the month's last day, through `holidays`, which counts Monday to Friday when no holiday is
 * recorded. Pure: given the holidays, the rule's state and the day.
 */

import {
  addPeriods,
  periodEnd,
  periodOf,
  type DutyRuleState,
  type HolidaysService,
} from "../duties-contracts";
import { DUE_MONTHS } from "./limits";

/** The day a month's close is due, or null when the rule book is not here or the rule is not usable. */
export function closeDayOf(
  period: string,
  holidays: HolidaysService,
  rule: DutyRuleState | null,
): string | null {
  if (!rule || !rule.usable || rule.amount === null) return null;
  return holidays.addWorkingDays(periodEnd(period), rule.amount);
}

/** Whether a month is over on a day: its last day is before it. */
export const isOver = (period: string, today: string) => periodEnd(period) < today;

/**
 * The months Due lists: the last three that are over, not locked, and on or after the first
 * month with any statement or bill; newest first.
 */
export function dueMonths(
  today: string,
  firstMonth: string | null,
  isLocked: (period: string) => boolean,
): string[] {
  if (!firstMonth) return [];
  const months: string[] = [];
  for (let back = 1; back <= DUE_MONTHS; back += 1) {
    const period = addPeriods(periodOf(today), -back);
    if (period < firstMonth) break;
    if (!isOver(period, today) || isLocked(period)) continue;
    months.push(period);
  }
  return months;
}
