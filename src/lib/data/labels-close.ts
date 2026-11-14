/**
 * The words of pilots, buyer diligence, Labs dataset trials and the closing chain
 * (ws-notes/company/spec.md §9.7.1), shared by the service and the pages so a pilot's state
 * or a closing step reads the same on a list, a record and a Due row. Plain words, sentence
 * case, British spelling; no target, bar or "%" anywhere. Nothing here touches a file.
 */

import type { Labelled } from "./labels";

export const PILOT_STATES: Record<"planned" | "running" | "decided", Labelled> = {
  planned: { label: "Planned", tone: "attention" },
  running: { label: "Running", tone: "live" },
  decided: { label: "Decided", tone: "neutral" },
};
export const PILOT_DECISIONS = { go: "Go", no_go: "No-go", extend: "Extended" } as const;
export const PILOT_OWNERS = {
  sponsor: "Sponsor",
  technical: "Technical owner",
  user: "Daily user",
} as const;
export const PILOTS_AT_ONCE = 5;
export const PILOTS_LINE = (n: number): string =>
  `${n} ${n === 1 ? "pilot" : "pilots"} running. Sources suggest about five at once at most; this is a count, not a limit.`;
export const CRITERIA_HINT =
  "Sources agree on three or four measurable criteria, written down before the pilot starts.";
export const REVIEW_OUTCOMES = {
  passed: "Passed",
  conditions: "Passed with conditions",
  failed: "Not passed",
  "": "Not finished",
} as const;
export const REDLINE_STATUSES = {
  with_us: "With us",
  with_them: "With them",
  agreed: "Agreed",
} as const;
export const TRIAL_DECISIONS = { go: "Go", no_go: "No-go" } as const;
export const TRIAL_RENEWAL_LINE = "Trials never renew on their own here.";
export const CLOSING_VIEW = { href: "/data/investors/closing", label: "Closing" } as const;
export const CLOSING_STEPS = {
  documents_sent: "Documents sent",
  documents_signed: "Documents signed",
  offer_letter: "Offer letter (PAS-4)",
  money_received: "Money received",
  bank_kyc: "Bank KYC",
  valuation: "Valuation",
  board_approval: "Board approval",
  allotment: "Allotment",
  register: "Register of members",
  certificate: "Share certificate",
  refund: "Refund",
} as const;
export const ROUND_STEPS = {
  special_resolution: "Special resolution",
  separate_account: "Separate bank account",
  valuation: "Valuation for the round",
  firms_registered: "FIRMS registration",
} as const;
export const VALUATION_KINDS = {
  registered_valuer: "Registered valuer",
  fema: "For FEMA (non-residents)",
  both: "Both",
} as const;
export const POOLED_KINDS = {
  syndicate: "A syndicate",
  fund: "A fund",
  other: "Another pooled holder",
} as const;
export const OFFERS_LINE = (n: number, fy: string, limit: number): string =>
  `${n} offered in ${fy}. The law allows ${limit} a year per class of shares; a syndicate or fund counts once.`;

// ------------------------------------------------------------------ beyond §9.7.1

export type PilotState = keyof typeof PILOT_STATES;
export type ClosingStep = keyof typeof CLOSING_STEPS;
export type RoundStep = keyof typeof ROUND_STEPS;

/** The steps in the order the checklist lists them. */
export const CLOSING_STEP_ORDER = Object.keys(CLOSING_STEPS) as ClosingStep[];

/** A step as its route names it ("money-received") and as its record keeps it ("money_received"). */
export const stepKey = (slug: string): string => slug.replace(/-/g, "_");
export const stepSlug = (key: string): string => key.replace(/_/g, "-");

/** Who goes in the register, after the holder's name: "Walk Fund 281, a fund". */
export const HOLDER_KINDS = {
  person: "a person",
  company: "a company",
  llp: "an LLP",
  trust: "a trust",
  fund: "a fund",
  other: "another kind of holder",
} as const;
export type HolderKindKey = keyof typeof HOLDER_KINDS;

