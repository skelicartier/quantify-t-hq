/**
 * A statement's lines, worked out (ws-notes/duties/spec.md §5.5): each line's fingerprint,
 * so a line imported twice from overlapping files is kept once; whether the lines add up to
 * the bank's own running balance, and where they first do not; and the opening balance a
 * file implies. Pure: no file, no clock. Money is whole minor units.
 */

import { createHash } from "node:crypto";

import { addsUpWords } from "../../../src/lib/data/labels-statements";
import type { AddsUp, ReadLine } from "./types";

/** What a line adds to the balance: money in is plus, money out minus. */
export const movementOf = (line: { direction: "debit" | "credit"; amount_minor: number }) =>
  line.direction === "credit" ? line.amount_minor : -line.amount_minor;

/** The narration as the fingerprint reads it: lower case, runs of spaces made one. */
const narrationKey = (narration: string) => narration.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * `sha256(account_id | posted_on | direction | amount_minor | narration | reference | k)`,
 * `k` the line's place among this file's lines with the same first six parts (0 first), so
 * two real payments of the same amount on the same day to the same payee both stay.
 */
export function fingerprintsOf(accountId: string, lines: readonly ReadLine[]): string[] {
  const seen = new Map<string, number>();
  return lines.map((line) => {
    const head = [
      accountId,
      line.posted_on,
      line.direction,
      String(line.amount_minor),
      narrationKey(line.narration),
      line.reference,
    ].join("|");
    const k = seen.get(head) ?? 0;
    seen.set(head, k + 1);
    return createHash("sha256").update(`${head}|${k}`).digest("hex");
  });
}

/** The opening a file implies: its first line's balance less that line's own movement. */
export function openingFromLines(lines: readonly ReadLine[]): number | null {
  const first = lines[0];
  if (!first || first.balance_minor === null) return null;
  return first.balance_minor - movementOf(first);
}

/** Opening plus every line's movement. */
export const closingFrom = (opening: number, lines: readonly ReadLine[]) =>
  lines.reduce((sum, line) => sum + movementOf(line), opening);

/**
 * Whether each balance the bank printed is the one before it plus the credit less the
 * debit, starting from the opening; the first that is not is named by its line number
 * (its place in the file, oldest first, counted from 1). No balances: `{ ok: null }`.
 */
export function addsUpOf(
  opening: number | null,
  lines: readonly ReadLine[],
  currency: string,
): AddsUp {
  if (!lines.some((line) => line.balance_minor !== null)) return { ok: null };
  let running = opening;
  for (const [index, line] of lines.entries()) {
    const expected = running === null ? null : running + movementOf(line);
    if (line.balance_minor !== null && expected !== null && line.balance_minor !== expected)
      return {
        ok: false,
        at_line: index + 1,
        words: addsUpWords(index + 1, line.balance_minor, expected, currency),
      };
    running = line.balance_minor ?? expected;
  }
  return { ok: true };
}
