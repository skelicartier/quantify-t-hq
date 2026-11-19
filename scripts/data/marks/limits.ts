/**
 * The trademark register's limits and sentences (ws-notes/duties/spec.md §6.4): module
 * constants, because `guard.ts` is not edited. Each refusal is the sentence the page shows.
 */

export const LIMIT = {
  marks: 500,
  name: 200,
  goods: 2_000,
  application_number: 40,
  people: 200,
  fee_max: 10_000_000,
  class_min: 1,
  class_max: 45,
  journal_number: 40,
  certificate_number: 40,
  srn: 40,
  watch_min: 2,
  watch: 1_000,
  watch_notes: 200,
  notes: 2_000,
  files: 50,
  search: 200,
  /** Due rows start this many days before a clock's day. */
  due_ahead: 30,
} as const;

export const SAY = {
  name: "Give the mark as filed.",
  kind: "Choose word, device or combined.",
  class: "A class is a number from 1 to 45.",
  taken: "That mark and class is already here.",
  fee: "Type the fee as whole rupees, from 1 to 1,00,00,000.",
  flag: "Choose Yes, No or Not known.",
  status: "Choose the status from the list.",
  step: "Choose the step from the list.",
  notADay: "That is not a day.",
  future: "That day is in the future.",
  beforeApplied: "A step cannot be before the application.",
  order: "That step cannot come before the one it answers.",
  needsNotice: "Record the notice first.",
  needsReport: "Record the examination report first.",
  watch: "Write the note in 2 to 1,000 characters.",
  contact: "That contact is not here.",
  mark: "That mark is not here.",
  noExpiry: "Give the new expiry day: the mark has none worked out.",
  expiresBefore: "The new expiry must be after the old one.",
  file: "That file is not in Files.",
  filesMissing: "Files is not set up here yet, so a copy cannot be kept.",
  tooManyFiles: "A mark keeps 50 files at most.",
} as const;

export const tooMany = (count: number): string =>
  `Data holds ${count.toLocaleString("en")} at most.`;
