/**
 * Certification, insurance and management reviews: limits and sentences
 * (ws-notes/security/spec.md §8.3). Module constants, because `guard.ts` is not edited.
 */

export const LIMIT = {
  certifications: 50,
  insurance: 200,
  reviews: 200,
  name: 120,
  number: 80,
  scope: 1_000,
  notes: 4_000,
  outcome: 1_000,
  attendees: 500,
  input: 4_000,
  decisions: 4_000,
  actions: 50,
  what_min: 3,
  what: 300,
  months_min: 1,
  months_max: 24,
  search: 200,
} as const;

/** Days into Due before each kind of day (spec §5.4). */
export const AHEAD = {
  stage: 14,
  surveillance: 60,
  expiry: 90,
  insurance: 30,
  review: 30,
  action: 7,
} as const;

/** Reminders on the calendar, in days before. */
export const REMIND = [14, 3] as const;

export const SAY = {
  certification: "That certification is not here.",
  insurance: "That insurance policy is not here.",
  review: "That management review is not here.",
  action: "That action is not here.",
  standard: "Choose the standard from the list.",
  status: "Choose the status from the list.",
  otherName: "Name the standard, in at most 120 characters.",
  name: "Keep names to 120 characters.",
  number: "Keep the number to 80 characters.",
  scope: "Keep the scope to 1,000 characters.",
  notADay: "That is not a day.",
  future: "That day is in the future.",
  expiresAfter: "It must expire after it was issued.",
  endsAfter: "The cover must end after it starts.",
  reportKind: "Choose Type 1 or Type 2.",
  kind: "Choose the kind of cover from the list.",
  insurer: "Name the insurer, in at most 120 characters.",
  currency: "Choose the currency from the list.",
  amount: "Type the amount as a number, such as 1180.50.",
  heldOn: "Give the day it was held.",
  attendees: "Keep who attended to 500 characters.",
  input: "Keep each note to 4,000 characters.",
  what: "Say what is to be done in 3 to 300 characters.",
  owner: "Keep the owner to 120 characters.",
  tooManyActions: "A review holds 50 actions at most.",
  done: "That action is done already.",
  renewed: "That policy has been renewed already.",
  surveillance: "Choose surveillance audit 1 or 2.",
  months: "Type the months as a whole number from 1 to 24.",
  tooMany: "Data holds no more of these here.",
} as const;
