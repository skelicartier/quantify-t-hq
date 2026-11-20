/**
 * The tools register's limits and sentences (ws-notes/security/spec.md §6.3): module
 * constants, because `guard.ts` is not edited. Each refusal is the sentence the page shows.
 */

export const LIMIT = {
  tools: 500,
  accounts: 5_000,
  name: 120,
  what: 300,
  business_owner: 200,
  admins: 200,
  legal_name: 200,
  plan: 120,
  seats_max: 100_000,
  notice_max: 365,
  sso_with: 120,
  purpose: 300,
  locations: 200,
  data_location: 200,
  exit: 1_000,
  notes: 2_000,
  holder: 200,
  closed_note: 300,
  review_by: 120,
  review_note: 500,
  why: 300,
  review_months_max: 60,
  search: 200,
} as const;

/** When a row enters Due: a yearly renewal 30 days before its cancel-by day, a monthly one 7. */
export const AHEAD = { yearly: 30, monthly: 7, review: 30 } as const;
/** The calendar's reminders for a renewal. */
export const REMIND_DAYS = [14, 3] as const;

/** A PIN or a password written into a field that might attract one (company spec §6.3). */
export const SHAPE = {
  pin: /\b(pin|password|passcode)\b\s*[:=-]?\s*\S/i,
} as const;

export const SAY = {
  name: "Give the tool a name.",
  nameTaken: (name: string) => `${name} is already in the register.`,
  coverTaken: (name: string, cover: string) => `${name} already stands for ${cover}.`,
  choose: "Choose from the list.",
  holds: "Choose what it holds from the list.",
  seats: "Type the seats as a whole number from 0 to 100,000, or leave it empty.",
  notice: "Type the notice as a whole number of days from 0 to 365, or leave it empty.",
  currency: "Choose the currency from the list.",
  flag: "Choose Yes, No or Not known.",
  notADay: "That is not a day.",
  future: "That day is in the future.",
  pin: "Write where it is kept, never its password.",
  holder: "Give the account's holder as the tool shows it: a name or an address.",
  closedBefore: "It cannot be closed before it was opened.",
  closed: "That account is closed already.",
  notClosed: "That account is open.",
  retired: "That tool is retired.",
  notRetired: "That tool is not retired.",
  why: "Say why in a few words.",
  openAccounts: (count: number) =>
    count === 1
      ? "Close its 1 open account first."
      : `Close its ${count.toLocaleString("en-GB")} open accounts first.`,
  tool: "That tool is not here.",
  account: "That account is not here.",
  person: "That person is not in the people ledger.",
  rosterMissing: "The people ledger is not loaded here.",
  reviewMonths:
    "Type the months as a whole number from 1 to 60, or leave it empty for HQ's default.",
  reviewBy: "Say who looked at it.",
  empty: "The sub-processor list is empty: mark a tool as a sub-processor first.",
} as const;

export const tooMany = (count: number): string =>
  `Data holds ${count.toLocaleString("en")} at most.`;
