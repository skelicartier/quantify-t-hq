/**
 * Tax deducted on Indian vendors' bills (ws-notes/duties/spec.md §5.4, §8.2): the table of
 * kinds with their section and payment code as the source gives them, and the year-to-date
 * line a bill or a vendor shows. HQ records what was deducted; it works out a comparison with
 * the limit and prints what the rate comes to as a hint, never as the amount to deduct. A
 * limit the sources disagree on works nothing out until it is confirmed. Pure.
 */

import {
  ruleLineOf,
  tdsDepositDue,
  type DutyRuleKey,
  type DutyRuleState,
  type RuleLine,
} from "../duties-contracts";
import { dayWords } from "../../../src/lib/data/labels-company";
import { fyWords, minorWords, rateWords, shareOf } from "../../../src/lib/data/labels-duties";
import { TDS_KINDS } from "../../../src/lib/data/labels-money";
import type { TdsKind } from "./types";

export type TdsRow = {
  kind: TdsKind;
  label: string;
  /** As the source gives it: "393(1), Table 6(iii)"; "" for none. */
  section: string;
  /** The payment code; "" where the source gives none. */
  code: string;
  rate: DutyRuleKey | null;
  /** A single bill's limit, the year's, a month's rent's. */
  single: DutyRuleKey | null;
  year: DutyRuleKey | null;
  month: DutyRuleKey | null;
};

const row = (
  kind: TdsKind,
  section: string,
  code: string,
  rate: DutyRuleKey | null,
  limits: { single?: DutyRuleKey; year?: DutyRuleKey; month?: DutyRuleKey } = {},
): TdsRow => ({
  kind,
  label: TDS_KINDS[kind],
  section,
  code,
  rate,
  single: limits.single ?? null,
  year: limits.year ?? null,
  month: limits.month ?? null,
});

/** The TDS table (spec §8.2), static. */
export const TDS_TABLE: Record<TdsKind, TdsRow> = {
  contractor_person: row(
    "contractor_person",
    "393(1), Table 6(i)",
    "1023",
    "tds-rate-contractor-person",
    {
      single: "tds-contractor-single",
      year: "tds-contractor-year",
    },
  ),
  contractor_other: row(
    "contractor_other",
    "393(1), Table 6(i)",
    "1024",
    "tds-rate-contractor-other",
    {
      single: "tds-contractor-single",
      year: "tds-contractor-year",
    },
  ),
  technical: row("technical", "393(1), Table 6(iii)", "1026", "tds-rate-technical", {
    year: "tds-technical-year",
  }),
  professional: row("professional", "393(1), Table 6(iii)", "1027", "tds-rate-professional", {
    year: "tds-professional-year",
  }),
  director: row("director", "393(1), Table 6(iii)", "1028", "tds-rate-director"),
  rent_plant: row("rent_plant", "393(1), Table 2(ii)", "", "tds-rate-rent-plant", {
    month: "tds-rent-month",
  }),
  rent_building: row("rent_building", "393(1), Table 2(ii)", "", "tds-rate-rent-building", {
    month: "tds-rent-month",
  }),
  none: row("none", "", "", null),
};

export const isTdsKind = (value: unknown): value is TdsKind =>
  typeof value === "string" && Object.prototype.hasOwnProperty.call(TDS_TABLE, value);

/** A rule's state, or null when no rule book is loaded here. */
export type RuleAsk = (key: DutyRuleKey) => DutyRuleState | null;

/** One of a vendor's bills, as far as the line needs it. */
export type TdsBill = {
  bill_id: string;
  invoice_on: string;
  created_at: string;
  taxable_minor: number;
  currency: string;
  cancelled: boolean;
  kind: TdsKind | "";
};

export type TdsLine = {
  kind: TdsKind;
  label: string;
  section: string;
  code: string;
  fy: string;
  /** The rupees billed before GST in the bill's financial year, to this bill. */
  ytd_minor: number;
  /** The comparison with the limit, or the sum alone when nothing may be worked out. */
  words: string;
  /** What the rate comes to, printed as a guide; "" when nothing is over a limit. */
  hint_words: string;
  /** The limit's rule (or the rate's, where there is no limit). */
  rule: RuleLine | null;
  rate_rule: RuleLine | null;
  /** The day the tax deducted is to be deposited by, once a deduction is recorded. */
  deposit_by: string | null;
  deposit_rule: RuleLine | null;
};

