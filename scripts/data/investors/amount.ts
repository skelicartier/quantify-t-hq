/**
 * An amount as he types it, read once for every form that takes one: a recorded amount,
 * a cheque bound, the round's cap and its smallest cheque. Nothing here touches a file.
 */

import { clean } from "../guard";

export const MAX_AMOUNT = 1_000_000_000_000;

/** An amount as typed: "50,000", "50000.5", 25_00_000; never negative, never words. */
export function amountValue(value: unknown): number | null {
  const text = typeof value === "number" ? String(value) : clean(value, 40).replace(/[,\s_]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= MAX_AMOUNT ? parsed : null;
}
