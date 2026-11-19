/**
 * The words of the duties batch's rule book and of the holiday set (ws-notes/duties/spec.md
 * §7.2, §7.4), shared by the service and the pages. Pure: no file, no clock. The company
 * batch's `CONFIRM_ROLES` (labels-company) stays as it is for its own rules; a duty rule may
 * also be confirmed by a trademark agent or the AD bank.
 */

/** Who may confirm a duty rule: the company's three, a trademark agent, the AD bank. */
export const DUTY_CONFIRM_ROLES = {
  CA: "CA",
  CS: "CS",
  lawyer: "Lawyer",
  agent: "Trademark agent",
  bank: "Bank",
} as const;
export type DutyConfirmRoleKey = keyof typeof DUTY_CONFIRM_ROLES;
export const isDutyConfirmRole = (value: unknown): value is DutyConfirmRoleKey =>
  typeof value === "string" && Object.prototype.hasOwnProperty.call(DUTY_CONFIRM_ROLES, value);

/** "Confirm with your CA" · "your CS" · "your lawyer" · "your trademark agent" · "your bank". */
export function dutyConfirmWords(role: string): string {
  if (role === "lawyer") return "Confirm with your lawyer";
  if (role === "agent") return "Confirm with your trademark agent";
  if (role === "bank") return "Confirm with your bank";
  return `Confirm with your ${role}`;
}

/** The ten tables of duty rules in Key dates › Rules, in this order, by their captions. */
export const DUTY_AREAS = {
  security: "Security incidents and notices",
  marks: "Trademarks",
  certificates: "Certificates",
  holidays: "Holidays",
  tds: "Tax deducted from Indian vendors",
  msme: "Micro and small suppliers",
  foreign: "Paying vendors abroad",
  export: "Export invoices",
  books: "Books and vouchers",
  thresholds: "Thresholds to watch",
} as const;
export type DutyAreaKey = keyof typeof DUTY_AREAS;

/** The amount field's label in the change form, by a duty rule's unit. */
export const DUTY_UNIT_LABELS = {
  hours: "Hours",
  days: "Days",
  working_days: "Working days",
  months: "Months",
  years: "Years",
  rupees: "Rupees",
  per_cent: "Per cent",
  people: "People",
} as const;
export type DutyUnitKey = keyof typeof DUTY_UNIT_LABELS;

/** The most a duty rule's amount may be, by its unit (§7.2). */
export const DUTY_AMOUNT_MAX: Record<DutyUnitKey, number> = {
  hours: 720,
  days: 3_650,
  working_days: 60,
  months: 120,
  years: 30,
  rupees: 1_000_000_000,
  per_cent: 100,
  people: 1_000,
};

/** A rule nobody confirms: what the Confirmed column says instead. */
export const NOBODY_CONFIRMS = {
  practice: "Your own practice",
  industry: "Industry rule",
} as const;

export const RULE_READINGS_PILL = "Sources disagree";
export const RULE_READINGS_SILENT = "Nothing is worked out from this rule until it is confirmed.";

// ------------------------------------------------------------------ holidays

export const HOLIDAY_KINDS = {
  national: "National holiday",
  state: "State holiday",
  company: "Company holiday",
  optional: "Optional holiday",
} as const;
export type HolidayKindKey = keyof typeof HOLIDAY_KINDS;
export const isHolidayKind = (value: unknown): value is HolidayKindKey =>
  typeof value === "string" && Object.prototype.hasOwnProperty.call(HOLIDAY_KINDS, value);

/** The kind on its own, as the table's Kind column reads. */
export const HOLIDAY_KIND_SHORT = {
  national: "National",
  state: "State",
  company: "Company",
  optional: "Optional",
} as const;

/** 0 Sunday … 6 Saturday. */
export const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** The three national days the one button adds, as month-day and name. */
export const NATIONAL_DAYS = [
  { md: "01-26", name: "Republic Day" },
  { md: "08-15", name: "Independence Day" },
  { md: "10-02", name: "Gandhi Jayanti" },
] as const;

export const NOT_ADVICE_DUTIES =
  "A record and a reminder, not legal, tax or accounting advice. Your CA keeps the books; nothing is filed from here.";

export const HOLIDAYS_MOON =
  "Dates that follow the moon change each year: type them from the state's notified list.";

export const HOLIDAYS_FALLBACK = (year: number): string =>
  `No holidays are recorded for ${year}, so working days are counted Monday to Friday.`;

// ------------------------------------------------------------------ the cash view (§7.6)

export const CASH_ABOUT =
  "What is already known to be coming in and going out, week by week, from the bills, the stipends and what you type. A forecast to think with, not a record. There are no targets here.";

/** What an Admin reads where the stipends would be. */
export const CASH_LEFT_OUT =
  "Stipends are in the people ledger, which is for the Owner only. They are left out here.";

export const CASH_ROWS = {
  bills: "Bills to pay",
  stipends: "Stipends",
  other_out: "Other money out",
  expected_in: "Expected money in",
} as const;

export const CASH_NO_OPENING =
  "No opening figure. Import a statement on Money › Statements, or type one.";
export const CASH_NEEDS_RUPEES = "Needs an opening figure in rupees.";
