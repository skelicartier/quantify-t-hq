/**
 * The policy register: limits and sentences (ws-notes/security/spec.md §8.3). Module
 * constants, because `guard.ts` is not edited.
 */

export const LIMIT = {
  name: 120,
  own_title_min: 3,
  own_title: 120,
  own: 60,
  why_min: 10,
  why: 300,
  note: 4_000,
} as const;

export const SAY = {
  policy: "That policy is not here.",
  owner: "Keep the owner to 120 characters.",
  approvedBy: "Keep who approved it to 120 characters.",
  notADay: "That is not a day.",
  future: "That day is in the future.",
  file: "That document is not in Files.",
  trashed: "That document is in the trash. Restore it in Files first.",
  filesMissing: "Files is not set up here, so no document can be linked.",
  title: "Give the policy a title of 3 to 120 characters.",
  titleTaken: "A policy with that title is already here.",
  tooMany: "Data holds 60 of your own policies at most.",
  why: "Say why it is not needed, in 10 to 300 characters.",
  notNeeded: "That policy is marked not needed already.",
} as const;
