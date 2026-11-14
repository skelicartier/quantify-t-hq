/**
 * Touches' own limits (ws-notes/company/spec.md §8.4). `guard.ts` is not edited in this
 * batch, so the ones new to it live here.
 */

export const TOUCH_LIMITS = { subject_name: 200, note: 1_000 } as const;

/** How many Data keeps, withdrawn ones included. */
export const TOUCH_TOTAL = 50_000;

/** One page of the list. */
export const TOUCHES_PAGE = 100;

/** The weeks the page counts, newest first. */
export const TOUCH_WEEKS = 8;

/** The acceptance warning looks back over the 28 days ending today. */
export const ACCEPT_WINDOW_DAYS = 28;

/** A lead's or an investor firm's id: 32 hex. */
export const SUBJECT_ID = /^[0-9a-f]{32}$/;
