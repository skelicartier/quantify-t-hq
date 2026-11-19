/**
 * The MIS in eight parts (ws-notes/duties/spec.md §9.8), built from the month's statement
 * lines, Money's categories, the Numbers page's counts, Due and, for the Owner's file only,
 * the people ledger. Pure: given what was read, it works the figures out in whole minor
 * units, per currency, never across currencies. People heads are folded into one line with
 * no figure; their figures go to the Owner's part alone.
 *
 * Two identities hold by construction and are tested: per currency, `closing = opening +
 * in.customers + in.funding + in.other − out + between`, with `between` zero when both sides
 * of a transfer are here; and `total = heads + people heads + unsorted = gross`.
 */

import { againstWords, PEOPLE_HEAD } from "../../../src/lib/data/labels-statements";
import { periodWords } from "../../../src/lib/data/labels-duties";
import type { DueItem } from "../core";
import { addDays } from "../days";
import {
  addPeriods,
  periodEnd,
  periodOf,
  type CategoryView,
  type ExportView,
  type PeoplePay,
} from "../duties-contracts";
import type { UpdateNumbers } from "../numbers/types";
import { balanceAt, burnOf, cashOf, type AccountHistory } from "../statements/cash";
import type { MisOwnerPart, MisSnapshot } from "./types";

export type MisInputs = {
  period: string;
  /** The freeze day, or today for a live MIS. */
  today: string;
  histories: readonly AccountHistory[];
  categories: readonly CategoryView[];
  exports: readonly ExportView[] | null;
  numbers: UpdateNumbers | null;
  due: readonly DueItem[];
  rulesUnconfirmed: number | null;
  people: PeoplePay | null;
  commentary: string;
};

type Expenses = MisSnapshot["expenses"][number];

/** A month's money out by head over the given accounts, people heads kept apart. */
function expensesOf(
  histories: readonly AccountHistory[],
  period: string,
  categories: ReadonlyMap<string, CategoryView>,
  currency: string,
): { expenses: Expenses; people: { name: string; minor: number }[] } {
  const heads = new Map<string, { ledger: string; minor: number }>();
  const people = new Map<string, number>();
  let unsorted = 0;
  let total = 0;
  for (const history of histories)
    for (const line of history.lines) {
      if (line.direction !== "debit" || periodOf(line.posted_on) !== period) continue;
      const category = line.category_id ? categories.get(line.category_id) : undefined;
      if (category?.kind === "transfer") continue;
      total += line.amount_minor;
      if (!category) unsorted += line.amount_minor;
      else if (category.people)
        people.set(category.name, (people.get(category.name) ?? 0) + line.amount_minor);
      else {
        const head = heads.get(category.name) ?? { ledger: category.ledger, minor: 0 };
        head.minor += line.amount_minor;
        heads.set(category.name, head);
      }
    }
  const named = [...heads]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, head]) => ({
      name,
      ledger: head.ledger,
      minor: head.minor as number | null,
      people: false,
    }));
  if (people.size > 0) named.push({ name: PEOPLE_HEAD, ledger: "", minor: null, people: true });
  return {
    expenses: { currency, heads: named, unsorted_minor: unsorted, total_minor: total },
    people: [...people]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, minor]) => ({ name, minor })),
  };
}