/** The deadlines line: "Allot by 13 Mar 2027", and once done "Allotted 12 Mar 2027". */
export const DEADLINE_WORDS: Record<string, { by: string; done: string }> = {
  allotment: { by: "Allot by", done: "Allotted" },
  refund: { by: "Refund by", done: "Refunded" },
  "pas-3": { by: "PAS-3 by", done: "PAS-3 filed" },
  "register-entry": { by: "Register by", done: "Registered" },
  "share-certificates": { by: "Certificates by", done: "Certificates issued" },
  "fc-gpr": { by: "FC-GPR by", done: "FC-GPR filed" },
};

export const KEY_DATE_STATES: Record<string, Labelled> = {
  coming_up: { label: "Coming up", tone: "attention" },
  in_progress: { label: "In progress", tone: "attention" },
  done: { label: "Done", tone: "live" },
  not_for_us: { label: "Not for us", tone: "neutral" },
  taken_back: { label: "Taken back", tone: "neutral" },
};

export const KEY_DATES_MISSING = "Key dates is not set up here yet, so these dates are not in it.";
export const MEMBERS_MISSING = "The register of members is not set up here yet.";
export const NOT_LEGAL_ADVICE = "This is a record to keep, not legal advice.";
export const CONFIRM_WITH = (who: "CA" | "CS" | "lawyer"): string => `Confirm with your ${who}.`;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parts(day: string): { year: string; month: string; date: number } {
  const [year = "", month = "", date = ""] = day.split("-");
  return { year, month: MONTHS[Number(month) - 1] ?? "", date: Number(date) };
}

/** "13 Nov 2026": a calendar date as written, never shifted into a zone. */
export function dayWords(day: string): string {
  const { year, month, date } = parts(day);
  return `${date} ${month} ${year}`;
}

/** "13 Nov": a calendar date within a line that already says the year, or this year's. */
export function dayShort(day: string): string {
  const { month, date } = parts(day);
  return `${date} ${month}`;
}

/** "2 Nov – 31 Dec 2026", or "2 Dec 2026 – 31 Jan 2027" across a year's turn. */
export function termWords(starts: string | null, ends: string | null): string {
  if (!starts && !ends) return "Not set";
  if (!starts) return `Until ${dayWords(ends ?? "")}`;
  if (!ends) return `From ${dayWords(starts)}`;
  return starts.slice(0, 4) === ends.slice(0, 4)
    ? `${dayShort(starts)} – ${dayWords(ends)}`
    : `${dayWords(starts)} – ${dayWords(ends)}`;
}

/** "₹25,00,000" in Indian grouping, "$25,000" for dollars: whole units, one currency. */
export function moneyWords(amount: number, currency: string): string {
  if (currency === "INR")
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    }).format(amount);
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency: /^[A-Z]{3}$/.test(currency) ? currency : "USD",
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(amount);
}

/** Per currency, sorted by code and joined, never added across currencies. */
export function moneyByCurrency(values: Readonly<Record<string, number>>): string {
  const shown = Object.entries(values)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, amount]) => moneyWords(amount, currency));
  return shown.length ? shown.join(" and ") : "None";
}

/** "12 backers · ₹45,00,000 and $20,000": a pooled holder's backers, currencies kept apart. */
export function backersLine(backers: readonly { amount: number; currency: string }[]): string {
  const totals: Record<string, number> = {};
  for (const backer of backers)
    totals[backer.currency] = (totals[backer.currency] ?? 0) + backer.amount;
  const count = `${backers.length.toLocaleString("en-GB")} ${backers.length === 1 ? "backer" : "backers"}`;
  return backers.length ? `${count} · ${moneyByCurrency(totals)}` : "No backers listed";
}

/** "2 of 4 met", or "Not measured yet" before any result is in. */
export function criteriaMet(criteria: readonly { met: string }[]): string {
  if (criteria.length === 0) return "None written";
  if (criteria.every((criterion) => criterion.met === "")) return "Not measured yet";
  const met = criteria.filter((criterion) => criterion.met === "yes").length;
  return `${met} of ${criteria.length} met`;
}

/** "Name the technical owner at Walk Capital 2000." */
export const NAME_THE_OWNER = (owner: keyof typeof PILOT_OWNERS, firm: string): string =>
  `Name the ${PILOT_OWNERS[owner].toLowerCase()} at ${firm}.`;
