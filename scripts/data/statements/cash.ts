/**
 * Cash, burn and runway from the statements (ws-notes/duties/spec.md §5.5), per currency and
 * never across currencies. Pure: given the accounts, their live statements and lines and
 * Money's categories, it works everything out in whole minor units, with BigInt where a
 * product may pass 2^53 (cash × 365, cash × 10).
 *
 * - An account is covered from its first statement's first day to the latest day reached
 *   without a gap; a gap is a check line, never a guess.
 * - Cash in a currency is the sum of each open bank account's closing balance on `as_of`,
 *   the earliest of those accounts' covered days. A card counts in neither cash nor burn.
 * - A whole month ends on or before `as_of` and every open bank account of the currency
 *   covers it from its first day to its last. Gross burn is money out whose category is not
 *   a transfer between own accounts; collected is money in of an income category; net burn
 *   is gross less collected. Unsorted money out counts as burn; unsorted money in nowhere.
 * - The average net burn is over the last one to three whole months, rounded up to a paisa.
 *   Runway is `floor(cash × 10 / average) / 10`; the cash-out day is `as_of` plus
 *   `floor(cash × 365 / (average × 12))` days.
 */

import { addDays } from "../days";
import {
  periodEnd,
  periodOf,
  addPeriods,
  type CashNow,
  type CategoryView,
} from "../duties-contracts";
import { movementOf } from "./lines";
import type { Account, Line, Statement } from "./types";

export type AccountHistory = {
  account: Account;
  /** Live statements, oldest first. */
  statements: Statement[];
  /** Live lines, oldest first. */
  lines: Line[];
  first_day: string | null;
  covered_to: string | null;
  /** Days nothing covers, after the first statement: check lines. */
  gaps: { from: string; to: string }[];
};

export function historyOf(
  account: Account,
  statements: readonly Statement[],
  lines: readonly Line[],
): AccountHistory {
  const live = statements
    .filter((statement) => statement.account_id === account.account_id && !statement.withdrawn)
    .sort((a, b) => a.from.localeCompare(b.from) || a.imported_at.localeCompare(b.imported_at));
  const order = new Map(live.map((statement, index) => [statement.statement_id, index]));
  const kept = lines
    .filter((line) => line.account_id === account.account_id && !line.withdrawn)
    .filter((line) => order.has(line.statement_id))
    .sort(
      (a, b) =>
        a.posted_on.localeCompare(b.posted_on) ||
        (order.get(a.statement_id) ?? 0) - (order.get(b.statement_id) ?? 0) ||
        a.n - b.n,
    );
  let coveredTo: string | null = null;
  let reach: string | null = null;
  let stopped = false;
  const gaps: { from: string; to: string }[] = [];
  for (const statement of live) {
    if (reach === null) {
      reach = statement.to;
      coveredTo = statement.to;
      continue;
    }
    const next = addDays(reach, 1);
    if (statement.from > next) {
      gaps.push({ from: next, to: addDays(statement.from, -1) });
      stopped = true;
    }
    if (statement.to > reach) reach = statement.to;
    if (!stopped) coveredTo = reach;
  }
  return {
    account,
    statements: live,
    lines: kept,
    first_day: live[0]?.from ?? null,
    covered_to: coveredTo,
    gaps,
  };
}

/**
 * The balance at the start of `day` (or at its end, `inclusive`): the opening of the live
 * statement that covers the day and starts latest, plus every line of the account from its
 * first day up to the day. Null when no statement covers the day.
 */
export function balanceAt(history: AccountHistory, day: string, inclusive: boolean): number | null {
  let chosen: Statement | null = null;
  for (const statement of history.statements)
    if (statement.from <= day && statement.to >= day && statement.opening_minor !== null)
      if (!chosen || statement.from >= chosen.from) chosen = statement;
  if (!chosen || chosen.opening_minor === null) return null;
  let balance = chosen.opening_minor;
  for (const line of history.lines) {
    if (line.posted_on < chosen.from) continue;
    if (inclusive ? line.posted_on > day : line.posted_on >= day) break;
    balance += movementOf(line);
  }
  return balance;
}

/** Whether an account covers a whole calendar month. */
export const coversMonth = (history: AccountHistory, period: string) =>
  history.first_day !== null &&
  history.covered_to !== null &&
  history.first_day <= `${period}-01` &&
  history.covered_to >= periodEnd(period);

export type MonthBurn = {
  period: string;
  gross_minor: number;
  collected_minor: number;
  net_minor: number;
};

export type CashDetail = CashNow & {
  runway_months: number | null;
  zero_on: string | null;
  /** The whole months the average is over, oldest first. */
  whole: MonthBurn[];
  /** The open bank accounts counted. */
  account_ids: string[];
};

/** `ceil(a / b)` in whole numbers, for b above 0. */
export function ceilDiv(a: number, b: number): number {
  const quotient = Math.floor(a / b);
  return quotient * b === a ? quotient : quotient + 1;
}

/** Runway in months to one decimal, rounded down, and the cash-out day; nulls when it cannot be counted. */
export function runwayOf(
  cashMinor: number,
  avgMinor: number | null,
  asOf: string,
): { runway_months: number | null; zero_on: string | null } {
  if (avgMinor === null || avgMinor <= 0) return { runway_months: null, zero_on: null };
  if (cashMinor <= 0) return { runway_months: 0, zero_on: asOf };
  const cash = BigInt(cashMinor);
  const avg = BigInt(avgMinor);
  const tenths = (cash * 10n) / avg;
  const days = (cash * 365n) / (avg * 12n);
  return { runway_months: Number(tenths) / 10, zero_on: addDays(asOf, Number(days)) };
}

