/**
 * What was paid to a person in each financial year, and how it compares with the
 * professional-fee limit (duties spec §5.3, §7.5). For the Owner only, like everything in the
 * ledger. HQ adds up; it never deducts and never decides: the classification is the CA's, and
 * the comparison is made only for a professional fee, and only while the rule
 * `tds-professional-year` is usable (in force and, since the sources disagree, confirmed).
 * Until then the line says what was paid and the rule line says what the sources give.
 * Rupees only: a stipend in dollars is listed beside, never added.
 */

import { ruleLineOf, type DutyRulesService, type RuleLine } from "../duties-contracts";
import { fyWords, minorWords, minorWordsBy } from "../../../src/lib/data/labels-duties";
import { TAX_CA_DECIDES, longDay } from "../../../src/lib/data/labels-people";
import type { Person, StipendPayment } from "./types";

export type TaxYear = {
  fy: string;
  /** Rupees paid in the year, in paise: live payments by `paid_on`. */
  paid_minor: number;
  /** Any other currency, by code, in minor units: listed beside, never added. */
  other: Record<string, number>;
  /** Tax deducted from the year's rupee payments, in paise. */
  tds_deducted_minor: number;
  /** Payments with tax deducted and no challan recorded. */
  challans_missing: number;
  words: string;
  rule: RuleLine | null;
};

const live = (payment: StipendPayment): boolean => payment.withdrawn === null;

/** The empty form the year lines start from. */
const yearOf = (fy: string): Omit<TaxYear, "words" | "rule"> => ({
  fy,
  paid_minor: 0,
  other: {},
  tds_deducted_minor: 0,
  challans_missing: 0,
});

/**
 * The year lines, newest year first. `rules` is the rule book's service (null when the dates
 * module is not loaded: the line then says so); `today` is the day the rule's state is read on.
 */
export function taxYearsOf(
  person: Pick<Person, "payments" | "tax">,
  rules: DutyRulesService | null,
  today: string,
): TaxYear[] {
  const years = new Map<string, Omit<TaxYear, "words" | "rule">>();
  const payments = person.payments
    .filter(live)
    .sort((a, b) => a.paid_on.localeCompare(b.paid_on) || a.at.localeCompare(b.at));
  for (const payment of payments) {
    const fy = fyWords(payment.paid_on);
    const year = years.get(fy) ?? yearOf(fy);
    const minor = payment.amount * 100;
    if (payment.currency === "INR") {
      year.paid_minor += minor;
      year.tds_deducted_minor += (payment.tds_deducted ?? 0) * 100;
    } else year.other[payment.currency] = (year.other[payment.currency] ?? 0) + minor;
    if ((payment.tds_deducted ?? 0) > 0 && payment.challan === null) year.challans_missing += 1;
    years.set(fy, year);
  }
  const professional = person.tax.classification === "professional_fee";
  return [...years.values()]
    .sort((a, b) => b.fy.localeCompare(a.fy))
    .map((year) => {
      const besides = Object.keys(year.other).length
        ? ` Also paid in another currency, not added: ${minorWordsBy(year.other)}.`
        : "";
      const paid = `${minorWords(year.paid_minor, "INR")} paid in ${year.fy}.`;
      if (!professional)
        return { ...year, words: `${paid}${besides} ${TAX_CA_DECIDES}`, rule: null };
      if (!rules)
        return {
          ...year,
          words: `${paid}${besides} The rule book is not loaded here.`,
          rule: null,
        };
      const state = rules.state("tds-professional-year", today);
      const rule = ruleLineOf(state);
      if (!state.usable || state.amount === null)
        return { ...year, words: `${paid}${besides}`, rule };
      const limit = state.amount * 100;
      if (year.paid_minor <= limit)
        return {
          ...year,
          words: `${minorWords(year.paid_minor, "INR")} of ${minorWords(limit, "INR")} in ${year.fy}: ${year.paid_minor === limit ? "at the limit, not over it" : "below the limit"}.${besides}`,
          rule,
        };
      // The payment that took the year strictly over the limit.
      let running = 0;
      let crossed = "";
      for (const payment of payments) {
        if (payment.currency !== "INR" || fyWords(payment.paid_on) !== year.fy) continue;
        running += payment.amount * 100;
        if (running > limit) {
          crossed = payment.paid_on;
          break;
        }
      }
      return {
        ...year,
        words: `${minorWords(year.paid_minor, "INR")} in ${year.fy}: over the ${minorWords(limit, "INR")} limit since the payment of ${longDay(crossed)}.${besides}`,
        rule,
      };
    });
}
