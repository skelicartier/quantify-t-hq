/**
 * The waitlist's two downloads (spec §2.6.4, §3.11), and the rows the investor page shows.
 *
 * "Every field" starts with the founder's old header, so the first twelve columns open in
 * whatever read the old file, then adds what HQ knows besides. "For investors" carries no
 * address, no name (the firm's own only when "Name the firm" is chosen), no phone and never
 * the quote: every cell is scrubbed on the way out, whatever was typed into it.
 */

import { localDay } from "../days";
import { toCsv } from "../text";
import { BOM } from "../leads/exports";
import type { LeadRow } from "../leads/types";
import {
  COLLEAGUE_ROLES,
  WAITLIST_PROOF,
  WAITLIST_STAGES,
  type WaitlistStage,
} from "../../../src/lib/data/labels";
import { isFreeMail, type WaitlistEntry, type WaitlistEvent } from "./entries";

/** The founder's old waitlist header, exactly; then what HQ adds. */
export const OLD_HEADER = [
  "joined_on",
  "full_name",
  "title",
  "company",
  "firm_type",
  "city",
  "country",
  "email",
  "how_joined",
  "proof",
  "status",
  "notes",
] as const;
export const INTERNAL_HEADER = [
  ...OLD_HEADER,
  "stage_since",
  "next_step",
  "next_step_on",
  "colleagues",
] as const;

export const INVESTOR_HEADER = [
  "joined_on",
  "firm",
  "firm_type",
  "place",
  "contact_role",
  "how_joined",
  "stage",
  "since",
  "proof",
  "as_of",
] as const;

export type InvestorRow = {
  joined_on: string;
  firm: string;
  named: boolean;
  firm_type: string;
  place: string;
  contact_role: string;
  how_joined: string;
  stage: WaitlistStage;
  since: string;
  proof: "reply" | "call";
  proof_on: string;
};

/** The words a proof's kind reads as: a reply recorded here, or a yes said aloud. */
const SPOKEN = /\b(call|called|calls|phone|phoned|meeting|met|spoke|zoom|video|in person)\b/i;

export function proofKind(entry: WaitlistEntry): "reply" | "call" {
  if (entry.proof.reply_id) return "reply";
  return SPOKEN.test(entry.how_joined) ? "call" : "reply";
}

const ADDRESS = /[^\s@<>(),;:"']*@[^\s@<>(),;:"']*/g;
const PHONE = /\+?\d[\d\s().-]{6,}\d/g;
const LONG_DIGITS = /\d{8,}/g;
/** A calendar date is not a phone, however many digits it has. */
const DATE_LIKE = /^(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}-\d{1,2}-\d{4})$/;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Text fit for an investor: no address (nor any "@"), no phone-shaped run, no run of
 * eight digits, and none of the names given (people on file at the firm, and the firm
 * itself when it is only described).
 */
export function scrub(
  text: string,
  names: readonly string[] = [],
  firms: readonly string[] = [],
): string {
  let out = text.replace(ADDRESS, "").replace(/@/g, "");
  out = out.replace(PHONE, (run) =>
    run.replace(/\D/g, "").length >= 8 && !DATE_LIKE.test(run.trim()) ? "" : run,
  );
  out = out.replace(LONG_DIGITS, "");
  const replace = (words: readonly string[], by: string) => {
    // Longest first, so "Ravi Shah" goes before "Ravi" could leave "Shah" behind.
    for (const word of [...words].sort((a, b) => b.length - a.length)) {
      const trimmed = word.trim();
      if (trimmed.length < 3) continue;
      out = out.replace(new RegExp(`\\b${escapeRegExp(trimmed)}\\b`, "gi"), by);
    }
  };
  replace(firms, "the firm");
  replace(names, "someone there");
  // What is left where something was taken out: empty brackets and quotes, a label with
  // nothing after it ("ref", "tel"), doubled or trailing punctuation.
  return out
    .replace(/\(\s*(?:ref|no\.?|tel|phone|mobile|email|e-mail)?\s*[.:]?\s*\)/gi, "")
    .replace(/“\s*”|"\s*"/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/([,;:])(?:\s*[,;:])+/g, "$1")
    .replace(/[\s,;:]+$/, "")
    .trim();
}

