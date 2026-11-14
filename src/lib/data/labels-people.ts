/**
 * The words of the people ledger and of touches (ws-notes/company/spec.md §8.9.1). Pure: the
 * service imports this file relatively, so nothing here may import `server-only` or `next/*`.
 */

import type { Labelled } from "./labels";

export const ENGAGEMENT_KINDS = {
  intern: "Intern",
  employee: "Employee",
  contractor: "Contractor",
} as const;
export type EngagementKindKey = keyof typeof ENGAGEMENT_KINDS;

export type PersonStateKey = "starting" | "engaged" | "offboarding" | "ended";

export const PERSON_STATES: Record<PersonStateKey, Labelled> = {
  starting: { label: "Starting", tone: "attention" },
  engaged: { label: "Engaged", tone: "live" },
  offboarding: { label: "Offboarding", tone: "attention" },
  ended: { label: "Ended", tone: "neutral" },
};

/** The People page's tabs; Engaged holds those being offboarded too. */
export const PEOPLE_TABS = {
  engaged: "Engaged",
  starting: "Starting",
  ended: "Ended",
  all: "All",
} as const;
export type PeopleTab = keyof typeof PEOPLE_TABS;

export const DOCUMENT_KINDS = {
  appointment: "Appointment letter",
  internship: "Internship letter",
  contractor: "Contractor agreement",
  nda: "NDA",
  ip_assignment: "IP assignment",
  other: "Other",
} as const;
export type DocumentKindKey = keyof typeof DOCUMENT_KINDS;

/** The documents that are a person's letter: what "Letter" on the People page looks for. */
export const LETTER_KINDS: readonly DocumentKindKey[] = ["appointment", "internship", "contractor"];

export const EVALUATION_OUTCOMES = {
  on_track: "On track",
  needs_support: "Needs support",
  completed: "Completed",
  not_completed: "Not completed",
} as const;
export type EvaluationOutcomeKey = keyof typeof EVALUATION_OUTCOMES;

export const EVALUATIONS = { midpoint: "Midpoint", final: "Final" } as const;
export type EvaluationKey = keyof typeof EVALUATIONS;

/** Which outcomes each evaluation takes. */
export const OUTCOMES_FOR: Record<EvaluationKey, readonly EvaluationOutcomeKey[]> = {
  midpoint: ["on_track", "needs_support"],
  final: ["completed", "not_completed"],
};

export const STIPEND_CURRENCIES = { INR: "Rupees", USD: "US dollars" } as const;
export type StipendCurrency = keyof typeof STIPEND_CURRENCIES;

/** "7th", "21st", "22nd", "23rd", "11th". */
export function ordinal(value: number): string {
  const tens = value % 100;
  if (tens >= 11 && tens <= 13) return `${value}th`;
  switch (value % 10) {
    case 1:
      return `${value}st`;
    case 2:
      return `${value}nd`;
    case 3:
      return `${value}rd`;
    default:
      return `${value}th`;
  }
}

export const PAYS_ON_WORDS = (pays: number | "month_end"): string =>
  pays === "month_end" ? "on the month's last day" : `by the ${ordinal(pays)} of the next month`;

export const TAX_LINE = "Tax: CA to confirm";
export const TAX_HINT =
  "Whether TDS applies to a stipend, and under which section, is your CA's call. Record what was deducted.";
/** The CSV's `tax_treatment`, on every row. */
export const TAX_TREATMENT = "CA to confirm";

export const SYSTEM_SUGGESTIONS = [
  "Email and sign-in",
  "Password manager",
  "Code host",
  "Cloud account",
  "Mail provider",
  "HQ",
  "Shared drives",
  "Chat",
] as const;

export const OFFBOARDING_LINE =
  "Critical systems by the end of the day after the last day; everything else within five days.";
export const OFFBOARDING_SOURCE =
  "https://gitlab.com/gitlab-com/content-sites/handbook/-/raw/main/content/handbook/people-group/offboarding/_index.md";
/** The Due rows' second line for a grant to revoke. */
export const REVOKE_CRITICAL = "Critical: by the end of the day after the last day";
export const REVOKE_OTHER = "Within 5 days of the last day";

export const TOUCH_KINDS = {
  request: "Connection request",
  accepted: "Request accepted",
  message: "Message",
  replied: "They replied",
  comment: "Comment",
  call: "Call",
  met: "Met",
  other: "Other",
} as const;
export type TouchKindKey = keyof typeof TOUCH_KINDS;

export const TOUCH_SUBJECTS = { lead: "Lead", investor: "Investor firm" } as const;

/** About 100 connection requests a week is the commonly cited ceiling. */
export const TOUCH_CEILING = 100;
/** The acceptance warning looks at this many requests at least, over four weeks. */
export const TOUCH_ACCEPT_FLOOR = 10;
export const TOUCH_SOURCES = [
  "https://www.topo.io/blog/linkedin-invitation-limit-guide",
  "https://www.cleverly.co/blog/b2b-outbound-benchmarks",
] as const;
export const TOUCH_CEILING_WARNING =
  "More than 100 connection requests this week. About 100 a week is the commonly cited ceiling.";
export const TOUCH_ACCEPT_WARNING =
  "Fewer than 1 in 5 of the connection requests you logged in the last four weeks were accepted. Below that, the advice is to slow down.";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Jan 2027" for a period "2027-01". */
export function periodWords(period: string): string {
  const [year = "", month = ""] = period.split("-");
  return `${MONTHS[Number(month) - 1] ?? ""} ${year}`;
}

/** "Jan" for a period "2027-01": the People page's short month. */
export function periodMonth(period: string): string {
  return MONTHS[Number(period.slice(5, 7)) - 1] ?? "";
}

/** "14 Jan" of a calendar day, never shifted into a zone. */
export function shortDay(day: string): string {
  const [, month = "", date = ""] = day.split("-");
  return `${Number(date)} ${MONTHS[Number(month) - 1] ?? ""}`;
}

/** "14 Jan 2027" of a calendar day, never shifted into a zone. */
export function longDay(day: string): string {
  const [year = "", month = "", date = ""] = day.split("-");
  return `${Number(date)} ${MONTHS[Number(month) - 1] ?? ""} ${year}`;
}

/** Money in its currency, whole units: "₹15,000", "$1,000" (as `formatMoney` draws it). */
export function moneyText(amount: number, currency: string): string {
  const code = /^[A-Z]{3}$/.test(currency) ? currency : "INR";
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency: code,
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(amount);
}
