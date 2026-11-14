/**
 * The people ledger's arithmetic (ws-notes/company/spec.md §5.5), on calendar days only: the
 * midpoint and final evaluations, a stipend month's due day, the months a stipend runs, and
 * the offboarding deadlines. HQ never prorates and never works out tax.
 */

import { addDays, daysBetween } from "../days";
import { CRITICAL_DAYS, OTHER_DAYS } from "./limits";
import type { Person, Stipend } from "./types";

const pad = (value: number): string => String(value).padStart(2, "0");

/** The midpoint evaluation: halfway, rounded down. 1 Dec 2026 – 28 Feb 2027 → 2027-01-14. */
export function midpointOf(startsOn: string, endsOn: string | null): string | null {
  if (!endsOn || endsOn < startsOn) return null;
  return addDays(startsOn, Math.floor(daysBetween(startsOn, endsOn) / 2));
}

/** The engagement's end as it now stands: the offboarding's last day once started, else the plan. */
export function endOf(person: Pick<Person, "ends_on" | "offboarding">): string | null {
  return person.offboarding?.last_day ?? person.ends_on;
}

/** The days the two evaluations are worked out to, from the first day and the end. */
export function evaluationDays(person: Pick<Person, "starts_on" | "ends_on" | "offboarding">): {
  midpoint: string | null;
  final: string | null;
} {
  const end = endOf(person);
  return { midpoint: midpointOf(person.starts_on, end), final: end };
}

/** "2027-01" → "2027-02". */
export function nextMonth(period: string): string {
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(5, 7));
  return month === 12 ? `${year + 1}-01` : `${year}-${pad(month + 1)}`;
}

/** The month's last day: "2028-02" → "2028-02-29". */
export function lastDayOf(period: string): string {
  return addDays(`${nextMonth(period)}-01`, -1);
}

/** A month's stipend is due on the dth of the next month, or on the month's own last day. */
export function stipendDueOn(period: string, paysOn: Stipend["pays_on"]): string {
  if (paysOn === "month_end") return lastDayOf(period);
  return `${nextMonth(period)}-${pad(paysOn)}`;
}

/** Every month from one to another, both included; none when they are the wrong way round. */
export function monthsFrom(first: string, last: string): string[] {
  const months: string[] = [];
  for (let month = first; month <= last && months.length < 1_200; month = nextMonth(month))
    months.push(month);
  return months;
}

/**
 * The months a stipend runs: from the first day's month to the end's (or this month, for an
 * open-ended engagement), stopping at the month it ended in.
 */
export function engagementMonths(
  person: Pick<Person, "starts_on" | "ends_on" | "offboarding" | "ended_on">,
  today: string,
): string[] {
  const end = person.ended_on ?? endOf(person) ?? today;
  return monthsFrom(person.starts_on.slice(0, 7), end.slice(0, 7));
}

/** A grant's deadline once offboarding has started: L + 1 for a critical system, L + 5 for the rest. */
export function revokeBy(lastDay: string, critical: boolean): string {
  return addDays(lastDay, critical ? CRITICAL_DAYS : OTHER_DAYS);
}
