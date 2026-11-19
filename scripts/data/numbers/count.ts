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

import { CURRENCIES, MONEY_STALE_DAYS, type NumbersRow } from "../../../src/lib/data/labels";
import { addDays, daysBetween } from "../days";
import { addPeriods, periodEnd, periodOf, type CashNow } from "../duties-contracts";
import { runwayOf as runwayOfMinor } from "../statements/cash";
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

// ------------------------------------------------------------------ cash from the statements (duties spec §9.6)

/** What the statements give for a currency, with its runway and cash-out day worked out. */
export type FeedCash = CashNow & { runway_months: number | null; zero_on: string | null };

export const feedCashOf = (cash: CashNow): FeedCash => ({
  ...cash,
  ...runwayOfMinor(cash.cash_minor, cash.avg_net_burn_minor, cash.as_of),
});

/** The month the statements' last whole month is: the `as_of` month when it ends it, else the one before. */
export function lastWholeMonth(cash: Pick<CashNow, "as_of" | "months">): string | null {
  if (cash.months === 0) return null;
  const month = periodOf(cash.as_of);
  return periodEnd(month) === cash.as_of ? month : addPeriods(month, -1);
}

/** The figure Numbers uses for one currency, in whole units as the raise batch's shapes keep them. */
export type UsedCash = {
  currency: string;
  source: "statements" | "typed";
  cash: number;
  burn_per_month: number | null;
  as_of: string;
  runway_months: number | null;
  zero_on: string | null;
  /** The last whole month's money out, whole units rounded up; null for a typed figure. */
  gross_burn: number | null;
  months: number;
};

/** Whole currency units of a minor amount: cash is floored, a burn is rounded up. */
const floorUnits = (minor: number) => Math.floor(minor / 100);
const ceilUnits = (minor: number) => -Math.floor(-minor / 100);

/**
 * Per currency (sorted by code): a typed entry marked `override` whose day is on or after the
 * statements' day, and not stale; else the statements' figure when its day is at most 35 days
 * old; else a typed entry as before (not stale); else nothing.
 */
export function usedCash(
  today: string,
  typedRows: readonly MoneyRow[],
  feed: readonly CashNow[],
): UsedCash[] {
  const currencies = [
    ...new Set([...typedRows.map((row) => row.currency), ...feed.map((item) => item.currency)]),
  ].sort((a, b) => a.localeCompare(b));
  const used: UsedCash[] = [];
  for (const currency of currencies) {
    const typed = typedRows.find((row) => row.currency === currency) ?? null;
    const given = feed.find((item) => item.currency === currency) ?? null;
    const typedUse = (row: MoneyRow): UsedCash => ({
      currency,
      source: "typed",
      cash: row.entry.cash,
      burn_per_month: row.entry.burn_per_month,
      as_of: row.entry.as_of,
      runway_months: row.runway_months,
      zero_on: null,
      gross_burn: null,
      months: 0,
    });
    if (
      typed &&
      typed.used &&
      typed.entry.override === true &&
      given &&
      typed.entry.as_of >= given.as_of
    ) {
      used.push(typedUse(typed));
      continue;
    }
    if (given && daysBetween(given.as_of, today) <= MONEY_STALE_DAYS) {
      const worked = feedCashOf(given);
      used.push({
        currency,
        source: "statements",
        cash: floorUnits(given.cash_minor),
        burn_per_month:
          given.avg_net_burn_minor === null ? null : ceilUnits(given.avg_net_burn_minor),
        as_of: given.as_of,
        runway_months: worked.runway_months,
        zero_on: worked.zero_on,
        gross_burn: given.gross_burn_minor === null ? null : ceilUnits(given.gross_burn_minor),
        months: given.months,
      });
      continue;
    }
    if (typed && typed.used) used.push(typedUse(typed));
  }
  return used;
}

/** The cash a frozen MIS gives for its month (its part 3), as the update carries it. */
export type MisCash = {
  currency: string;
  as_of: string;
  cash_minor: number;
  gross_minor: number;
  avg_net_minor: number | null;
  months: number;
  runway_months: number | null;
  zero_on: string | null;
};

/** The close module's answer for a month whose MIS is frozen: its part 3; null when it is not frozen. */
export type CloseMis = { frozenCash(period: string): MisCash[] | null };

const isCurrency = (code: string): code is Currency =>
  (CURRENCIES as readonly string[]).includes(code);

/** The update's cash rows from what is used, or from a frozen MIS: whole units, a runway each. */
export function updateCashOf(
  rows: readonly UsedCash[] | null,
  mis: readonly MisCash[] | null,
): UpdateNumbers["cash"] {
  if (mis)
    return mis
      .filter(
        (row) =>
          isCurrency(row.currency) && row.runway_months !== null && row.avg_net_minor !== null,
      )
      .map((row) => ({
        currency: row.currency as Currency,
        cash: floorUnits(row.cash_minor),
        burn_per_month: ceilUnits(row.avg_net_minor!),
        as_of: row.as_of,
        runway_months: row.runway_months!,
        source: "mis" as const,
        gross_burn: ceilUnits(row.gross_minor),
        zero_on: row.zero_on,
        months: row.months,
      }));
  return (rows ?? [])
    .filter(
      (row) =>
        isCurrency(row.currency) && row.runway_months !== null && row.burn_per_month !== null,
    )
    .map((row) => {
      const base = {
        currency: row.currency as Currency,
        cash: row.cash,
        burn_per_month: row.burn_per_month!,
        as_of: row.as_of,
        runway_months: row.runway_months!,
        source: row.source,
      };
      return row.source === "statements"
        ? { ...base, gross_burn: row.gross_burn ?? 0, zero_on: row.zero_on, months: row.months }
        : base;
    });
}

// ------------------------------------------------------------------ one month's update

/** The figures one month's update carries: the month's counts, the readouts now, the raise, the cash. */
export function updateNumbersOf(
  input: NumbersInput,
  period: string,
  funnel: FunnelSummary | null,
  money: readonly MoneyEntry[],
  /**
   * The cash rows to carry instead of the typed entries (duties spec §9.6): what `usedCash`
   * gives once statements are here, or a frozen MIS's. Left out, the update reads as before.
   */
  cash?: UpdateNumbers["cash"],
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
    cash:
      cash ??
      moneyRows(money, input.today)
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
