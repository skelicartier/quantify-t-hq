/**
 * Regulatory profiles' limits (ws-notes/security/spec.md §9.4). `guard.ts` is not edited this
 * batch, so the limits new to profiles live here.
 */

export const PROFILE_LIMITS = {
  other: 300,
  uk_note: 300,
  words_min: 3,
  words: 300,
  note: 500,
  notes: 2_000,
  why: 300,
  duties: 60,
  profiles: 500,
} as const;

/** Where a duty's copy of the contract goes in Files. */
export const CONTRACT_FOLDER = ["06 Contracts and NDAs"] as const;