export type ExportContext = {
  lead: (email: string) => LeadRow | null;
  /** Everyone on file at the firm (for the names an investor must never read). */
  atFirm: (entry: WaitlistEntry) => LeadRow[];
};

/** One firm as investors read it. */
export function investorRow(entry: WaitlistEntry, context: ExportContext): InvestorRow {
  const contact = context.lead(entry.contact_email);
  const named = entry.naming === "named";
  const people = context.atFirm(entry);
  const names = new Set<string>();
  for (const person of people) {
    if (person.name) names.add(person.name);
    for (const part of person.name.split(/\s+/)) if (part.length >= 4) names.add(part);
  }
  if (contact?.name) names.add(contact.name);
  const hidden = [...names];
  const firms: string[] = [];
  if (!named) {
    if (entry.firm) firms.push(entry.firm);
    if (entry.domain && !isFreeMail(entry)) firms.push(entry.domain);
  }
  const place = [entry.city, entry.country].filter(Boolean).join(", ");
  // Names are taken out of the free text only: a firm type, a place or a title is a word
  // list, and scrubbing names from it could only spoil it.
  return {
    joined_on: entry.joined_on,
    firm:
      (named ? scrub(entry.firm) : scrub(entry.described_as, hidden)) || "A firm on the waitlist",
    named,
    firm_type: scrub(entry.firm_type),
    place: scrub(place),
    contact_role: scrub(contact?.title ?? ""),
    how_joined: scrub(entry.how_joined, hidden, firms),
    stage: entry.stage,
    since: entry.stage_since,
    proof: proofKind(entry),
    proof_on: entry.joined_on,
  };
}

/** The investor CSV: the page's columns plus `as_of`, with a byte-order mark. */
export function investorCsv(rows: readonly InvestorRow[], asOf: string): string {
  return (
    BOM +
    toCsv(
      INVESTOR_HEADER,
      rows.map((row) => [
        row.joined_on,
        row.firm,
        row.firm_type,
        row.place,
        row.contact_role,
        row.how_joined,
        WAITLIST_STAGES[row.stage].label,
        row.since,
        `${WAITLIST_PROOF[row.proof]}, ${row.proof_on}`,
        asOf,
      ]),
    )
  );
}

/** "Their words (subject “Re: …”, 2026-11-10)", as the old file kept the proof. */
export function proofText(entry: WaitlistEntry): string {
  const day = entry.proof.received_at ? localDay(entry.proof.received_at) : entry.joined_on;
  const subject = entry.proof.subject ? `subject “${entry.proof.subject}”, ` : "";
  const quote = entry.proof.quote.trim();
  if (!quote && !subject) return "";
  return `${quote}${quote ? " " : ""}(${subject}${day})`;
}

/** Every field, the old twelve first. */
export function internalCsv(
  entries: readonly WaitlistEntry[],
  events: ReadonlyMap<string, readonly WaitlistEvent[]>,
  context: ExportContext,
): string {
  const rows = entries.map((entry) => {
    const contact = context.lead(entry.contact_email);
    const notes = (events.get(entry.entry_id) ?? [])
      .filter((event) => (event.kind === "note" || event.kind === "call") && event.text)
      .map((event) => event.text!.replace(/\s+/g, " "))
      .join(" | ");
    const colleagues = entry.people
      .filter((person) => person.email !== entry.contact_email)
      .map((person) =>
        person.role === "not_set"
          ? person.email
          : `${person.email} (${COLLEAGUE_ROLES[person.role] ?? person.role})`,
      )
      .join("; ");
    return [
      entry.joined_on,
      contact?.name ?? "",
      contact?.title ?? "",
      entry.firm,
      entry.firm_type,
      entry.city,
      entry.country,
      entry.contact_email,
      entry.how_joined,
      proofText(entry),
      WAITLIST_STAGES[entry.stage].label,
      notes,
      entry.stage_since,
      entry.next_step,
      entry.next_step_on ?? "",
      colleagues,
    ];
  });
  return BOM + toCsv(INTERNAL_HEADER, rows);
}
