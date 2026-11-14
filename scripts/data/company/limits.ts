/**
 * The company record's limits and shapes (ws-notes/company/spec.md §6.3): module constants,
 * because `guard.ts` is not edited in this batch. Each refusal is the sentence the page
 * shows as it is.
 */

export const LIMIT = {
  legal_name: 200,
  registered_office: 400,
  auditor_name: 120,
  auditor_firm_number: 20,
  note: 200,
  dpiit_number: 40,
  director_name: 120,
  srn: 40,
  address: 400,
  directors: 50,
  changes: 2_000,
} as const;

export const SHAPE = {
  cin: /^[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}$/,
  pan: /^[A-Z]{5}\d{4}[A-Z]$/,
  tan: /^[A-Z]{4}\d{5}[A-Z]$/,
  gstin: /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/,
  din: /^\d{8}$/,
  mobile: /^\+?[0-9][0-9 ()-]{5,38}$/,
  /** A PIN or a password written into a note: refused, whatever follows it. */
  pin: /\b(pin|password|passcode)\b\s*[:=-]?\s*\S/i,
} as const;

export const SAY = {
  cin: "Type the CIN as it is on the certificate: 21 letters and digits, such as U72200JK2025PTC012345.",
  pan: "Type the PAN as ten letters and digits, such as AAACQ1234Q.",
  tan: "Type the TAN as ten letters and digits, such as JMMQ01234A.",
  gstin: "Type the GSTIN as 15 letters and digits, such as 01AAACQ1234Q1Z5.",
  choose: "Choose from the list.",
  future: "That day is in the future.",
  notADay: "That is not a day.",
  incorporatedFirst: "Give the incorporation day first.",
  flag: "Choose Yes, No or Not known.",
  contact: "That contact is not here.",
  pin: "Write where it is kept, never its PIN or password.",
  name: "Give the director's name.",
  din: "A DIN is eight digits.",
  designation: "Choose the designation.",
  ceasedBefore: "A director cannot cease before being appointed.",
  email: "That is not an email address.",
  mobile: "Type the mobile with digits, spaces and + only.",
  field: "Choose what changed: email, mobile or address.",
  appointedBy: "Choose who appointed the auditor: the board or an AGM.",
  group: "Choose which facts to save.",
  director: "That director is not here.",
  change: "That contact change is not here.",
  ceased: "That director has ceased already.",
  filedAlready: "That change is recorded as filed already.",
} as const;

/** "Data holds 50 at most." */
export const tooMany = (count: number): string =>
  `Data holds ${count.toLocaleString("en")} at most.`;
