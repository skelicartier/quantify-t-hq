/**
 * What every Data write runs its input through: trimmed text cut to a limit, the limits
 * themselves, the secret guard, and who is making the change.
 *
 * The secret guard refuses text that looks like a key: notes travel into exports and
 * print, and a key pasted into one would travel with them. It matches shapes, never
 * digits: a phone number must stay a phone number.
 */

import { Refused } from "../mail-merge/engine";
import type { Staff } from "./protocol";

export { normaliseEmail } from "../mail-merge/lists";

export const LIMITS = {
  name: 120,
  title: 200,
  file_name: 255,
  folder: 80,
  tag: 40,
  tags: 20,
  notes: 4_000,
  words: 4_000,
  subject: 200,
  referral: 120,
  search: 200,
  reason: 200,
  detail: 400,
  message: 2_000,
  email: 254,
  staff_id: 64,
  staff_name: 120,
} as const;

/** A trimmed string cut to `limit`, or "" when the value is not a string. */
export function clean(value: unknown, limit: number): string {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

const SECRET_SHAPES: readonly RegExp[] = [
  /xkeysib-/i,
  /xsmtpsib-/i,
  /\bghp_[A-Za-z0-9]/,
  /\bgithub_pat_/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bsk-[A-Za-z0-9_-]{20,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

/** Whether text carries something shaped like a password or a key. */
export function looksSecret(text: string): boolean {
  return SECRET_SHAPES.some((shape) => shape.test(text));
}

export const SECRET_MESSAGE =
  "That looks like a password or key. Keep it in your password manager and write where it lives instead.";

/** Refuse free text that looks like a key; returns the text for chaining. */
export function guardSecret(text: string): string {
  if (looksSecret(text)) throw new Refused(400, "secret", SECRET_MESSAGE);
  return text;
}

/** A free-text field: trimmed, cut to `limit`, and never a key. */
export function cleanText(value: unknown, limit: number): string {
  return guardSecret(clean(value, limit));
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROUTE_ID = /^[A-Za-z0-9-]{1,64}$/;

export function isDay(value: unknown): value is string {
  if (typeof value !== "string" || !DAY.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

export function isRouteId(value: unknown): value is string {
  return typeof value === "string" && ROUTE_ID.test(value);
}

/** The `by` every POST carries: who is making the change. Refused when it is missing. */
export function staffOf(body: Record<string, unknown>): Staff {
  const given = body.by;
  const record =
    given && typeof given === "object" && !Array.isArray(given)
      ? (given as Record<string, unknown>)
      : {};
  const staff_id = clean(record.staff_id, LIMITS.staff_id);
  const name = clean(record.name, LIMITS.staff_name);
  if (!staff_id || !name)
    throw new Refused(400, "invalid", "Who is making this change was not given.");
  return { staff_id, name };
}

/** The `attempt` a creating POST carries, when it is a proper id; otherwise null. */
export function attemptOf(body: Record<string, unknown>): string | null {
  return isUuid(body.attempt) ? body.attempt.toLowerCase() : null;
}

/** A whole number from a query or a body, or the fallback. */
export function wholeNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isSafeInteger(parsed) ? parsed : fallback;
}
