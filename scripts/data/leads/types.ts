/**
 * The shapes of All leads (spec §3.4.4) and the few rules every part of the module shares:
 * the lead id, the firm key, which columns are lead fields, and how a calendar day reads
 * in a status line. Nothing here touches a file.
 */

import { createHash } from "node:crypto";

import type { Staff } from "../protocol";
import type { SentMail } from "../sender-files";
import type { LeadField, LeadStatus, Outcome } from "../../../src/lib/data/labels";

export type { LeadField, LeadStatus, Outcome };

export const LEAD_FIELD_KEYS: readonly LeadField[] = [
  "first_name",
  "last_name",
  "full_name",
  "title",
  "company",
  "firm_type",
  "website",
  "country",
  "city",
  "phone",
  "registration_no",
  "source",
  "source_url",
  "email_kind",
  "notes",
];

const FIELD_SET = new Set<string>(LEAD_FIELD_KEYS);

/** Other headings files use for a lead field (the key after Mail merge's `columnKey`). */
const ALIASES: Readonly<Record<string, LeadField>> = {
  name: "full_name",
  contact_name: "full_name",
  investor_name: "full_name",
  firstname: "first_name",
  lastname: "last_name",
  surname: "last_name",
  firm: "company",
  company_name: "company",
  organisation: "company",
  organization: "company",
  job_title: "title",
  designation: "title",
  type: "firm_type",
  url: "website",
  web: "website",
  registration_number: "registration_no",
  source_link: "source_url",
  kind_of_address: "email_kind",
};

/** The lead field a column key fills, or null when it is one of the "other columns". */
export function fieldOf(key: string): LeadField | null {
  if (FIELD_SET.has(key)) return key as LeadField;
  return ALIASES[key] ?? null;
}

export function isLeadField(value: unknown): value is LeadField {
  return typeof value === "string" && FIELD_SET.has(value);
}

/** Free-mail domains: a lead there is not grouped with anyone (spec §3.7). */
export const FREE_MAIL: ReadonlySet<string> = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.in",
  "yahoo.co.uk",
  "ymail.com",
  "outlook.com",
  "hotmail.com",
  "hotmail.co.uk",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "rediffmail.com",
  "zoho.com",
  "yandex.com",
  "gmx.com",
  "mail.com",
]);

/** `sha256("lead:" + email).hex.slice(0, 32)`: stable, safe in a URL, no mapping stored. */
export function leadIdOf(email: string): string {
  return createHash("sha256").update(`lead:${email}`).digest("hex").slice(0, 32);
}

export function domainOf(email: string): string {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1) : "";
}

/** The firm key: the address's domain, or "" for free mail and personal-domain addresses. */
export function firmKeyOf(email: string, emailKind = ""): string {
  const domain = domainOf(email);
  if (!domain || FREE_MAIL.has(domain) || emailKind === "personal-domain") return "";
  return domain;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "9 Nov" in the current year, "9 Nov 2025" otherwise: a calendar day, never shifted. */
export function shortDay(day: string, today: string): string {
  const [year = "", month = "", date = ""] = day.split("-");
  const label = `${Number(date)} ${MONTHS[Number(month) - 1] ?? ""}`.trim();
  return year === today.slice(0, 4) ? label : `${label} ${year}`;
}

/** A place on a Mail merge list; `gone` when Mail merge no longer holds it (Data remembers it). */
export type Membership = { list_id: string; row_id: string; gone?: true };

/** One file a lead came from: the last version that had the row, and whether a newer one dropped it. */
export type FileRef = { source_id: string; n: number; line: number; stale: boolean };

export type ManualLead = {
  lead_id: string;
  email: string;
  values: Partial<Record<LeadField, string>>;
  origin: "hand" | "referral" | "reply" | "copied";
  referred_by: string | null;
  added_at: string;
  added_by: Staff;
};

export type LeadEdit = {
  fields: Partial<Record<LeadField, string>>;
  tags: string[];
  updated_at: string;
  updated_by: Staff;
};

/** The newest reply that has not been taken back, as the replies module tells it. */
export type ReplyMark = {
  reply_id: string;
  outcome: Outcome;
  received_at: string;
  later_until: string | null;
  referral_name: string;
  /** Any reply to the address not taken back said no (not only the newest): never list them. */
  said_no?: boolean;
  /** Where a yes went, from the reply's own effects: the waitlist, Investors, or neither. */
  went?: "waitlist" | "investors" | null;
};

export type LeadRow = {
  lead_id: string;
  email: string;
  name: string;
  title: string;
  company: string;
  firm_type: string;
  city: string;
  country: string;
  domain: string;
  email_kind: string;
  status: LeadStatus;
  status_detail: string;
  status_at: string | null;
  times_written: number;
  last_written_at: string | null;
  last_mailing: string;
  batches: string[];
  tags: string[];
  badges: string[];
};

export type LeadSourceState = "waiting" | "reading" | "read" | "failed";

export type LeftOutRow = { line: number; reason: string; value: string };

export type LeadSource = {
  source_id: string;
  file_id: string;
  role: "leads" | "held_back";
  reason: string;
  added_at: string;
  added_by: Staff;
  state: LeadSourceState;
  detail: string;
  /** The file's title when last seen, so the source still reads after the file is gone. */
  title: string;
  read: {
    at: string;
    version_n: number;
    sha256: string;
    rows: number;
    leads: number;
    left_out_total: number;
    left_out: LeftOutRow[];
  } | null;
};

/** What a timeline entry on a lead reads as. */
export type ActivityItem = {
  kind: string;
  title: string;
  detail: string;
  at: string;
  by: Staff | null;
  href: string | null;
};

export type StopInfo = {
  reason: "manual" | "asked" | "bounced" | "blocked";
  at: string;
  detail: string;
  why: "said_no" | "firm_hold" | "by_hand" | null;
};

export type LeadNote = { note_id: string; text: string; by: Staff; at: string };

export type { SentMail };

/** What another module may say about a lead's standing: a firm hold (Unit 4), badges (Unit 5). */
export type Standing = {
  name: string;
  /** A stop entry this module made: the lead reads "Held back" with this reason. */
  holdFor?: (email: string) => { reason: string; firm: string; on: string } | null;
  badges?: (email: string) => string[];
};
