/**
 * The facts beside each of the close's seven rows (ws-notes/duties/spec.md §9.7), worked out
 * on each read from the statements, Money and the people ledger. The stipend row's figures
 * are given only in the Owner's answer; an Admin reads where they are kept instead.
 */

import { dayWords } from "../../../src/lib/data/labels-company";
import { minorWordsBy } from "../../../src/lib/data/labels-duties";
import {
  MONEY_MISSING,
  PEOPLE_MISSING,
  STIPEND_OWNER_FACT,
  countOf,
} from "../../../src/lib/data/labels-statements";
import { periodEnd, periodOf, type MoneyLookup, type PeoplePay } from "../duties-contracts";
import { coversMonth, type AccountHistory } from "../statements/cash";
import type { Close, CloseItemKey } from "./types";

export type FactInputs = {
  period: string;
  owner: boolean;
  close: Close;
  /** Null when the statements module is not here. */
  histories: AccountHistory[] | null;
  money: MoneyLookup | null;
  people: PeoplePay | null;
  /** The company record's "Registered for GST", when it says. */
  gst: "yes" | "no" | "" | null;
  /** A file's title in Files, or null when it is gone. */
  fileTitle: (fileId: string) => string | null;
};

const attached = (input: FactInputs, key: CloseItemKey) =>
  input.close.items[key].file_ids.map(
    (id) => `Attached: ${input.fileTitle(id) ?? "a file no longer in Files"}.`,
  );

function statementsFacts(input: FactInputs): string[] {
  if (!input.histories) return ["Statements are not loaded here."];
  const first = `${input.period}-01`;
  const end = periodEnd(input.period);
  const accounts = input.histories.filter(
    (history) => history.account.closed_on === null || history.account.closed_on >= first,
  );
  if (accounts.length === 0) return ["No bank or card account is recorded yet."];
  const covered = accounts.filter((history) => coversMonth(history, input.period));
  const facts = [
    `${covered.length} of ${countOf(accounts.length, "account")} ${accounts.length === 1 ? "is" : "are"} covered for the whole month.`,
  ];
  for (const history of accounts) {
    if (coversMonth(history, input.period)) continue;
    const name = history.account.name;
    if (history.covered_to === null) facts.push(`${name} has no statement yet.`);
    else if (history.first_day !== null && history.first_day > first && history.first_day <= end)
      facts.push(`${name} starts on ${dayWords(history.first_day)}.`);
    else facts.push(`${name} stops at ${dayWords(history.covered_to)}.`);
  }
  const unsorted = accounts.reduce(
    (count, history) =>
      count +
      history.lines.filter(
        (line) => periodOf(line.posted_on) === input.period && line.category_id === null,
      ).length,
    0,
  );
  if (unsorted > 0)
    facts.push(`${countOf(unsorted, "line")} ${unsorted === 1 ? "has" : "have"} no category.`);
  for (const history of accounts)
    for (const statement of history.statements)
      if (statement.from <= end && statement.to >= first && statement.adds_up.ok === false)
        facts.push(`${history.account.name} does not add up at line ${statement.adds_up.at_line}.`);
  return facts;
}

export function factsOf(input: FactInputs): Record<CloseItemKey, string[]> {
  const first = `${input.period}-01`;
  const end = periodEnd(input.period);
  let pack: ReturnType<MoneyLookup["packFiles"]> | null = null;
  let exports: ReturnType<MoneyLookup["exportInvoices"]> = [];
  try {
    pack = input.money?.packFiles(input.period) ?? null;
    exports = input.money?.exportInvoices({ from: first, to: end }) ?? [];
  } catch {
    pack = null;
  }
  const money = (facts: string[]) => (input.money ? facts : [MONEY_MISSING]);
  let stipend: string[];
  if (!input.owner) stipend = [STIPEND_OWNER_FACT];
  else if (!input.people) stipend = [PEOPLE_MISSING];
  else {
    const paid = input.people.paid(first, end);
    const totals: Record<string, number> = {};
    for (const pay of paid) totals[pay.currency] = (totals[pay.currency] ?? 0) + pay.amount_minor;
    stipend = paid.length
      ? [`${countOf(paid.length, "payment")}, ${minorWordsBy(totals)}.`]
      : ["No stipend was paid this month."];
  }
  const receiptsWithoutFira = exports
    .flatMap((invoice) => invoice.receipts)
    .filter(
      (receipt) => periodOf(receipt.received_on) === input.period && !receipt.fira_number,
    ).length;
  return {
    statements: statementsFacts(input),
    sales_invoices: [
      ...money([`${countOf(exports.length, "export invoice")} recorded.`]),
      ...attached(input, "sales_invoices"),
    ],
    bills: money(
      pack
        ? [
            `${countOf(pack.bills_count, "bill")}${pack.bills_without_copy > 0 ? `, ${pack.bills_without_copy} without a copy` : ""}.`,
          ]
        : [],
    ),
    stipend_sheet: stipend,
    tds_challans: money(pack ? [`${countOf(pack.challans_count, "challan")}.`] : []),
    gst_returns: [
      ...(input.gst === "no" ? ["The company record says not registered for GST."] : []),
      ...attached(input, "gst_returns"),
    ],
    firas: money(
      pack
        ? [
            `${countOf(pack.firas_count, "FIRA")}.`,
            ...(receiptsWithoutFira > 0
              ? [
                  `${countOf(receiptsWithoutFira, "receipt")} ${receiptsWithoutFira === 1 ? "has" : "have"} no FIRA yet.`,
                ]
              : []),
          ]
        : [],
    ),
  };
}
