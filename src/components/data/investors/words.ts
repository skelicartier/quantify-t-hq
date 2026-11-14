import { NOT_KNOWN } from "@/lib/data/labels";
import { formatMoney, formatNumber } from "@/lib/format";

/**
 * How the raise's figures read on the Investors pages: plain counts and "9 of 11", money
 * in its own currency, and the discount in words ("20 per cent"). Never a per cent sign,
 * a share or a target: there is nothing to measure a figure against.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "9 Nov": a calendar day as a hint says it, never shifted into a zone. */
export function dayMonth(day: string): string {
  const [, month = "", date = ""] = day.split("-");
  return `${Number(date)} ${MONTHS[Number(month) - 1] ?? ""}`;
}

/** "9 of 11": a count of firms out of the count before it. */
export function ratio(count: number, of: number): string {
  return `${formatNumber(count)} of ${formatNumber(of)}`;
}

/** "1 firm", "3 firms". */
export function firmsWord(count: number): string {
  return `${formatNumber(count)} ${count === 1 ? "firm" : "firms"}`;
}

export const TOUCH_WORDS = { written: "Written to", replied: "Replied", met: "Met" } as const;

/** "$25,000–$100,000", "From $25,000", "Up to $100,000", "Not known". */
export function chequeWords(
  cheque: { min: number | null; max: number | null; currency: string } | null,
): string {
  if (!cheque || (cheque.min === null && cheque.max === null)) return NOT_KNOWN;
  if (cheque.min !== null && cheque.max !== null)
    return `${formatMoney(cheque.min, cheque.currency)}–${formatMoney(cheque.max, cheque.currency)}`;
  if (cheque.min !== null) return `From ${formatMoney(cheque.min, cheque.currency)}`;
  return `Up to ${formatMoney(cheque.max, cheque.currency)}`;
}

/** "20 per cent", "12.5 per cent", or "None". */
export function discountWords(discount: number | null): string {
  return discount === null ? "None" : `${String(discount)} per cent`;
}
