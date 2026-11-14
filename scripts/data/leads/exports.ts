/**
 * The leads' two downloads and the Mail merge list made from a view. "This view" is every
 * matching lead (not the page) with every field and where they stand; "The old tracker" is
 * one row per lead in the founder's SENT TRACKER's columns and words (spec §3.11). Both
 * are CSVs with a byte-order mark and every formula-leading cell defused.
 */

import { localDay } from "../days";
import { toCsv } from "../text";
import { LEAD_STATUSES, OUTCOMES, STOP_REASONS } from "../../../src/lib/data/labels";
import type { Stop } from "../sender-files";
import type { Lead } from "./build";
import type { ReplyMark } from "./types";

export const BOM = "\ufeff";

export const VIEW_COLUMNS = [
  "email",
  "name",
  "first_name",
  "last_name",
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
  "status",
  "status_detail",
  "first_written_on",
  "last_written_on",
  "times_written",
  "last_mailing",
  "batches",
  "reply",
  "reply_on",
  "held_reason",
  "stop_reason",
  "tags",
] as const;

export const TRACKER_COLUMNS = [
  "status",
  "sent_on",
  "sent_in",
  "batch",
  "email",
  "name",
  "company",
  "firm_type",
  "country",
] as const;

export type ExportContext = {
  stops: ReadonlyMap<string, Stop>;
  marks: ReadonlyMap<string, ReplyMark>;
  listName: (listId: string) => string;
  firstList: (lead: Lead) => string;
  /** The status line as the table shows it (with "may have gone" where the send's outcome is unknown). */
  detailOf: (lead: Lead) => string;
};

/** The held-back reason as the tracker words it: "not a buyer", "firm already joined", or as typed. */
function heldWords(reason: string): string {
  const known: Record<string, string> = {
    "not a buyer": "not a buyer",
    "firm already joined": "firm already joined",
    "someone at the firm replied": "someone at the firm replied",
  };
  return known[reason.trim().toLowerCase()] ?? reason;
}

/** The founder's tracker word for a lead's status. */
export function trackerStatus(lead: Lead, stops: ReadonlyMap<string, Stop>): string {
  switch (lead.status) {
    case "not_sent":
      return "Not sent yet";
    case "sent":
      return "Sent";
    case "held_back":
      return `Held back: ${heldWords(lead.detail || "not a buyer")}`;
    case "yes":
      return "Joined waitlist";
    case "no":
      return "Said no";
    case "later":
      return "Replied: later";
    case "question":
      return "Replied: question";
    case "review":
      return "Replied: needs review";
    case "wrong_person":
      return "Replied: wrong person";
    case "stopped": {
      const reason = stops.get(lead.email)?.reason;
      if (reason === "asked") return "Asked to stop";
      if (reason === "bounced") return "Bounced";
      return "Stopped";
    }
  }
}

export function viewCsv(leads: readonly Lead[], context: ExportContext): string {
  const rows = leads.map((lead) => {
    const mark = context.marks.get(lead.email);
    const stop = context.stops.get(lead.email);
    const f = lead.fields;
    return [
      lead.email,
      lead.name,
      f.first_name,
      f.last_name,
      f.title,
      f.company,
      f.firm_type,
      f.website,
      f.country,
      f.city,
      f.phone,
      f.registration_no,
      f.source,
      f.source_url,
      f.email_kind,
      f.notes,
      LEAD_STATUSES[lead.status].label,
      context.detailOf(lead),
      lead.first_at ? localDay(lead.first_at) : "",
      lead.last_at ? localDay(lead.last_at) : "",
      lead.times,
      lead.last_mailing,
      lead.lists
        .map((member) => `${context.listName(member.list_id)}${member.gone ? " (gone)" : ""}`)
        .join("; "),
      mark ? OUTCOMES[mark.outcome].label : "",
      mark ? localDay(mark.received_at) : "",
      lead.firm_hold ? lead.firm_hold.reason || "Firm already joined" : (lead.held?.reason ?? ""),
      stop ? STOP_REASONS[stop.reason] : "",
      lead.tags.join("; "),
    ];
  });
  return BOM + toCsv(VIEW_COLUMNS, rows);
}

export function trackerCsv(leads: readonly Lead[], context: ExportContext): string {
  const rows = leads.map((lead) => {
    const first = context.firstList(lead);
    return [
      trackerStatus(lead, context.stops),
      lead.first_at ? localDay(lead.first_at) : "",
      lead.first_at ? lead.first_mailing : "",
      first ? context.listName(first) : "",
      lead.email,
      lead.name,
      lead.fields.company,
      lead.fields.firm_type,
      lead.fields.country,
    ];
  });
  return BOM + toCsv(TRACKER_COLUMNS, rows);
}

/** The rows a source left out, as a file to fix them in. */
export function leftOutCsv(
  rows: readonly { line: number; reason: string; value: string }[],
): string {
  return (
    BOM +
    toCsv(
      ["line", "why", "value"],
      rows.map((row) => [row.line, row.reason, row.value]),
    )
  );
}

export const LIST_COLUMNS = [
  "email",
  "first_name",
  "last_name",
  "full_name",
  "title",
  "company",
  "firm_type",
  "website",
  "country",
  "city",
] as const;

/** A cell for Mail merge's own reader: quoted when it must be, never altered (it is not a spreadsheet). */
function plainCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** A Mail merge list's file: the people of a view, with the fields a message uses. */
export function listCsv(leads: readonly Lead[]): string {
  const rows = [
    LIST_COLUMNS.join(","),
    ...leads.map((lead) =>
      [
        lead.email,
        lead.fields.first_name || (lead.name.split(/\s+/)[0] ?? ""),
        lead.fields.last_name,
        lead.name,
        lead.fields.title,
        lead.fields.company,
        lead.fields.firm_type,
        lead.fields.website,
        lead.fields.country,
        lead.fields.city,
      ]
        .map(plainCell)
        .join(","),
    ),
  ];
  // No newline after the last row: the bridge counts line breaks against its 5,000 cap.
  return rows.join("\r\n");
}
