/**
 * Thresholds to watch (ws-notes/duties/spec.md §5.3, §7.6): four sentences, five when the
 * books software's free plan has a limit typed, each with its rule line. No meter, no target,
 * no share: a sentence that says where the figure stands against the rule's amount. HQ never
 * decides that a threshold applies; the rule line says who confirms it. Pure.
 */

import {
  ruleLineOf,
  type DutyRuleKey,
  type DutyRulesService,
  type ExportView,
  type RuleLine,
} from "../duties-contracts";
import { dayWords, rupees } from "../../../src/lib/data/labels-company";
import { minorWords } from "../../../src/lib/data/labels-duties";

export type Tile = {
  key: "gst" | "pf" | "esi" | "caro" | "books";
  words: string;
  beside: string;
  rule: RuleLine | null;
};

export type TileInput = {
  today: string;
  rules: DutyRulesService | null;
  /** This financial year's export invoices; null when Money is not loaded. */
  exports: readonly ExportView[] | null;
  other_sales_minor: number;
  /** Null when the people ledger is not loaded. Counts only. */
  headcount: { employees: number; interns: number; contractors: number } | null;
  caro: { amount_minor: number; as_of: string } | null;
  /** The books software's free plan, as typed on the Company record; null for none. */
  books: { revenue_limit: number | null; invoice_limit: number | null } | null;
};

const NO_RULES = "The rule book is not loaded here.";

/** A rule's amount today, when it may be used; and its line. */
function ruleOf(
  input: TileInput,
  key: DutyRuleKey,
): { amount: number | null; line: RuleLine | null } {
  if (!input.rules) return { amount: null, line: null };
  const state = input.rules.state(key, input.today);
  return { amount: state.usable ? state.amount : null, line: ruleLineOf(state) };
}

/** The year's turnover in paise: rupee invoices, and the realised rupees of the others. */
export function turnoverOf(exports: readonly ExportView[]): {
  minor: number;
  not_in_rupees: number;
} {
  let minor = 0;
  let notInRupees = 0;
  for (const invoice of exports) {
    if (invoice.currency === "INR") {
      minor += invoice.amount_minor;
      continue;
    }
    const known = invoice.receipts.filter((receipt) => receipt.inr_minor !== null);
    if (known.length === 0) notInRupees += 1;
    else minor += known.reduce((sum, receipt) => sum + (receipt.inr_minor ?? 0), 0);
  }
  return { minor, not_in_rupees: notInRupees };
}

export function tilesOf(input: TileInput): Tile[] {
  const tiles: Tile[] = [];

  // GST registration: the year's turnover.
  const turnover = input.exports ? turnoverOf(input.exports) : { minor: 0, not_in_rupees: 0 };
  const sales = turnover.minor + input.other_sales_minor;
  const gst = ruleOf(input, "gst-registration");
  const besideGst = [
    input.exports === null
      ? "Money is not loaded here, so only the other sales you typed count."
      : "",
    turnover.not_in_rupees > 0
      ? `${turnover.not_in_rupees} ${turnover.not_in_rupees === 1 ? "invoice is" : "invoices are"} not in rupees yet.`
      : "",
    input.rules ? "" : NO_RULES,
  ]
    .filter(Boolean)
    .join(" ");
  tiles.push({
    key: "gst",
    words:
      gst.amount === null
        ? `${minorWords(sales, "INR")} this year.`
        : `${minorWords(sales, "INR")} this year of the ${rupees(gst.amount)} limit: ${sales > gst.amount * 100 ? "over" : "below"}.`,
    beside: besideGst,
    rule: gst.line,
  });

  // Provident fund and ESI: employees only; interns and contractors printed beside.
  for (const [key, ruleKey] of [
    ["pf", "pf-headcount"],
    ["esi", "esi-headcount"],
  ] as const) {
    const rule = ruleOf(input, ruleKey);
    const count = input.headcount;
    const words = !count
      ? "The people ledger is not loaded here."
      : rule.amount === null
        ? `${count.employees} ${count.employees === 1 ? "employee" : "employees"}.`
        : count.employees >= rule.amount
          ? `${count.employees} ${count.employees === 1 ? "employee" : "employees"}: at or over the limit of ${rule.amount}.`
          : `${count.employees} ${count.employees === 1 ? "employee" : "employees"}; the limit is ${rule.amount}.`;
    tiles.push({
      key,
      words,
      beside: count
        ? `${count.interns} ${count.interns === 1 ? "intern" : "interns"} and ${count.contractors} ${count.contractors === 1 ? "contractor" : "contractors"} are not counted here; confirm with your CA whether they should be.${input.rules ? "" : ` ${NO_RULES}`}`
        : input.rules
          ? ""
          : NO_RULES,
      rule: rule.line,
    });
  }

  // CARO: the figure he types, with the day it is true on.
  const caro = ruleOf(input, "caro-capital");
  tiles.push({
    key: "caro",
    words: !input.caro
      ? "Not typed yet."
      : caro.amount === null
        ? `${minorWords(input.caro.amount_minor, "INR")} on ${dayWords(input.caro.as_of)}.`
        : `${minorWords(input.caro.amount_minor, "INR")} on ${dayWords(input.caro.as_of)} of the ${rupees(caro.amount)} limit: ${input.caro.amount_minor > caro.amount * 100 ? "over" : "below"}.`,
    beside: input.rules ? "" : NO_RULES,
    rule: caro.line,
  });

  // The books software's free plan: only when a limit is typed on the Company record.
  const books = input.books;
  if (books && (books.revenue_limit !== null || books.invoice_limit !== null)) {
    const parts: string[] = [];
    if (books.revenue_limit !== null)
      parts.push(
        `${minorWords(sales, "INR")} of the ${rupees(books.revenue_limit)} your books software's free plan allows.`,
      );
    if (books.invoice_limit !== null) {
      const invoices = input.exports?.length ?? 0;
      parts.push(
        `${invoices} ${invoices === 1 ? "invoice" : "invoices"} this year of the ${books.invoice_limit.toLocaleString("en-IN")} it allows.`,
      );
    }
    tiles.push({ key: "books", words: parts.join(" "), beside: "", rule: null });
  }
  return tiles;
}
