/**
 * Devices: limits and sentences (ws-notes/security/spec.md §7.3). Module constants, because
 * `guard.ts` is not edited.
 */

export const LIMIT = {
  devices: 500,
  checks: 1_000,
  acknowledgements: 200,
  holder: 200,
  notes: 2_000,
  model: 120,
  serial: 80,
  os_version: 60,
  by_name: 120,
  note: 1_000,
  why: 300,
  screen_lock_min: 0,
  screen_lock_max: 1_440,
  limit_min: 1,
  limit_max: 1_440,
  months_min: 1,
  months_max: 12,
  screenshots: 5,
  /** A copy comes in one JSON request: base64 grows it by a third, under the service's 6 MB. */
  copy_bytes: 3 * 1024 * 1024,
} as const;

/** Days before a self-check is due that it enters Due. */
export const CHECK_AHEAD_DAYS = 7;

/** Where a self-check's screenshots and an acknowledgement's copy are kept in Files. */
export const FILES_FOLDER = ["Security", "Devices"];

/** A PIN or a password written into a field that might attract one (company §6.3's shape). */
export const PIN = /\b(pin|password|passcode)\b\s*[:=-]?\s*\S/i;

export const SAY = {
  pin: "Write where it is kept, never its password.",
  holder: "Say who holds it.",
  kind: "Choose what kind of device it is.",
  ownership: "Choose Company or Personal.",
  platform: "Choose the system it runs.",
  flag: "Choose Yes, No or Not known.",
  malware: "Choose Yes, No, Not applicable or Not known.",
  notADay: "That is not a day.",
  future: "That day is in the future.",
  returnedCompany: "Only a company device is returned.",
  returnedBefore: "It cannot be returned before it was issued.",
  returned: "That device is returned already.",
  retired: "That device is no longer used for work already.",
  notRetired: "That device is in use.",
  why: "Say why in a few words.",
  workRemoved: "Say whether work accounts were signed out and work data removed.",
  ownershipReturned: "A returned device stays a company device.",
  screenLock: "Type the minutes as a whole number from 0 to 1,440.",
  limit: "Type the limit as a whole number of minutes from 1 to 1,440, or leave it empty.",
  months: "Type the months as a whole number from 1 to 12, or leave it empty.",
  byName: "Say who checked it.",
  screenshots: "Add at most 5 screenshots to one check.",
  screenshotKind: "A screenshot is a picture or a PDF.",
  tooLarge: "That screenshot is over 3 MB. Put it in Files, then choose it from there.",
  empty: "That file is empty.",
  notInFiles: "That file is not in Files.",
  filesMissing: "Files is not set up here yet, so a copy cannot be kept.",
  ackPersonal: "An acknowledgement is for a personal device.",
  ackPolicy: "Choose the personal devices policy from Files.",
  ackHow: "Choose how it was given.",
  ackBy: "Say who gave it.",
  notInUse: "That device is no longer in use.",
  device: "That device is not here.",
  ownerOnly: "This is for the Owner only: it comes from the people ledger.",
  rosterMissing: "The people ledger is not loaded here.",
  person: "That person is not in the people ledger.",
} as const;

export const tooMany = (count: number): string =>
  `Data holds ${count.toLocaleString("en")} at most.`;
