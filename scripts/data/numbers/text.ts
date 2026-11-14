/**
 * The monthly update's words (raise spec §8.4), exactly as they are copied into Mail
 * merge: asks first, then the month's numbers, highlights, lowlights and thanks. A part
 * with nothing typed is written as a [bracket], which Mail merge refuses to send, so a
 * half-written update cannot go out unnoticed. Pure: no file, no clock.
 */

import { longDay, runwayWords } from "./count";
import type { InvestorUpdate, UpdateNumbers } from "./types";

const COUNT = new Intl.NumberFormat("en");

/** A count as the pages print it. */
export const countWords = (value: number) => COUNT.format(value);

/** Money as the pages print it (`formatMoney`): "$50,000", "₹1,200,000". */
export function moneyWords(value: number, currency: string): string {
  const code = /^[A-Z]{3}$/.test(currency) ? currency : "USD";
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency: code,
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(value);
}

/** The non-empty lines of a part typed one per line. */
export function linesOf(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

/** "1. …", "2. …", or the bracket when nothing was typed. */
function numbered(text: string, bracket: string): string[] {
  const lines = linesOf(text);
  return lines.length ? lines.map((line, index) => `${index + 1}. ${line}`) : [bracket];
}

export function updateText(
  update: Pick<
    InvestorUpdate,
    "opening" | "asks" | "highlights" | "lowlights" | "thanks" | "sign_off"
  >,
  numbers: UpdateNumbers,
): string {
  const { label } = numbers;
  const lines: string[] = [
    `Subject: Quantify Terminal: ${label} update`,
    "",
    "Hi {{first_name}},",
    "",
    update.opening.trim() || "[One line on the month]",
    "",
    "Asks",
    ...numbered(update.asks, "[Up to three asks]"),
    "",
    `Numbers for ${label}, counted from our own records`,
    `- People who said yes: ${countWords(numbers.yeses)}`,
    `- Firms that joined the waitlist: ${countWords(numbers.firms_joined)} (${countWords(numbers.named_buyers)} of them named firms of the kinds we sell to)`,
    `- Calls booked: ${countWords(numbers.calls_booked)}. Calls held: ${countWords(numbers.calls_held)}`,
    `- Pilots signed: ${countWords(numbers.pilots_signed)}. Firms we have had a call with and no pilot yet: ${countWords(numbers.calls_held_no_pilot)}`,
  ];
  if (numbers.raise) {
    const amounts = Object.entries(numbers.raise.money_in_amounts)
      .filter(([, amount]) => amount > 0)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([currency, amount]) => moneyWords(amount, currency));
    lines.push(
      `- The round so far: soft commits ${countWords(numbers.raise.soft)}, signed ${countWords(numbers.raise.signed)}, money in ${countWords(numbers.raise.money_in)}${amounts.length ? ` (${amounts.join(" and ")} in the bank)` : ""}`,
    );
  }
  if (numbers.cash.length === 0) lines.push("- Cash and burn: [type this month's on Numbers]");
  for (const row of numbers.cash)
    lines.push(
      `- Cash: ${moneyWords(row.cash, row.currency)} on ${longDay(row.as_of)}, monthly burn ${moneyWords(row.burn_per_month, row.currency)}, runway ${runwayWords(row.runway_months)} months`,
    );
  lines.push(
    "",
    "Highlights",
    ...numbered(update.highlights, "[Up to three highlights]"),
    "",
    "Lowlights",
    ...numbered(update.lowlights, "[Up to three lowlights]"),
    "",
    "Thanks",
    update.thanks.trim() || "[Who to thank]",
    "",
    update.sign_off.trim() || "[Your name]",
  );
  return lines.join("\n");
}
