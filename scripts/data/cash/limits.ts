/**
 * The cash view's limits (ws-notes/duties/spec.md §7.6). `guard.ts` holds the limits every
 * module shares and is not edited in this batch, so the ones new to it live here.
 */

export const CASH_LIMITS = {
  lines: 200,
  events: 40,
  name_min: 2,
  name: 120,
  /** Per cent a month the collections grow by, at most one decimal. */
  growth_max: 100,
  hire_delay_min: 1,
  hire_delay_max: 12,
  counted_at_max: 100,
} as const;

export const CASH_DEFAULTS = {
  hire_delay_months: 3,
  /** A not-sure line is counted at this share (the research's 80 per cent haircut). */
  counted_at: 20,
  /** The raise lands this many months later in its scenario: fixed. */
  raise_delay_months: 6,
  /** Scenario months, from the month after the opening day. */
  months: 24,
  /** Weeks after "Since the statements". */
  weeks: 13,
} as const;
