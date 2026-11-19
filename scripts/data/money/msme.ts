/**
 * The MSME pay-by day (ws-notes/duties/spec.md §5.4): only for a vendor whose Udyam class is
 * micro or small. Base: the day the goods or the service were accepted (the invoice day
 * until he types another). No written agreement: base + `msme-no-agreement` (15 days); with
 * one: base + the agreed days, never more than `msme-agreement` (45). Worked out on every
 * read, so a class change on the vendor moves its open bills' day at once. Pure.
 */

import { addDays, daysBetween } from "../days";
import { ruleLineOf, type RuleLine } from "../duties-contracts";
import { dayWords } from "../../../src/lib/data/labels-company";
import type { RuleAsk } from "./tds";
import type { Flag, UdyamClass } from "./types";

export type MsmeView = {
  /** The limit covers this supplier. */
  applies: boolean;
  pay_by: string | null;
  /** "Micro supplier, no written agreement: pay by 18 Nov 2026." */
  words: string;
  /** "Agreed 60 days; the limit is 45." or "". */
  note: string;
  /** "(15-day limit)", as the Bills table prints it beside the day. */
  short: string;
  rule: RuleLine | null;
};

const CLASS_WORDS: Record<"micro" | "small", string> = { micro: "Micro", small: "Small" };

export function msmePayBy(input: {
  udyam: UdyamClass;
  agreement: { has: Flag; days: number | null };
  /** The accepted day, else the invoice day. */
  base: string;
  rules: RuleAsk;
}): MsmeView | null {
  const { udyam, agreement, base, rules } = input;
  if (udyam === "medium")
    return {
      applies: false,
      pay_by: null,
      words: "The limit covers micro and small suppliers only.",
      note: "",
      short: "",
      rule: null,
    };
  if (udyam !== "micro" && udyam !== "small") return null;
  const who = CLASS_WORDS[udyam];
  const agreed = agreement.has === "yes" && agreement.days !== null ? agreement.days : null;
  const key = agreed === null ? "msme-no-agreement" : "msme-agreement";
  const state = rules(key);
  const rule = state ? ruleLineOf(state) : null;
  if (!state || !state.usable || state.amount === null)
    return {
      applies: true,
      pay_by: null,
      words: `${who} supplier: the pay-by day is not worked out here.`,
      note: "",
      short: "",
      rule,
    };
  if (agreed === null) {
    const payBy = addDays(base, state.amount);
    return {
      applies: true,
      pay_by: payBy,
      words: `${who} supplier, no written agreement: pay by ${dayWords(payBy)}.`,
      note: "",
      short: `(${state.amount}-day limit)`,
      rule,
    };
  }
  const days = Math.min(agreed, state.amount);
  const payBy = addDays(base, days);
  const capped = agreed > state.amount;
  return {
    applies: true,
    pay_by: payBy,
    words: `${who} supplier, written agreement: pay by ${dayWords(payBy)}.`,
    note: capped ? `Agreed ${agreed} days; the limit is ${state.amount}.` : "",
    short: capped ? `(${state.amount}-day limit)` : `(agreed ${agreed} days)`,
    rule,
  };
}

/** "Paid 7 days after the limit. Confirm with your CA how this year's deduction is affected." */
export function paidLateWords(payBy: string, paidOn: string): string {
  const late = daysBetween(payBy, paidOn);
  if (late <= 0) return "";
  return `Paid ${late} ${late === 1 ? "day" : "days"} after the limit. Confirm with your CA how this year's deduction is affected.`;
}