/** A month's money out and in, by Money's categories, over the given accounts' lines. */
export function burnOf(
  histories: readonly AccountHistory[],
  period: string,
  kinds: ReadonlyMap<string, CategoryView["kind"]>,
): MonthBurn {
  let gross = 0;
  let collected = 0;
  for (const history of histories)
    for (const line of history.lines) {
      if (periodOf(line.posted_on) !== period) continue;
      const kind = line.category_id ? (kinds.get(line.category_id) ?? null) : null;
      if (line.direction === "debit") {
        if (kind !== "transfer") gross += line.amount_minor;
      } else if (kind === "income") collected += line.amount_minor;
    }
  return { period, gross_minor: gross, collected_minor: collected, net_minor: gross - collected };
}

/**
 * Cash and burn per currency, one entry for each currency with an open bank account that has
 * a statement, sorted by code. `upTo` caps the day counted to (the MIS asks for a month's last
 * day); without it, as far as the statements reach.
 */
export function cashOf(
  histories: readonly AccountHistory[],
  categories: readonly CategoryView[],
  upTo?: string,
): CashDetail[] {
  const kinds = new Map(categories.map((category) => [category.category_id, category.kind]));
  const byCurrency = new Map<string, AccountHistory[]>();
  for (const history of histories) {
    const { account } = history;
    if (account.kind !== "bank" || account.closed_on !== null) continue;
    if (history.covered_to === null || history.first_day === null) continue;
    if (upTo !== undefined && history.first_day > upTo) continue;
    byCurrency.set(account.currency, [...(byCurrency.get(account.currency) ?? []), history]);
  }
  const out: CashDetail[] = [];
  for (const [currency, group] of [...byCurrency].sort(([a], [b]) => a.localeCompare(b))) {
    let asOf = group.reduce(
      (earliest, history) => (history.covered_to! < earliest ? history.covered_to! : earliest),
      group[0]!.covered_to!,
    );
    if (upTo !== undefined && upTo < asOf) asOf = upTo;
    const cash = group.reduce((sum, history) => sum + (balanceAt(history, asOf, true) ?? 0), 0);
    const latestStart = group.reduce(
      (latest, history) => (history.first_day! > latest ? history.first_day! : latest),
      group[0]!.first_day!,
    );
    const whole: MonthBurn[] = [];
    for (
      let period = periodOf(latestStart);
      period <= periodOf(asOf) && whole.length < 1_200;
      period = addPeriods(period, 1)
    ) {
      if (periodEnd(period) > asOf) break;
      if (group.every((history) => coversMonth(history, period)))
        whole.push(burnOf(group, period, kinds));
    }
    const last = whole.slice(-3);
    const avg = last.length
      ? ceilDiv(
          last.reduce((sum, month) => sum + month.net_minor, 0),
          last.length,
        )
      : null;
    const latest = last.at(-1) ?? null;
    const uncategorised = group.reduce(
      (count, history) =>
        count +
        history.lines.filter((line) => line.posted_on <= asOf && line.category_id === null).length,
      0,
    );
    out.push({
      currency,
      as_of: asOf,
      cash_minor: cash,
      gross_burn_minor: latest ? latest.gross_minor : null,
      avg_net_burn_minor: avg,
      months: last.length,
      collected_minor: latest ? latest.collected_minor : null,
      uncategorised,
      ...runwayOf(cash, avg, asOf),
      whole: last,
      account_ids: group.map((history) => history.account.account_id),
    });
  }
  return out;
}

/** What the contract's feed gives: totals only, no line, name or account number. */
export const cashNowOf = (detail: CashDetail): CashNow => ({
  currency: detail.currency,
  as_of: detail.as_of,
  cash_minor: detail.cash_minor,
  gross_burn_minor: detail.gross_burn_minor,
  avg_net_burn_minor: detail.avg_net_burn_minor,
  months: detail.months,
  collected_minor: detail.collected_minor,
  uncategorised: detail.uncategorised,
});

/** One account's month: opening, money in, money out, closing; null figures where not covered. */
export function monthOf(history: AccountHistory, period: string) {
  const first = `${period}-01`;
  const lines = history.lines.filter((line) => periodOf(line.posted_on) === period);
  const inMinor = lines
    .filter((line) => line.direction === "credit")
    .reduce((sum, line) => sum + line.amount_minor, 0);
  const outMinor = lines
    .filter((line) => line.direction === "debit")
    .reduce((sum, line) => sum + line.amount_minor, 0);
  const opening = balanceAt(history, first, false);
  // A month covered only in part closes on the last day a statement reaches in it.
  const last = history.statements.reduce<string | null>((latest, statement) => {
    if (statement.from > periodEnd(period) || statement.to < first) return latest;
    const end = statement.to < periodEnd(period) ? statement.to : periodEnd(period);
    return latest === null || end > latest ? end : latest;
  }, null);
  const closing = last === null ? null : balanceAt(history, last, true);
  return { opening_minor: opening, in_minor: inMinor, out_minor: outMinor, closing_minor: closing };
}
