/**
 * Contacts' own limits (raise spec §6.3). `guard.ts` holds the limits every module shares
 * and is not edited for this batch, so the ones new to it live here.
 */

export const CONTACT_LIMITS = {
  name: 120,
  firm: 200,
  notes: 4_000,
  role: 20,
  search: 200,
} as const;

/** How many contacts Data keeps, archived ones included. */
export const CONTACTS_TOTAL = 2_000;

/** A phone number as typed: digits, spaces, brackets, dashes and a leading +. */
export const PHONE = /^\+?[0-9][0-9 ()-]{5,38}$/;
