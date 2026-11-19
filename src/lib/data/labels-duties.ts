/**
 * Money, months and IST minutes as the duties batch writes them (ws-notes/duties/spec.md
 * §3.2), shared by the service and the pages. Pure: no file, no clock. Money is whole minor
 * units (paise, cents); nothing here adds across currencies.
 */

import { moneyWords } from "./labels-close";
import { dayWords } from "./labels-company";

export const DUTY_CURRENCIES = ["INR", "USD", "EUR", "GBP", "SGD", "AED"] as const;
export type DutyCurrency = (typeof DUTY_CURRENCIES)[number];
export const isDutyCurrency = (value: unknown): value is DutyCurrency =>
  typeof value === "string" && (DUTY_CURRENCIES as readonly string[]).includes(value);

/** The most a single amount may be: ₹1,00,000 crore, in paise. */
export const MINOR_MAX = 100_000_000_000_000;
export const AMOUNT_WORDS = "Type the amount as a number, such as 1180.50.";

/**
 * "1,180.50", "1180.5", "₹ 1,180", 1180.5 → 118050. Null for anything else: a minus sign,
 * more than two decimals, letters, nothing, or more than `MINOR_MAX`.
 */
export function minorOf(value: unknown): number | null {
  const text = String(value ?? "").replace(/[₹$€£,\s]/g, "");
  const match = /^(\d{1,13})(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return null;
  const minor = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0") || "0");
  return minor <= MINOR_MAX ? minor : null;
}

/**
 * 118050, "INR" → "₹1,180.50"; 250000000, "INR" → "₹25,00,000"; 1250000, "USD" → "$12,500".
 * Decimals only when it is not whole; a negative amount leads with a minus sign (U+2212).
 */
export function minorWords(minor: number, currency: string): string {
  const abs = Math.abs(Math.trunc(minor));
  const whole = Math.floor(abs / 100);
  const part = abs % 100;
  const head = moneyWords(whole, currency);
  const text = part === 0 ? head : `${head}.${String(part).padStart(2, "0")}`;
  return minor < 0 ? `−${text}` : text;
}

/** One figure per currency, by code, joined with " · "; "" for none. Never added. */
export function minorWordsBy(values: Readonly<Record<string, number>>): string {
  return Object.entries(values)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, minor]) => minorWords(minor, currency))
    .join(" · ");
}

/** What the page types back into an amount field: 118050 → "1180.50", 250000000 → "2500000". */
export function minorInput(minor: number): string {
  const abs = Math.abs(Math.trunc(minor));
  const part = abs % 100;
  return part === 0
    ? String(abs / 100)
    : `${Math.floor(abs / 100)}.${String(part).padStart(2, "0")}`;
}

/** 10 → "10 per cent"; 0.1 → "0.1 per cent". Never a per cent sign. */
export function rateWords(perCent: number): string {
  return `${String(Math.round(perCent * 100) / 100)} per cent`;
}

/** A share of an amount, rounded down to a paisa: (1000000, 10) → 100000. Whole-number arithmetic. */
export function shareOf(minor: number, perCent: number): number {
  return Math.floor((minor * Math.round(perCent * 100)) / 10_000);
}

const LONG_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "2026-11" → "November 2026". */
export function periodWords(period: string): string {
  const [year = "", month = "1"] = period.split("-");
  return `${LONG_MONTHS[Number(month) - 1] ?? ""} ${year}`;
}

/** "2026-27" for any day from 1 Apr 2026 to 31 Mar 2027. */
export function fyWords(day: string): string {
  const year = Number(day.slice(0, 4));
  const start = Number(day.slice(5, 7)) >= 4 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

// ------------------------------------------------------------------ IST minutes

/** A minute on the clock in India (UTC+05:30, no summer time) as an instant; null when malformed. */
export function istInstant(day: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const at = new Date(`${day}T${time}:00+05:30`);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

/** The calendar day and the minute in India of an instant. */
export function istParts(iso: string): { day: string; time: string } {
  const shifted = new Date(new Date(iso).getTime() + 330 * 60_000).toISOString();
  return { day: shifted.slice(0, 10), time: shifted.slice(11, 16) };
}

/** "03:40 IST, 14 Nov 2026". */
export function istWords(iso: string): string {
  const { day, time } = istParts(iso);
  return `${time} IST, ${dayWords(day)}`;
}

export function addHours(iso: string, hours: number): string {
  return new Date(new Date(iso).getTime() + hours * 3_600_000).toISOString();
}

/** Whole minutes from one instant to another; negative when `to` is earlier. */
export function minutesBetween(from: string, to: string): number {
  return Math.floor((new Date(to).getTime() - new Date(from).getTime()) / 60_000);
}

/** 320 → "5 hours 20 minutes"; 60 → "1 hour"; 20 → "20 minutes"; 1500 → "1 day 1 hour"; 0 → "0 minutes". */
export function spanWords(minutes: number): string {
  const total = Math.abs(Math.trunc(minutes));
  const days = Math.floor(total / 1_440);
  const hours = Math.floor((total % 1_440) / 60);
  const mins = total % 60;
  const say = (count: number, one: string) => `${count} ${count === 1 ? one : `${one}s`}`;
  const parts: string[] = [];
  if (days) parts.push(say(days, "day"));
  if (hours) parts.push(say(hours, "hour"));
  if (mins && !days) parts.push(say(mins, "minute"));
  return parts.length ? parts.join(" ") : "0 minutes";
}
