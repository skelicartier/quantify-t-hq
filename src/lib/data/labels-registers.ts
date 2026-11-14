/**
 * The words of the company's registers (ws-notes/company/spec.md §7.7.1): meetings and
 * their resolutions and minutes, the register of members, and the legal-document register.
 * No `server-only`: the service's `meetings`, `members` and `agreements` modules import
 * this file too (relatively), so a word is written once. The contract file's types are
 * retyped here as plain unions, since the portal never imports `scripts/`.
 */

import type { Labelled } from "./labels";

export type MeetingKind = "board" | "agm" | "egm" | "circular";
export type ResolutionKind = "ordinary" | "special" | "board";
export type AgreementStatus = "draft" | "out_for_signature" | "signed" | "expired" | "terminated";
export type MustState = "here" | "missing" | "not_needed" | "not_checked";
export type Flag = "yes" | "no" | "";

export const MEETING_KINDS = {
  board: "Board meeting",
  agm: "AGM",
  egm: "EGM",
  circular: "Resolution by circulation",
} as const;

/** The kind tabs on Meetings: the same kinds, the last one shorter. */
export const MEETING_TABS = {
  board: "Board meeting",
  agm: "AGM",
  egm: "EGM",
  circular: "By circulation",
} as const;

export const MEETING_STATES: Record<"planned" | "held" | "cancelled", Labelled> = {
  planned: { label: "Planned", tone: "attention" },
  held: { label: "Held", tone: "live" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export const MEETING_MODES = {
  in_person: "In person",
  video: "By video",
  hybrid: "In person and by video",
} as const;

export const ATTENDEE_ROLES = {
  director: "Director",
  member: "Member",
  proxy: "Proxy",
  invitee: "Invitee",
  auditor: "Auditor",
  secretary: "Company secretary",
} as const;

export const ATTENDING = { in_person: "In person", video: "By video" } as const;

export const RESOLUTION_KINDS = {
  ordinary: "Ordinary",
  special: "Special",
  board: "Board",
} as const;

export const RESOLUTION_OUTCOMES = {
  passed: "Passed",
  not_passed: "Not passed",
  deferred: "Deferred",
} as const;

export const MGT14_CHOICES = {
  needed: "MGT-14 needed",
  not_needed: "Not needed",
  ask: "Ask your CS",
} as const;

export const MINUTES_STEPS = {
  draft: "Draft sent to the directors",
  comments: "Comments closed",
  signed: "Entered and signed",
} as const;

export const MEMBERS_VIEWS = {
  register: "Register",
  certificates: "Certificates",
  holdings: "Holdings",
} as const;

export const HOLDER_KINDS = {
  person: "A person",
  company: "A company",
  llp: "An LLP",
  trust: "A trust",
  fund: "A fund or syndicate",
  other: "Other",
} as const;

export const RESIDENCIES = {
  resident: "Resident in India",
  non_resident: "Not resident in India",
  "": "Not known",
} as const;

export const SHARE_KINDS = { equity: "Equity", preference: "Preference" } as const;

export const ENTRY_KINDS = {
  subscription: "Subscription to the memorandum",
  allotment: "Allotment",
  transfer_in: "Transfer in",
  transfer_out: "Transfer out",
  conversion_in: "Conversion in",
  conversion_out: "Conversion out",
} as const;

export const AGREEMENT_TYPES = {
  founder_ip: "Founder IP assignment",
  ip_assignment: "IP assignment",
  appointment: "Appointment letter",
  internship: "Internship letter",
  contractor: "Contractor agreement",
  nda: "NDA",
  msa: "Master services agreement",
  order_form: "Order form",
  dpa: "Data processing agreement",
  pilot: "Pilot agreement",
  trial: "Trial agreement",
  investment: "Investment document",
  side_letter: "Side letter",
  vendor: "Vendor terms",
  lease: "Lease or licence",
  other: "Other",
} as const;
export type AgreementType = keyof typeof AGREEMENT_TYPES;

export const AGREEMENT_STATUSES: Record<AgreementStatus, Labelled> = {
  draft: { label: "Draft", tone: "neutral" },
  out_for_signature: { label: "Out for signature", tone: "attention" },
  signed: { label: "Signed", tone: "live" },
  expired: { label: "Expired", tone: "neutral" },
  terminated: { label: "Ended", tone: "neutral" },
};

export const SIGNING = {
  aadhaar_esign: "Aadhaar e-sign",
  dsc: "Digital signature certificate",
  wet_ink: "Signed on paper",
  other: "Another way",
  "": "Not recorded",
} as const;

export const PARTY_KINDS = {
  person: "A person",
  investor: "An investor firm",
  waitlist: "A waitlist firm",
  director: "A director",
  other: "Someone else",
} as const;

export const MUST_STATES: Record<MustState, Labelled> = {
  here: { label: "Here", tone: "live" },
  missing: { label: "Missing", tone: "attention" },
  not_needed: { label: "Not needed yet", tone: "neutral" },
  not_checked: { label: "Not checked here", tone: "neutral" },
};

export const FLAG_WORDS = { yes: "Yes", no: "No", "": "Not known" } as const;

export const NOT_LEGAL_ADVICE = "This is a record to keep, not legal advice.";

// ------------------------------------------------------------------ words for days and numbers

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "12 Dec 2026", as the registers print a calendar day; never shifted into a zone. */
export function dayWords(day: string): string {
  const [year = "", month = "", date = ""] = day.split("-");
  return `${Number(date)} ${MONTHS[Number(month) - 1] ?? ""} ${year}`;
}

/** "12 Dec", for a Due row or a short column. */
export function dayShort(day: string): string {
  const [, month = "", date = ""] = day.split("-");
  return `${Number(date)} ${MONTHS[Number(month) - 1] ?? ""}`;
}

const COUNT = new Intl.NumberFormat("en");
const RUPEES = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

/** 10000 → "10,000". */
export function countWords(value: number): string {
  return COUNT.format(value);
}

/** Whole rupees with Indian grouping: 2500000 → "₹25,00,000". */
export function rupees(amount: number): string {
  return RUPEES.format(amount);
}

/**
 * A share of a whole in words, one decimal, rounded half up, and never a per cent sign:
 * 1250 of 11250 → "11.1 per cent". Whole-number arithmetic, so 0.05 rounds up exactly.
 */
export function perCentWords(part: number, whole: number): string {
  if (whole <= 0) return "0.0 per cent";
  const tenths = Math.floor((part * 2_000 + whole) / (2 * whole));
  return `${Math.floor(tenths / 10)}.${tenths % 10} per cent`;
}

/** "1,250 of 10,000 · 12.5 per cent", the holdings view's words. */
export function ofWords(shares: number, of: number): string {
  return `${countWords(shares)} of ${countWords(of)} · ${perCentWords(shares, of)}`;
}

/** "1,250 of 10,000 equity shares · 12.5 per cent", where the class's kind is known. */
export function holdingWords(shares: number, of: number, kind: "equity" | "preference"): string {
  return `${countWords(shares)} of ${countWords(of)} ${kind} shares · ${perCentWords(shares, of)}`;
}

/** "1–10,000", a certificate's or an entry's distinctive numbers. */
export function rangeWords(range: { from: number; to: number } | null): string {
  return range ? `${countWords(range.from)}–${countWords(range.to)}` : "Not recorded";
}

/** The serial titles of each sequence: "Board meeting 3, 12 Dec 2026". */
export function serialTitle(kind: MeetingKind, serial: number, day: string): string {
  return `${MEETING_KINDS[kind]} ${serial}, ${dayWords(day)}`;
}

/** Whether a meeting is a general meeting (members), where notice counts clear days. */
export const isGeneral = (kind: MeetingKind): boolean => kind === "agm" || kind === "egm";
