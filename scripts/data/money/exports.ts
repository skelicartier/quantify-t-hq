/**
 * The clocks and sums of an export invoice (ws-notes/duties/spec.md §5.4): the EDF's day
 * (`export-edf`: 30 days after the end of the invoice's month), the day the money must be
 * home (`export-realisation`, **only once confirmed**: the sources give 9 months and 15),
 * what has been realised in the invoice's own currency, the rate a receipt came at when its
 * rupees are known, and the LUT check. Dollars are never turned into rupees here. Pure.
 */

import { addDays } from "../days";
import { dutyDue, periodEnd, periodOf, ruleLineOf, type RuleLine } from "../duties-contracts";
import { fyWords, minorWords } from "../../../src/lib/data/labels-duties";
import { CURRENCY_UNITS } from "../../../src/lib/data/labels-money";
import type { RuleAsk } from "./tds";
import type { Lut, Receipt } from "./types";

export type ExportClocks = {
  edf_by: string | null;
  /** Null until the realisation rule is confirmed (and whenever no rule book is loaded). */
  realise_by: string | null;
  rules: { edf: RuleLine | null; realisation: RuleLine | null };
  /** The readings of the realisation rule while it is not confirmed; else []. */
  readings: string[];
};

export function exportClocks(invoiceOn: string, rules: RuleAsk): ExportClocks {
  const edf = rules("export-edf");
  const realisation = rules("export-realisation");
  const edfBy =
    edf && edf.usable && edf.amount !== null
      ? addDays(periodEnd(periodOf(invoiceOn)), edf.amount)
      : null;
  const line = realisation ? ruleLineOf(realisation) : null;
  return {
    edf_by: edfBy,
    realise_by: realisation ? dutyDue(realisation, invoiceOn) : null,
    rules: { edf: edf ? ruleLineOf(edf) : null, realisation: line },
    readings: line ? line.readings : [],
  };
}

export type Realised = {
  /** The live receipts, in the invoice's currency. */
  minor: number;
  of_minor: number;
  /** The day the receipts first reached the invoice's amount; null until then. */
  in_full_on: string | null;
  /** The rupees that reached the bank, summed where known; null when none is known. */
  inr_minor: number | null;
};

export const live = <T extends { taken_back: unknown }>(items: readonly T[]): T[] =>
  items.filter((item) => item.taken_back === null);

export function realisedOf(amount: number, receipts: readonly Receipt[]): Realised {
  const sorted = live(receipts).sort(
    (a, b) => a.received_on.localeCompare(b.received_on) || a.at.localeCompare(b.at),
  );
  let sum = 0;
  let inFull: string | null = null;
  let rupees: number | null = null;
  for (const receipt of sorted) {
    sum += receipt.amount_minor;
    if (inFull === null && sum >= amount && amount > 0) inFull = receipt.received_on;
    if (receipt.inr_minor !== null) rupees = (rupees ?? 0) + receipt.inr_minor;
  }
  return { minor: sum, of_minor: amount, in_full_on: inFull, inr_minor: rupees };
}

/**
 * "₹88.25 a dollar": the rupees that reached the bank for each unit received, rounded down to
 * a paisa (`floor(inr × 100 / amount)`). "" for a rupee invoice or when the rupees are not known.
 */
export function rateWordsOf(
  currency: string,
  amountMinor: number,
  inrMinor: number | null,
): string {
  if (currency === "INR" || inrMinor === null || amountMinor <= 0) return "";
  const paise = Math.floor((inrMinor * 100) / amountMinor);
  return `${minorWords(paise, "INR")} ${CURRENCY_UNITS[currency] ?? `a unit of ${currency}`}`;
}

/** The LUT check line, for an invoice under LUT whose financial year has none recorded. */
export function lutCheck(
  invoiceOn: string,
  taxTreatment: string,
  luts: readonly Lut[],
): string | null {
  if (taxTreatment !== "under_lut") return null;
  const fy = fyWords(invoiceOn);
  if (luts.some((lut) => lut.fy === fy)) return null;
  return `No LUT is recorded for ${fy}. It is filed before the year's first zero-rated invoice. Confirm with your CA.`;
}
