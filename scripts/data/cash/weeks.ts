/**
 * The next 13 weeks (ws-notes/duties/spec.md §5.3, §7.6). Weeks run Monday to Sunday; week 1
 * is the week of today; week 0, "Since the statements", holds dated items after the opening
 * day and before week 1. Rows are sums per week of dated items: the open bills (on their
 * pay-by day, or 30 days after the invoice when they have none; an overdue one lands in week
 * 1, the week that holds today), the stipends owed (Owner only), the money he expects (a
 * not-sure line counted at its share), and other money out he types. Closing is the opening
 * plus what comes in less what goes out, carried week to week; nothing when there is no
 * opening figure. One table per currency, never added across currencies. Pure.
 */

import { addDays } from "../days";
import type { BillView, PayOwed } from "../duties-contracts";
import { shareOf } from "../../../src/lib/data/labels-duties";
import { periodWords } from "../../../src/lib/data/labels-people";
import { CASH_DEFAULTS } from "./limits";
import type { CashItem, CashLine, CashRowKey, CashTable, WeekView } from "./types";

const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const weekdayOf = (day: string): number => {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date)).getUTCDay();
};

/** The Monday of a day's week. */
export function mondayOf(day: string): string {
  return addDays(day, -((weekdayOf(day) + 6) % 7));
}

const dayMonth = (day: string): string =>
  `${Number(day.slice(8, 10))} ${SHORT[Number(day.slice(5, 7)) - 1] ?? ""}`;

/** "9–15 Nov", "30 Nov – 6 Dec". */
export function weekLabel(from: string, to: string): string {
  if (from.slice(0, 7) === to.slice(0, 7))
    return `${Number(from.slice(8, 10))}–${Number(to.slice(8, 10))} ${SHORT[Number(to.slice(5, 7)) - 1] ?? ""}`;
  return `${dayMonth(from)} – ${dayMonth(to)}`;
}

/** Week 0 (since the opening day, up to week 1) and weeks 1 to 13. */
export function weeksOf(today: string, openingOn: string | null): WeekView[] {
  const monday = mondayOf(today);
  const weeks: WeekView[] = [
    {
      n: 0,
      from: openingOn ? addDays(openingOn, 1) : monday,
      to: addDays(monday, -1),
      label: openingOn ? `Since ${dayMonth(openingOn)}` : "Before this week",
    },
  ];
  for (let n = 1; n <= CASH_DEFAULTS.weeks; n += 1) {
    const from = addDays(monday, (n - 1) * 7);
    const to = addDays(from, 6);
    weeks.push({ n, from, to, label: weekLabel(from, to) });
  }
  return weeks;
}

/** The week a day falls in, or null when it is outside the view (before the opening, after week 13). */
function weekOf(weeks: readonly WeekView[], day: string): number | null {
  for (const week of weeks) if (day >= week.from && day <= week.to) return week.n;
  return null;
}

export type WeekInput = {
  today: string;
  currency: string;
  opening: CashTable["opening"];
  /** Open bills in this currency. */
  bills: readonly BillView[];
  /** Stipends owed in this currency; null when people figures are left out of this answer. */
  owed: readonly PayOwed[] | null;
  /** His lines in this currency, withdrawn ones included (they are left out here). */
  lines: readonly CashLine[];
};

/** One currency's table. */
export function weekTable(input: WeekInput): CashTable {
  const { today } = input;
  const weeks = weeksOf(today, input.opening?.as_of ?? null);
  const last = weeks[weeks.length - 1]!.to;
  const items: (CashItem & { row: CashRowKey })[] = [];
  /** Money still owed whose day has passed lands in the week that holds today. */
  const owedOn = (day: string): string => (day < today ? today : day);

  for (const bill of input.bills) {
    if (bill.cancelled || bill.open_minor <= 0) continue;
    const on = owedOn(bill.pay_by ?? addDays(bill.invoice_on, 30));
    const week = weekOf(weeks, on);
    if (week === null) continue;
    items.push({
      row: "bills",
      key: `bill:${bill.bill_id}`,
      week,
      on,
      name: `${bill.vendor_name} ${bill.invoice_number}`.trim(),
      minor: bill.open_minor,
      counted_minor: bill.open_minor,
      href: bill.href,
    });
  }
  for (const owed of input.owed ?? []) {
    const on = owedOn(owed.due_on);
    const week = weekOf(weeks, on);
    if (week === null || on > last) continue;
    items.push({
      row: "stipends",
      key: `stipend:${owed.person_id}:${owed.period}`,
      week,
      on,
      name: `${owed.name}'s stipend for ${periodWords(owed.period)}`,
      minor: owed.amount_minor,
      counted_minor: owed.amount_minor,
      href: `/data/people/${owed.person_id}`,
    });
  }
  for (const line of input.lines) {
    if (line.withdrawn) continue;
    const week = weekOf(weeks, line.on);
    if (week === null) continue;
    const counted =
      line.kind === "expected_in" && !line.sure
        ? shareOf(line.amount_minor, line.counted_at)
        : line.amount_minor;
    items.push({
      row: line.kind,
      key: `${line.kind === "expected_in" ? "in" : "out"}:${line.line_id}`,
      week,
      on: line.on,
      name: line.name,
      minor: line.amount_minor,
      counted_minor: counted,
      href: null,
    });
  }

  const keys: CashRowKey[] = [
    "bills",
    ...(input.owed ? (["stipends"] as const) : []),
    "other_out",
    "expected_in",
  ];
  const rows = keys.map((key) => {
    const by_week = weeks.map(() => 0);
    for (const item of items) if (item.row === key) by_week[item.week]! += item.counted_minor;
    return { key, by_week };
  });
  const closing: number[] = [];
  if (input.opening) {
    let cash = input.opening.minor;
    for (const week of weeks) {
      for (const row of rows)
        cash += (row.key === "expected_in" ? 1 : -1) * (row.by_week[week.n] ?? 0);
      closing.push(cash);
    }
  }
  return {
    currency: input.currency,
    opening: input.opening,
    rows,
    closing,
    items: items
      .sort((a, b) => a.on.localeCompare(b.on) || a.name.localeCompare(b.name))
      .map(({ row, ...item }) => {
        void row;
        return item;
      }),
  };
}
