/**
 * Pen tests and findings: limits and sentences (ws-notes/security/spec.md §8.3). Module
 * constants, because `guard.ts` is not edited.
 */

export const LIMIT = {
  findings: 5_000,
  pen_tests: 200,
  title_min: 3,
  title: 200,
  description: 4_000,
  evidence: 4_000,
  owner: 120,
  why_min: 10,
  why: 500,
  decided_by: 120,
  own_why: 300,
  tester: 120,
  scope: 1_000,
  notes: 4_000,
  change_min: 10,
  change: 300,
  window_min: 1,
  window_max: 365,
  months_min: 1,
  months_max: 24,
  /** The dependency-alert file: bytes, and alerts in it. */
  file_bytes: 3 * 1024 * 1024,
  alerts: 5_000,
  /** A preview is kept this long, in memory. */
  preview_ms: 10 * 60 * 1_000,
  /** The rows a preview shows. */
  sample: 20,
  summary: 200,
  comment: 280,
  search: 200,
  file_name: 255,
} as const;

/** Days into Due before each kind of day. */
export const AHEAD = { finding: 7, pen_test: 30, retest: 7 } as const;

export const SAY = {
  title: "Say what was found in 3 to 200 characters.",
  severity: "Choose the severity from the list.",
  source: "Choose where it came from from the list.",
  sourceByHand: "Dependency alerts come in through the import, not by hand.",
  notADay: "That is not a day.",
  future: "That day is in the future.",
  foundOn: "Give the day it was found.",
  fixedBefore: "It cannot be fixed before it was found.",
  why: "Say why in 10 to 500 characters.",
  ownWhy: "Say why the day moves, in 10 to 300 characters.",
  decidedBy: "Say who decided it.",
  decidedOn: "Give the day it was decided.",
  moveOn: "Give the day it moves to.",
  owner: "Keep the owner to 120 characters.",
  penTest: "That pen test is not here.",
  finding: "That finding is not here.",
  notOpen: "Only an open finding can be changed that way.",
  open: "That finding is open already.",
  tester: "Say who tested it, in at most 120 characters.",
  kind: "Choose a third party or in house.",
  flag: "Choose Yes, No or Not known.",
  scope: "Keep the scope to 1,000 characters.",
  reportBefore: "The report cannot come before the test started.",
  retestBefore: "The retest cannot be done before the report.",
  change: "Say what changed in 10 to 300 characters.",
  window: "Type each window as a whole number of days from 1 to 365.",
  months: "Type the months as a whole number from 1 to 24.",
  tooManyFindings: "Data holds 5,000 findings at most.",
  tooManyPenTests: "Data holds 200 pen tests at most.",
  // the dependency-alert file
  empty: "Choose the file the command saved.",
  tooLarge: "The file is over 3 MB. Save open alerts only: add &state=open to the command.",
  notJson: "This is not the file the command saves. Run it as the page shows, with --slurp.",
  notList: "This is not the file the command saves. Run it as the page shows, with --slurp.",
  tooManyAlerts:
    "The file holds more than 5,000 alerts. Save open alerts only: add &state=open to the command.",
  expired: "That preview has expired. Choose the file again.",
  nothing: "No alert in the file could be read.",
} as const;