const inr = (minor: number) => minorWords(minor, "INR");
const byDay = (a: TdsBill, b: TdsBill) =>
  a.invoice_on.localeCompare(b.invoice_on) ||
  a.created_at.localeCompare(b.created_at) ||
  a.bill_id.localeCompare(b.bill_id);

/** A rule's amount in paise, when it may be used: a limit in rupees. */
function limitOf(state: DutyRuleState | null): number | null {
  if (!state || !state.usable || state.amount === null) return null;
  return Math.round(state.amount * 100);
}

function rateOf(state: DutyRuleState | null): number | null {
  if (!state || !state.usable || state.amount === null) return null;
  return state.amount;
}

const lineOf = (state: DutyRuleState | null): RuleLine | null => (state ? ruleLineOf(state) : null);

/** "₹45,000 of ₹50,000 in 2026-27: below the limit." and its two neighbours. */
function againstYear(
  ytd: number,
  before: number,
  limit: number,
  fy: string,
  crossedOn: string | null,
  as: "bill" | "year",
): { words: string; over: boolean } {
  if (ytd < limit)
    return { words: `${inr(ytd)} of ${inr(limit)} in ${fy}: below the limit.`, over: false };
  if (ytd === limit)
    return {
      words: `${inr(ytd)} of ${inr(limit)} in ${fy}: at the limit, not over it.`,
      over: false,
    };
  const since =
    as === "bill" && before <= limit
      ? "with this bill"
      : `since the bill of ${crossedOn ? dayWords(crossedOn) : "this year"}`;
  return { words: `${inr(ytd)} in ${fy}: over the ${inr(limit)} limit ${since}.`, over: true };
}

/**
 * The line beside a bill (`as: "bill"`, the bill given is the one the line is on) or beside
 * a vendor's financial year (`as: "year"`, the bill given is the year's last). `bills` are the
 * vendor's bills, this one included; only bills in rupees that are not cancelled count.
 */
