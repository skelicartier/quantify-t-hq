/**
 * Pilots' own limits (ws-notes/company/spec.md §9.3). `guard.ts` is not edited this batch,
 * so the limits new to pilots live here.
 */

export const PILOT_LIMITS = {
  criterion: 200,
  target: 200,
  result: 200,
  owner: 120,
  price_note: 200,
  note: 2_000,
  /** Success criteria on one pilot. */
  criteria: 4,
} as const;

/** A check-in is owed this many days after the last one (or the start). */
export const CHECK_IN_DAYS = 7;
/** The go/no-go joins Due this many days before. */
export const DECIDE_AHEAD = 3;
/** The conversion joins Due this many days before. */
export const CONVERT_AHEAD = 7;

/** The pilot the walk pins under test routes, so the harness can open it by a fixed path. */
export const WALK_PILOT_ID = "walk-pilot";
