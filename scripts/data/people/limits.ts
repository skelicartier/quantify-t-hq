/**
 * The people ledger's own limits (ws-notes/company/spec.md §8.4). `guard.ts` holds the limits
 * every module shares and is not edited in this batch, so the ones new to it live here.
 */

export const PEOPLE_LIMITS = {
  name: 120,
  role_title: 120,
  mentor: 120,
  brief: 4_000,
  notes: 4_000,
  document_title: 200,
  summary: 4_000,
  certificate_number: 40,
  reference: 80,
  payment_note: 500,
  why: 300,
  system: 80,
  level: 80,
  access_notes: 500,
} as const;

/** How many Data keeps: withdrawn payments and revoked grants included. */
export const PEOPLE_TOTALS = {
  people: 500,
  payments: 5_000,
  access: 50,
  documents: 50,
} as const;

/** A month's stipend: a whole number from 1 to 1,00,00,000. */
export const STIPEND_MAX = 10_000_000;
/** Any amount of money (spec §2 rule 10). */
export const AMOUNT_MAX = 1_000_000_000_000;

/** A document's or certificate's copy comes in one JSON request (base64 grows it by a third). */
export const COPY_MAX_BYTES = 3 * 1024 * 1024;
/** Where the ledger keeps its copies, inside its own folder (never in Files). */
export const COPY_FOLDER = "people/files";

/** A reference that reads like a PIN or a password (the same pattern as the company's §6.3). */
export const PIN_PATTERN = /\b(pin|password|passcode)\b\s*[:=-]?\s*\S/i;

/** Due rows: a stipend from 3 days before its day, an evaluation from 7, a letter 7 before the start. */
export const STIPEND_LEAD_DAYS = 3;
export const EVALUATION_LEAD_DAYS = 7;
export const LETTER_LEAD_DAYS = 7;

/** Offboarding: critical systems by the end of the next day, everything else within 5. */
export const CRITICAL_DAYS = 1;
export const OTHER_DAYS = 5;

/** The person the walk pins under test routes, so the harness can open them by a fixed path. */
export const WALK_PERSON_ID = "walk-intern";