export function tdsLine(input: {
  bill: TdsBill;
  bills: readonly TdsBill[];
  kind: TdsKind | "";
  resident: boolean;
  rules: RuleAsk;
  deducted_on?: string | null;
  as?: "bill" | "year";
}): TdsLine | null {
  const { bill, kind, rules } = input;
  const as = input.as ?? "bill";
  if (!input.resident || kind === "" || kind === "none" || bill.cancelled) return null;
  const table = TDS_TABLE[kind];
  const fy = fyWords(bill.invoice_on);
  const counted = input.bills
    .filter((item) => !item.cancelled && item.currency === "INR" && fyWords(item.invoice_on) === fy)
    .sort(byDay);
  const upTo = counted.filter((item) => byDay(item, bill) <= 0);
  const ytd = upTo.reduce((sum, item) => sum + item.taxable_minor, 0);
  const thisBill = bill.currency === "INR" ? bill.taxable_minor : 0;
  const before = ytd - (counted.some((item) => item.bill_id === bill.bill_id) ? thisBill : 0);

  const rateState = table.rate ? rules(table.rate) : null;
  const rate = rateOf(rateState);
  const rateWord = rate === null ? "" : rateWords(rate);
  const depositState = rules("tds-deposit");
  const deducted = input.deducted_on ?? null;
  const base = {
    kind,
    label: table.label,
    section: table.section,
    code: table.code,
    fy,
    ytd_minor: ytd,
    rate_rule: lineOf(rateState),
    deposit_by: deducted && depositState ? tdsDepositDue(deducted) : null,
    deposit_rule: deducted && depositState ? lineOf(depositState) : null,
  };
  const billed = `${inr(ytd)} billed in ${fy}.`;
  const hintYear = (rateText: string) =>
    as === "bill"
      ? `${rateText} of this bill is ${inr(shareOf(thisBill, rate ?? 0))}; of the year so far, ${inr(shareOf(ytd, rate ?? 0))}. Your CA decides which applies.`
      : `${rateText} of the year so far is ${inr(shareOf(ytd, rate ?? 0))}.`;

  if (bill.currency !== "INR" && as === "bill")
    return {
      ...base,
      words: `This bill is in ${bill.currency}: only bills in rupees are counted against the limits. ${billed}`,
      hint_words: "",
      rule: lineOf(table.year ? rules(table.year) : table.month ? rules(table.month) : rateState),
    };

  // Director's fees: no lower limit.
  if (!table.single && !table.year && !table.month) {
    if (!rateState) return { ...base, words: billed, hint_words: "", rule: null };
    const amount = as === "bill" ? thisBill : ytd;
    return {
      ...base,
      words: "No lower limit.",
      hint_words:
        rate === null
          ? ""
          : `${rateWord} of ${as === "bill" ? "this bill" : "the year so far"} is ${inr(shareOf(amount, rate))}.`,
      rule: lineOf(rateState),
    };
  }

  // Rent: compared month by month.
  if (table.month) {
    const monthState = rules(table.month);
    const limit = limitOf(monthState);
    if (as === "year")
      return {
        ...base,
        words: `${inr(ytd)} of rent billed in ${fy}. Rent is compared month by month, on each bill.`,
        hint_words: "",
        rule: lineOf(monthState),
      };
    if (limit === null) return { ...base, words: billed, hint_words: "", rule: lineOf(monthState) };
    const period = bill.invoice_on.slice(0, 7);
    const month = counted
      .filter((item) => item.invoice_on.slice(0, 7) === period)
      .reduce((sum, item) => sum + item.taxable_minor, 0);
    const over = month > limit;
    return {
      ...base,
      words:
        month > limit
          ? `This month's rent, ${inr(month)}, is over the ${inr(limit)} limit.`
          : month === limit
            ? `This month's rent, ${inr(month)}, is at the ${inr(limit)} limit, not over it.`
            : `This month's rent, ${inr(month)}, is below the ${inr(limit)} limit.`,
      hint_words: over && rate !== null ? `${rateWord} of it is ${inr(shareOf(month, rate))}.` : "",
      rule: lineOf(monthState),
    };
  }

  // A year's limit, and for contractors a single bill's too.
  const yearState = table.year ? rules(table.year) : null;
  const yearLimit = limitOf(yearState);
  if (yearLimit === null)
    return { ...base, words: billed, hint_words: "", rule: lineOf(yearState) };
  let running = 0;
  let crossedOn: string | null = null;
  for (const item of upTo) {
    running += item.taxable_minor;
    if (running > yearLimit) {
      crossedOn = item.invoice_on;
      break;
    }
  }
  const year = againstYear(ytd, before, yearLimit, fy, crossedOn, as);
  if (year.over)
    return {
      ...base,
      words: year.words,
      hint_words: rate === null ? "" : hintYear(rateWord),
      rule: lineOf(yearState),
    };
  const singleState = table.single ? rules(table.single) : null;
  const single = limitOf(singleState);
  if (single === null)
    return { ...base, words: year.words, hint_words: "", rule: lineOf(yearState) };
  if (as === "year") {
    const overOne = upTo.filter((item) => item.taxable_minor > single).length;
    return {
      ...base,
      words:
        overOne === 0
          ? year.words
          : `${year.words} ${overOne === 1 ? "1 bill is" : `${overOne} bills are`} over the ${inr(single)} limit for one bill.`,
      hint_words: "",
      rule: lineOf(overOne > 0 ? singleState : yearState),
    };
  }
  if (thisBill > single)
    return {
      ...base,
      words: `This bill, ${inr(thisBill)}, is over the ${inr(single)} limit for one bill.`,
      hint_words:
        rate === null ? "" : `${rateWord} of this bill is ${inr(shareOf(thisBill, rate))}.`,
      rule: lineOf(singleState),
    };
  return {
    ...base,
    words: `${year.words} This bill, ${inr(thisBill)}, is ${thisBill === single ? `at the ${inr(single)} limit for one bill, not over it` : `below the ${inr(single)} limit for one bill`}.`,
    hint_words: "",
    rule: lineOf(yearState),
  };
}