export function misOf(input: MisInputs): { snapshot: MisSnapshot; owner: MisOwnerPart } {
  const { period } = input;
  const first = `${period}-01`;
  const end = periodEnd(period);
  const named = new Map(input.categories.map((category) => [category.category_id, category]));
  const kinds = new Map(input.categories.map((category) => [category.category_id, category.kind]));
  const details = cashOf(input.histories, input.categories, end);
  const groupOf = (ids: readonly string[]) =>
    input.histories.filter((history) => ids.includes(history.account.account_id));

  const lastPeriod = addPeriods(period, -1);
  const lastDetails = cashOf(input.histories, input.categories, periodEnd(lastPeriod));

  const collected: Record<string, number> = {};
  const expenses: MisSnapshot["expenses"] = [];
  const burn: MisSnapshot["burn"] = [];
  const cashFlow: MisSnapshot["cash_flow"] = [];
  const against: MisSnapshot["against_last"] = [];
  const peopleHeads: MisOwnerPart["people_heads"] = [];

  for (const detail of details) {
    const { currency } = detail;
    const group = groupOf(detail.account_ids);
    const month = burnOf(group, period, kinds);
    collected[currency] = month.collected_minor;
    const spent = expensesOf(group, period, named, currency);
    expenses.push(spent.expenses);
    for (const head of spent.people) peopleHeads.push({ currency, ...head });
    burn.push({
      currency,
      as_of: detail.as_of,
      cash_minor: detail.cash_minor,
      gross_minor: month.gross_minor,
      collected_minor: month.collected_minor,
      net_minor: month.net_minor,
      avg_net_minor: detail.avg_net_burn_minor,
      months: detail.months,
      runway_months: detail.runway_months,
      zero_on: detail.zero_on,
    });
    let opening = 0;
    let customers = 0;
    let funding = 0;
    let other = 0;
    let out = 0;
    let between = 0;
    for (const history of group) {
      opening += balanceAt(history, first, false) ?? 0;
      for (const line of history.lines) {
        if (periodOf(line.posted_on) !== period) continue;
        const kind = line.category_id ? (kinds.get(line.category_id) ?? null) : null;
        if (kind === "transfer")
          between += line.direction === "credit" ? line.amount_minor : -line.amount_minor;
        else if (line.direction === "debit") out += line.amount_minor;
        else if (kind === "income") customers += line.amount_minor;
        else if (kind === "funding") funding += line.amount_minor;
        else other += line.amount_minor;
      }
    }
    cashFlow.push({
      currency,
      opening_minor: opening,
      in: { customers, funding, other },
      out_minor: out,
      between_minor: between,
      closing_minor: opening + customers + funding + other - out + between,
    });
    const last = lastDetails.find((item) => item.currency === currency);
    const lastHeads = last
      ? new Map(
          expensesOf(groupOf(last.account_ids), lastPeriod, named, currency)
            .expenses.heads.filter((head) => !head.people)
            .map((head) => [head.name, head.minor ?? 0]),
        )
      : null;
    const hasLast = lastHeads !== null && lastHeads.size > 0;
    const heads = spent.expenses.heads
      .filter((head) => !head.people)
      .map((head) => {
        const before = hasLast ? lastHeads.get(head.name) : undefined;
        const change = before === undefined ? null : (head.minor ?? 0) - before;
        return {
          name: head.name,
          change_minor: change,
          words: againstWords(change, currency, lastPeriod),
        };
      });
    if (hasLast)
      for (const [name, minor] of lastHeads)
        if (!spent.expenses.heads.some((head) => head.name === name))
          heads.push({
            name,
            change_minor: -minor,
            words: againstWords(-minor, currency, lastPeriod),
          });
    against.push({ currency, heads });
  }

  const exportsOfMonth = (input.exports ?? []).filter(
    (invoice) => periodOf(invoice.invoice_on) === period,
  );
  const byCurrency: Record<string, number> = {};
  for (const invoice of exportsOfMonth)
    byCurrency[invoice.currency] = (byCurrency[invoice.currency] ?? 0) + invoice.amount_minor;

  const soon = addDays(input.today, 30);
  const tally = (items: readonly DueItem[]) => {
    const counts = new Map<string, number>();
    for (const item of items) counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1);
    return [...counts]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([kind, count]) => ({ kind, count }));
  };

  const paid = input.people?.paid(first, end) ?? [];
  const stipends: Record<string, number> = {};
  for (const pay of paid) stipends[pay.currency] = (stipends[pay.currency] ?? 0) + pay.amount_minor;

  return {
    snapshot: {
      period,
      label: periodWords(period),
      n: 0,
      frozen_at: null,
      frozen_by: null,
      revenue: {
        collected,
        export_invoices: { count: exportsOfMonth.length, by_currency: byCurrency },
      },
      expenses,
      burn,
      cash_flow: cashFlow,
      numbers: input.numbers
        ? {
            yeses: input.numbers.yeses,
            firms_joined: input.numbers.firms_joined,
            named_buyers: input.numbers.named_buyers,
            calls_booked: input.numbers.calls_booked,
            calls_held: input.numbers.calls_held,
            pilots_signed: input.numbers.pilots_signed,
          }
        : null,
      against_last: against,
      people: { headcount: input.people ? input.people.headcount(end) : null },
      compliance: {
        overdue: tally(input.due.filter((item) => item.due_on < input.today)),
        due_in_30: tally(
          input.due.filter((item) => item.due_on >= input.today && item.due_on <= soon),
        ),
        rules_unconfirmed: input.rulesUnconfirmed,
      },
      commentary: input.commentary,
    },
    owner: { stipends, payments: paid.length, people_heads: peopleHeads },
  };
}
