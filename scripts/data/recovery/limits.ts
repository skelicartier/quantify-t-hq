/**
 * Backups: limits and sentences (ws-notes/security/spec.md §7.3). Module constants, because
 * `guard.ts` is not edited.
 */

export const LIMIT = {
  backups: 200,
  tests: 500,
  name: 120,
  text: 200,
  months_min: 1,
  months_max: 12,
  minutes_max: 100_000,
  what_restored: 500,
  note: 1_000,
  notes: 2_000,
  by_name: 120,
  why: 300,
} as const;

/** Days before a restore test is due that it enters Due. */
export const TEST_AHEAD_DAYS = 14;

/** The calendar reminds him this many days before a restore test. */
export const TEST_REMIND_DAYS = [7] as const;

/** Where a restore test's file is kept in Files. */
export const FILES_FOLDER = ["Security", "Backups"];

export const SAY = {
  name: "Give the backup a name.",
  kind: "Choose what kind of backup it is.",
  hqData: "Data's own backup is already listed.",
  tool: "That tool is not in Systems.",
  toolsMissing: "Tools is not loaded here, so a tool cannot be chosen. Type a name instead.",
  howOften: "Choose how often from the list.",
  flag: "Choose Yes, No or Not known.",
  months: "Type the months between restore tests as a whole number from 1 to 12.",
  minutes: "Type how long it took in whole minutes, from 0 to 100,000, or leave it empty.",
  outcome: "Choose Complete, Partial or Failed.",
  notADay: "That is not a day.",
  future: "That day is in the future.",
  byName: "Say who ran it.",
  why: "Say why in a few words.",
  retired: "That backup is retired already.",
  backup: "That backup is not here.",
} as const;

export const tooMany = (count: number): string =>
  `Data holds ${count.toLocaleString("en")} at most.`;
