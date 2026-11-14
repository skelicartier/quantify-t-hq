/**
 * The numbers, counted (raise spec §8.2). Everything here is pure: it is given the
 * replies, the waitlist's firms and moves, the funnel's first-meeting days and the cash
 * entries, and it counts. Every figure is a plain count of records, or a ratio written
 * "1 of 3"; nothing is estimated, and no figure is ever added across currencies.
 *
 * Weeks run Monday to Sunday (`mondayOf`): the six-week view is the five full weeks before
 * this one and this week so far. Months are calendar months: the twelve-month view ends
 * with this month so far.
 */

import { MONEY_STALE_DAYS, type NumbersRow } from "../../../src/lib/data/labels";
import { addDays, daysBetween } from "../days";
import {
  mondayOf,
  type FunnelSummary,
  type RepliesFeed,
  type WaitlistFeed,
} from "../raise-contracts";
import type { Currency, MoneyEntry, Period, RowCounts, UpdateNumbers } from "./types";

/**
 * The outcomes that count as a yes: Interested and Meeting request. (The same values as
 * the replies' `POSITIVE_OUTCOMES`, kept here so this module stands on its own.)
 */
export const YES_OUTCOMES: readonly string[] = ["replied_positive", "meeting_request"];

const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const LONG_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const pad = (value: number) => String(value).padStart(2, "0");

/** "2026-10-05" → "5 Oct". */
export function shortDay(day: string): string {
  const [, month = "1", date = "1"] = day.split("-");
  return `${Number(date)} ${SHORT_MONTHS[Number(month) - 1] ?? ""}`;
}

/** "2026-11-01" → "1 Nov 2026", as the pages print a calendar date. */
export function longDay(day: string): string {
  return `${shortDay(day)} ${day.slice(0, 4)}`;
}

/** "2026-11" → "November 2026". */
export function monthName(month: string): string {
  const [year = "", number = "1"] = month.split("-");
  return `${LONG_MONTHS[Number(number) - 1] ?? ""} ${year}`;
}

/** "2026-11" → "Nov 2026". */
export function monthShort(month: string): string {
  const [year = "", number = "1"] = month.split("-");
  return `${SHORT_MONTHS[Number(number) - 1] ?? ""} ${year}`;
}

