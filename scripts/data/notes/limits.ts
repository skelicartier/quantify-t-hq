/**
 * Notes' own limits (raise spec §6.3). `guard.ts` holds the limits every module shares and
 * is not edited for this batch, so the ones new to it live here.
 */

export const NOTE_LIMITS = {
  subject_name: 200,
  title: 200,
  body: 8_000,
  people: 200,
  objection: 200,
  /** Objections on one note. */
  objections: 10,
  action_title: 200,
  owner: 120,
  /** Actions on one note. */
  actions: 10,
  faq_question: 300,
  faq_answer: 4_000,
  decision_title: 200,
  why: 4_000,
  decided_by: 120,
  search: 200,
} as const;

/** How many of each Data keeps, withdrawn and archived ones included. */
export const NOTE_TOTALS = { notes: 10_000, faq: 2_000, decisions: 2_000 } as const;

/** One page of a list. */
export const NOTES_PAGE = 100;

/** The note the walk pins under test routes, so the harness can open it by a fixed path. */
export const WALK_NOTE_ID = "walk-note";
