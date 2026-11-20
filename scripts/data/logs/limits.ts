/**
 * Logs and time: limits and sentences (ws-notes/security/spec.md §7.3). Module constants,
 * because `guard.ts` is not edited.
 */

export const LIMIT = {
  systems: 200,
  looks: 500,
  name: 120,
  where: 200,
  region: 200,
  retention_max: 36_500,
  time_detail: 200,
  note: 1_000,
  notes: 2_000,
  by_name: 120,
  why: 300,
  months_min: 1,
  months_max: 12,
} as const;

/** Direction (iv)'s rolling 180 days, which a retention is read against. */
export const DIRECTION_IV_DAYS = 180;

/** Days before a look is due that it enters Due. */
export const LOOK_AHEAD_DAYS = 14;

/** Where a look's file is kept in Files. */
export const FILES_FOLDER = ["Security", "Logs"];

export const SAY = {
  name: "Give the system a name.",
  nameTaken: "A system with that name is already here.",
  tool: "That tool is not in Systems.",
  toolsMissing: "Tools is not loaded here, so a tool cannot be chosen. Type a name instead.",
  kinds: "Choose what it logs from the list.",
  place: "Choose Yes, Outside India or Not known.",
  timeSource: "Choose the time source from the list.",
  flag: "Choose Yes, No or Not known.",
  retention: "Type the days as a whole number from 0 to 36,500, or leave it empty.",
  months: "Type the months as a whole number from 1 to 12, or leave it empty.",
  notADay: "That is not a day.",
  future: "That day is in the future.",
  byName: "Say who looked.",
  why: "Say why in a few words.",
  retired: "That system is retired already.",
  system: "That system is not here.",
} as const;

export const tooMany = (count: number): string =>
  `Data holds ${count.toLocaleString("en")} at most.`;