/** A month moved by whole months: ("2026-01", -2) → "2025-11". */
export function addMonths(month: string, count: number): string {
  const [year = 0, number = 1] = month.split("-").map(Number);
  const index = year * 12 + (number - 1) + count;
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`;
}

/** The last calendar day of a month. */
export function lastDayOf(month: string): string {
  return addDays(`${addMonths(month, 1)}-01`, -1);
}

/** The six weeks: five full weeks before this one, then this week to today. */
export function weeksOf(today: string): Period[] {
  const monday = mondayOf(today);
  const weeks: Period[] = [];
  for (let back = 5; back >= 0; back -= 1) {
    const from = addDays(monday, -7 * back);
    const partial = back === 0;
    weeks.push({
      key: from,
      label: partial ? `This week (to ${shortDay(today)})` : `Week of ${shortDay(from)}`,
      from,
      to: partial ? today : addDays(from, 6),
      partial,
    });
  }
  return weeks;
}

/** The twelve months ending with this month, which is counted to today. */
export function monthsOf(today: string): Period[] {
  const now = today.slice(0, 7);
  const months: Period[] = [];
  for (let back = 11; back >= 0; back -= 1) months.push(monthPeriod(addMonths(now, -back), today));
  return months;
}

/** One calendar month as a period: whole when it is over, to today when it is this one. */
export function monthPeriod(month: string, today: string): Period {
  const partial = month === today.slice(0, 7);
  return {
    key: month,
    label: partial ? `${monthShort(month)} (to ${shortDay(today)})` : monthShort(month),
    from: `${month}-01`,
    to: partial ? today : lastDayOf(month),
    partial,
  };
}

export type NumbersInput = {
  today: string;
  /** This Mac's day of an instant (`core.day`). */
  dayOf: (at: string) => string;
  replies: readonly ReturnType<RepliesFeed["all"]>[number][];
  /** Whether an address belongs to an investor firm (`investors.owns`); never a yes from a buyer. */
  isInvestor: (email: string) => boolean;
  entries: readonly ReturnType<WaitlistFeed["entries"]>[number][];
  moves: readonly ReturnType<WaitlistFeed["moves"]>[number][];
  buyerTypes: readonly string[];
  /** The funnel's first-meeting days; null when the investor list is not set up here. */
  firstMeetingDays: readonly string[] | null;
};

/** Each row's records, as the days they fall on. */
function daysByRow(input: NumbersInput): Partial<Record<NumbersRow, string[]>> {
  const types = new Set(
    input.buyerTypes.map((type) => type.trim().toLowerCase()).filter((type) => type !== ""),
  );
  const movedTo = (stage: string) =>
    input.moves.filter((move) => move.to === stage).map((move) => input.dayOf(move.at));
  const days: Partial<Record<NumbersRow, string[]>> = {
    yeses: input.replies
      .filter(
        (reply) =>
          !reply.taken_back &&
          YES_OUTCOMES.includes(reply.outcome) &&
          !input.isInvestor(reply.email),
      )
      .map((reply) => input.dayOf(reply.received_at)),
    firms_joined: input.entries.map((entry) => entry.joined_on),
    named_buyers: input.entries
      .filter((entry) => isNamedBuyer(entry, types))
      .map((entry) => entry.joined_on),
    calls_booked: movedTo("call_booked"),
    calls_held: movedTo("call_held"),
    pilots_started: movedTo("pilot"),
  };
  if (input.firstMeetingDays) days.first_investor_meetings = [...input.firstMeetingDays];
  return days;
}

/** A named buyer firm: its own domain (not free mail), and one of the types he chose. */
export function isNamedBuyer(
  entry: { free_mail: boolean; firm_type: string },
  types: ReadonlySet<string>,
): boolean {
  return !entry.free_mail && types.has(entry.firm_type.trim().toLowerCase());
}

const countIn = (days: readonly string[], period: Period) =>
  days.filter((day) => day >= period.from && day <= period.to).length;

function countsFor(
  byRow: Partial<Record<NumbersRow, string[]>>,
  periods: readonly Period[],
): RowCounts {
  const counts: RowCounts = {};
  for (const [row, days] of Object.entries(byRow) as [NumbersRow, string[]][])
    counts[row] = periods.map((period) => countIn(days, period));
  return counts;
}

export type NumbersCount = {
  weeks: Period[];
  months: Period[];
  weekly: RowCounts;
  monthly: RowCounts;
  /** What the named-buyer row is out of: the firms that joined in the same period. */
  named_of: { weekly: number[]; monthly: number[] };
  /** Now, not per period: at Pilot or Customer; at Call held. */
  pilots: { signed: number; calls_held_no_pilot: number };
};

export function numbersOf(input: NumbersInput): NumbersCount {
  const byRow = daysByRow(input);
  const weeks = weeksOf(input.today);
  const months = monthsOf(input.today);
  const weekly = countsFor(byRow, weeks);
  const monthly = countsFor(byRow, months);
  return {
    weeks,
    months,
    weekly,
    monthly,
    named_of: {
      weekly: [...(weekly.firms_joined ?? [])],
      monthly: [...(monthly.firms_joined ?? [])],
    },
    pilots: pilotsOf(input.entries),
  };
}

export function pilotsOf(entries: NumbersInput["entries"]): NumbersCount["pilots"] {
  return {
    signed: entries.filter((entry) => entry.stage === "pilot" || entry.stage === "customer").length,
    calls_held_no_pilot: entries.filter((entry) => entry.stage === "call_held").length,
  };
}

// ------------------------------------------------------------------ cash, burn and runway

/** A typed amount as cents, exactly (amounts carry at most two decimals). */
const centsOf = (value: number) => BigInt(Math.round(value * 100));

/**
 * Cash ÷ monthly burn, in months, rounded down to one decimal (never up): 1,000,000 ÷
 * 150,000 is 6.6. Worked in whole cents, so no rounding of a float can push it up.
 */
export function runwayOf(cash: number, burn: number): number | null {
  if (!(burn > 0) || !(cash >= 0)) return null;
  const tenths = (centsOf(cash) * 10n) / centsOf(burn);
  return Number(tenths) / 10;
}

/** "8.0", "6.6": the runway as it is written. */
export const runwayWords = (months: number) => (Math.round(months * 10) / 10).toFixed(1);

export type MoneyRow = {
  currency: Currency;
  entry: MoneyEntry;
  /** Whole days from its "true on" day to today. */
  age_days: number;
  /** Not used when more than 35 days old. */
  used: boolean;
  /** Null when it is not used. */
  runway_months: number | null;
};

/**
 * The entry used per currency: the newest by its day, then by when it was typed. One row
 * per currency, never a figure across currencies; sorted by the currency's code.
 */
export function moneyRows(entries: readonly MoneyEntry[], today: string): MoneyRow[] {
  const newest = new Map<Currency, MoneyEntry>();
  for (const entry of entries) {
    const known = newest.get(entry.currency);
    if (
      !known ||
      entry.as_of > known.as_of ||
      (entry.as_of === known.as_of && entry.recorded_at > known.recorded_at)
    )
      newest.set(entry.currency, entry);
  }
  return [...newest.values()]
    .sort((a, b) => a.currency.localeCompare(b.currency))
    .map((entry) => {
      const age = daysBetween(entry.as_of, today);
      const used = age <= MONEY_STALE_DAYS;
      return {
        currency: entry.currency,
        entry,
        age_days: age,
        used,
        runway_months: used ? runwayOf(entry.cash, entry.burn_per_month) : null,
      };
    });
}

// ------------------------------------------------------------------ one month's update

/** The figures one month's update carries: the month's counts, the readouts now, the raise, the cash. */
export function updateNumbersOf(
  input: NumbersInput,
  period: string,
  funnel: FunnelSummary | null,
  money: readonly MoneyEntry[],
): UpdateNumbers {
  const month = monthPeriod(period, input.today);
  const byRow = daysByRow(input);
  const count = (row: NumbersRow) => countIn(byRow[row] ?? [], month);
  const now = (stage: string) => funnel?.stages.find((item) => item.stage === stage)?.now ?? 0;
  const moneyIn: Record<string, number> = {};
  if (funnel)
    for (const [currency, states] of Object.entries(funnel.money).sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      const amount = states.money_in?.amount ?? 0;
      if (amount > 0) moneyIn[currency] = amount;
    }
  const pilots = pilotsOf(input.entries);
  return {
    period,
    label: monthName(period),
    yeses: count("yeses"),
    firms_joined: count("firms_joined"),
    named_buyers: count("named_buyers"),
    calls_booked: count("calls_booked"),
    calls_held: count("calls_held"),
    pilots_signed: pilots.signed,
    calls_held_no_pilot: pilots.calls_held_no_pilot,
    raise: funnel
      ? {
          soft: now("soft"),
          signed: now("signed"),
          money_in: now("money_in"),
          money_in_amounts: moneyIn,
        }
      : null,
    cash: moneyRows(money, input.today)
      .filter((row) => row.used && row.runway_months !== null)
      .map((row) => ({
        currency: row.currency,
        cash: row.entry.cash,
        burn_per_month: row.entry.burn_per_month,
        as_of: row.entry.as_of,
        runway_months: row.runway_months!,
      })),
    counted_on: input.today,
  };
}
