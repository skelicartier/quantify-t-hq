/**
 * Diligence's own limits (ws-notes/company/spec.md §9.3). `guard.ts` is not edited this
 * batch, so the limits new to diligence and trials live here.
 */

export const DILIGENCE_LIMITS = {
  note: 2_000,
  name: 120,
  firm: 120,
  role: 120,
  outcome: 400,
  document: 200,
  dataset: 120,
  dictionary_version: 40,
  by_name: 120,
  /** Questions in one questionnaire. */
  questions: 2_000,
  /** Redline rounds on one document. */
  rounds: 50,
  references: 50,
  redlines: 200,
} as const;

/** A questionnaire joins Due this many days before it is due. */
export const QUESTIONNAIRE_AHEAD = 7;
/** A trial's go/no-go joins Due this many days before. */
export const TRIAL_DECIDE_AHEAD = 3;
/** A trial's end joins Due this many days before. */
export const TRIAL_END_AHEAD = 7;

export const NO_CONSENT = "Record their consent first: a reference is shared only once they agree.";
export const NOT_CLEARED =
  "Their compliance team clears a trial before any data goes. Record when it was cleared.";
export const NEVER_RENEWS =
  "A trial never renews on its own here. Agree the next step in writing instead.";
