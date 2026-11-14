/**
 * The register of members' own limits (ws-notes/company/spec.md §7.3). `guard.ts` holds the
 * limits every module shares and is not edited for this batch.
 */

export const MEMBER_LIMITS = {
  class_name: 120,
  nominal_max: 100_000,
  name: 200,
  address: 400,
  id_number: 40,
  nationality: 60,
  backers_note: 1_000,
  shares_max: 1_000_000_000_000,
  money_max: 1_000_000_000_000,
  resolution_words: 300,
  note: 1_000,
  why: 300,
  number: 40,
  stamp_reference: 120,
  search: 200,
} as const;

/** How many of each Data keeps, reversed and cancelled ones included. */
export const MEMBER_TOTALS = { members: 5_000, entries: 20_000, certificates: 5_000 } as const;

/** Entries that bring shares into a class; transfers move shares already there. */
export const ISSUING = new Set(["subscription", "allotment", "conversion_in"]);
/** Entries that take shares out of a folio. */
export const OUTGOING = new Set(["transfer_out", "conversion_out"]);
