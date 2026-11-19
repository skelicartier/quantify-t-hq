/**
 * Money's own limits and shapes (ws-notes/duties/spec.md §8.3). `guard.ts` holds the limits
 * every module shares and is not edited for this batch; company §6.3's PAN and GSTIN shapes
 * are declared again here, as the spec says.
 */

export const MONEY_LIMITS = {
  category_name: { min: 2, max: 80 },
  ledger: 120,
  schedule_line: 120,
  note: 400,
  vendor_name: { min: 2, max: 200 },
  legal_name: 200,
  country: 60,
  notes: 4_000,
  invoice_number: 60,
  description: 300,
  reference: 80,
  why: { min: 5, max: 300 },
  challan_number: 40,
  bsr: 7,
  customer: { min: 2, max: 200 },
  purpose_code: 5,
  rail: 120,
  fira_number: 80,
  ebrc_number: 80,
  arn: 40,
  basis: 300,
  decided_by: 120,
  agreed_days: { min: 1, max: 365 },
  /** Exchange cost on a card, in per cent: 0 to 10, at most two decimals. */
  card_forex_max: 10,
  /** An invoice may be dated at most this many days ahead of today. */
  invoice_ahead_days: 7,
  search: 200,
} as const;

/** How many records Data keeps of each, retired and cancelled ones included. */
export const MONEY_TOTALS = {
  categories: 120,
  vendors: 2_000,
  bills: 20_000,
  exports: 5_000,
} as const;

/** Due rows join this many days before their day (spec §8.5). */
export const AHEAD = {
  pay: 7,
  deposit: 7,
  edf: 14,
  realise: 60,
  /** A receipt with no FIRA number is due this many days after it came in. */
  fira_after: 14,
} as const;

export const SHAPE = {
  pan: /^[A-Z]{5}\d{4}[A-Z]$/,
  gstin: /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/,
  udyam: /^UDYAM-[A-Z]{2}-\d{2}-\d{7}$/,
  purpose: /^P\d{4}$/,
  fy: /^\d{4}-\d{2}$/,
  /** A PIN or a password written into a note: refused, whatever follows it (company §6.3). */
  pin: /\b(pin|password|passcode)\b\s*[:=-]?\s*\S/i,
  /** Twelve or more digits in a row: a full bank account or card number. Never stored. */
  long_number: /\d{12,}/,
} as const;

export const SAY = {
  pan: "Type the PAN as ten letters and digits, such as AAACQ1234Q.",
  gstin: "Type the GSTIN as 15 letters and digits, such as 01AAACQ1234Q1Z5.",
  udyam: "Type the Udyam number as on the certificate, such as UDYAM-XX-00-0000000.",
  purpose: "A purpose code is P and four digits, such as P0802.",
  choose: "Choose from the list.",
  future: "That day is in the future.",
  notADay: "That is not a day.",
  pin: "Write where it is kept, never its PIN or password.",
  longNumber:
    "Never type a full bank account or card number here: the last four digits are enough.",
} as const;

/** The records the walk and the harness open by a fixed path. */
export const WALK_IDS = {
  bill: "walk-bill",
  vendor: "walk-vendor",
  vendorAbroad: "walk-vendor-abroad",
  exportInvoice: "walk-export",
} as const;
