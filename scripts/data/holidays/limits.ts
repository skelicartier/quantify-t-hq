/**
 * The holiday set's limits (ws-notes/duties/spec.md §7.4). `guard.ts` holds the limits every
 * module shares and is not edited in this batch, so the ones new to it live here.
 */

/** The days a holiday may be on. */
export const HOLIDAY_FIRST_DAY = "2020-01-01";
export const HOLIDAY_LAST_DAY = "2040-12-31";
export const HOLIDAY_FIRST_YEAR = 2020;
export const HOLIDAY_LAST_YEAR = 2040;

export const HOLIDAY_LIMITS = {
  name_min: 2,
  name: 120,
  note: 500,
  /** Holidays in one calendar year. */
  per_year: 60,
  /** Lines in one paste. */
  paste_lines: 60,
  /** The whole paste, in characters. */
  paste: 12_000,
  state_minimum: 30,
  optional_allowance: 10,
  /** Working days counted at once on the page. */
  working_days: 260,
} as const;

/** The agenda lists holidays from today to this many days on. */
export const AGENDA_DAYS = 365;
