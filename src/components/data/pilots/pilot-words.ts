import type { Pilot } from "@/lib/data/api/pilots";
import { dayWords, moneyWords } from "@/lib/data/labels-close";

import type { PilotFieldValues } from "./pilot-fields";

/**
 * How a pilot's price and conversion read on the Pilots list, the pilot's page and the
 * waitlist firm's section: "₹50,000 for the pilot: 20 per cent upfront", "Free, for a
 * reference", "Converts on 1 Feb 2027 at ₹40,000 a month".
 */

export function priceWords(price: Pilot["price"], short = false): string {
  if (!price) return short ? "Free" : "Free, for a reference";
  const money = moneyWords(price.amount, price.currency);
  if (short) return money;
  return `${money} for the pilot${price.note ? `: ${price.note}` : ""}`;
}

export function conversionWords(conversion: Pilot["conversion"]): string {
  if (!conversion || (!conversion.on && conversion.amount === null)) return "Not agreed yet";
  const at =
    conversion.amount === null
      ? ""
      : ` at ${moneyWords(conversion.amount, conversion.currency)} a ${conversion.per}`;
  return conversion.on ? `Converts on ${dayWords(conversion.on)}${at}` : `Converts${at}`;
}

/** A pilot's stored values as the form's defaults. */
export function pilotValues(pilot: Pilot): PilotFieldValues {
  return {
    starts_on: pilot.starts_on,
    ends_on: pilot.ends_on,
    criteria: pilot.criteria.map((criterion) => ({
      what: criterion.what,
      target: criterion.target,
    })),
    owners: { ...pilot.owners },
    free: pilot.price === null,
    price: pilot.price ? String(pilot.price.amount) : "",
    currency: pilot.price?.currency ?? pilot.conversion?.currency ?? "INR",
    price_note: pilot.price?.note ?? "",
    converts_on: pilot.conversion?.on ?? "",
    conversion_amount:
      pilot.conversion?.amount === null || pilot.conversion?.amount === undefined
        ? ""
        : String(pilot.conversion.amount),
    per: pilot.conversion?.per ?? "month",
    go_no_go_on: pilot.go_no_go_on ?? "",
  };
}
