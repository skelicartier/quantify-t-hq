/**
 * One lead, whole: every field and every other column, what was edited, every message
 * real mail carried to them as the sender rendered it, their replies and notes, one
 * timeline, where they stand (stop list, hold, waitlist, follow-up), every place they came
 * from with its raw columns, and their firm. Practice runs and tests never appear: the
 * written log never holds them.
 */

import { LEAD_FIELDS, OUTCOMES, STOP_REASONS } from "../../../src/lib/data/labels";
import type { SenderFiles, Stop } from "../sender-files";
import type { Lead } from "./build";
import type {
  FollowUp,
  InvestorsLookup,
  ReplyRow,
  WaitlistLink,
  WaitlistService,
} from "./contracts";
import type { LeadRecords } from "./edits";
import type { SourceRow } from "./sources";
import {
  LEAD_FIELD_KEYS,
  fieldOf,
  shortDay,
  type ActivityItem,
  type LeadField,
  type LeadNote,
  type LeadRow,
  type LeadSource,
  type SentMail,
  type StopInfo,
} from "./types";

export type LeadDetail = LeadRow & {
  fields: Record<LeadField, string>;
  other: Record<string, string>;
  edited: LeadField[];
  first_written_at: string | null;
  sent: SentMail[];
  replies: ReplyRow[];
  notes: LeadNote[];
  activity: (ActivityItem & { note_id?: string })[];
  stop: StopInfo | null;
  held: { reason: string; source: string } | null;
  firm_hold: { reason: string; firm: string; on: string } | null;
  follow_up: FollowUp | null;
  waitlist: WaitlistLink | null;
  investor: { investor_id: string; firm: string; stage: string } | null;
  stale_in: string | null;
  stale_seen_in: number | null;
  sources: { label: string; values: Record<string, string> }[];
  firm: { domain: string; free_mail: boolean; people: LeadRow[]; total: number };
  /** Mail merge is sending to a list this lead is on: the page refreshes itself. */
  sending_to_them: boolean;
  origin: "hand" | "referral" | "reply" | "copied" | null;
};

export type RecordContext = {
  sender: SenderFiles;
  records: LeadRecords;
  stops: ReadonlyMap<string, Stop>;
  rowOf: (lead: Lead) => LeadRow;
  colleagues: (lead: Lead) => Lead[];
  sourceOf: (sourceId: string) => LeadSource | null;
  sourceRow: (sourceId: string, email: string) => SourceRow | null;
  /** A list row Data remembers that Mail merge no longer holds (a deleted list). */
  seenRow?: (
    listId: string,
    email: string,
  ) => { list: string; values: Record<string, string> } | null;
  replies: () => {
    forEmail(email: string): ReplyRow[];
    followUpsFor(email: string): FollowUp[];
  } | null;
  waitlist: () => WaitlistService | null;
  investors: () => InvestorsLookup | null;
  today: string;
};

const humanise = (key: string): string =>
  key.replace(/_/g, " ").replace(/^\w/, (first) => first.toUpperCase());

/** A row's columns under the labels a person reads (a list's own labels when it has them). */
function labelled(
  values: Readonly<Record<string, string>>,
  labels: ReadonlyMap<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    if (!value) continue;
    out[labels.get(key) ?? (fieldOf(key) ? LEAD_FIELDS[fieldOf(key)!] : humanise(key))] = value;
  }
  return out;
}

export function detailOf(lead: Lead, context: RecordContext): LeadDetail {
  const row = context.rowOf(lead);
  const replies = context.replies();
  const replyRows = replies?.forEmail(lead.email) ?? [];
  const followUps = replies?.followUpsFor(lead.email) ?? [];
  const notes = context.records.notes(lead.lead_id);
  const events = context.records.events(lead.lead_id);
  const sent = context.sender.sentMail(lead.email).sort((a, b) => b.at.localeCompare(a.at));

  // Every other column, from every place they came from: lists first, then files.
  const other: Record<string, string> = {};
  const sources: LeadDetail["sources"] = [];
  for (const member of lead.lists) {
    const list = member.gone ? null : context.sender.list(member.list_id);
    const listRow = list?.rows.find((item) => item.id === member.row_id);
    if (!list || !listRow) {
      // Gone from Mail merge: the values it had when Data last saw it.
      const seen = context.seenRow?.(member.list_id, lead.email);
      if (seen)
        sources.push({
          label: `Mail merge list “${seen.list}” (gone), row ${member.row_id}`,
          values: labelled(seen.values, new Map()),
        });
      continue;
    }
    const labels = new Map(list.columns.map((column) => [column.key, column.label]));
    sources.push({
      label: `Mail merge list “${list.name}”, row ${member.row_id}`,
      values: labelled(listRow.values, labels),
    });
    for (const [key, value] of Object.entries(listRow.values))
      if (value && key !== "email" && !fieldOf(key))
        other[labels.get(key) ?? humanise(key)] = value;
  }
  let staleIn: string | null = null;
  let staleSeen: number | null = null;
  for (const ref of lead.files) {
    const source = context.sourceOf(ref.source_id);
    const sourceRow = context.sourceRow(ref.source_id, lead.email);
    const title = source?.title || "A lead file";
    if (ref.stale && staleIn === null) {
      staleIn = title;
      staleSeen = ref.n;
    }
    sources.push({
      label: `${title}, version ${ref.n}, row ${ref.line}`,
      values: labelled(sourceRow?.values ?? {}, new Map()),
    });
    for (const [key, value] of Object.entries(sourceRow?.values ?? {}))
      if (value && key !== "email" && !fieldOf(key)) other[humanise(key)] = value;
  }
  const manual = context.records.manualFor(lead.email);
  if (manual) {
    const day = shortDay(manual.added_at.slice(0, 10), context.today);
    const label =
      manual.origin === "referral"
        ? `Named by ${manual.referred_by ?? "someone"} on ${day}`
        : manual.origin === "hand"
          ? `Added by hand by ${manual.added_by.name}`
          : manual.origin === "copied"
            ? `Copied on a yes on ${day}`
            : "Added from a reply";
    sources.push({ label, values: labelled(manual.values as Record<string, string>, new Map()) });
  }

  // The stop list, and why it holds them.
  const stopEntry = context.stops.get(lead.email);
  let stop: StopInfo | null = null;
  if (stopEntry) {
    const saidNo = replyRows.some(
      (reply) =>
        !reply.taken_back &&
        reply.outcome === "not_interested" &&
        reply.effects.some((effect) => effect.kind === "stop_added"),
    );
    const byHand = events.some((event) => event.kind === "stop");
    stop = {
      reason: stopEntry.reason,
      at: stopEntry.at,
      detail: stopEntry.detail,
      why: lead.firm_hold ? "firm_hold" : saidNo ? "said_no" : byHand ? "by_hand" : null,
    };
  }

  // One timeline, newest first.
  const activity: LeadDetail["activity"] = [];
  for (const line of context.sender.writtenFor(lead.email))
    activity.push({
      kind: "sent",
      title: `Sent “${line.mailing}”`,
      detail: "",
      at: line.at,
      by: null,
      href: `#sent-${line.mailing_id}`,
    });
  for (const reply of replyRows) {
    activity.push({
      kind: "reply",
      title: `Reply recorded: ${OUTCOMES[reply.outcome].label}`,
      detail: reply.mailing ? `Answering “${reply.mailing}”` : "",
      at: reply.received_at,
      by: reply.recorded_by,
      href: `#reply-${reply.reply_id}`,
    });
    if (reply.taken_back)
      activity.push({
        kind: "take_back",
        title: "Reply taken back",
        detail: OUTCOMES[reply.outcome].label,
        at: reply.taken_back.at,
        by: reply.taken_back.by,
        href: `#reply-${reply.reply_id}`,
      });
  }
  for (const note of notes)
    activity.push({
      kind: "note",
      title: "Note",
      detail: note.text,
      at: note.at,
      by: note.by,
      href: null,
      note_id: note.note_id,
    });
  for (const event of events)
    activity.push({
      kind: event.kind,
      title: event.detail,
      detail: "",
      at: event.at,
      by: event.by,
      href: null,
    });
  if (stopEntry && !events.some((event) => event.kind === "stop"))
    activity.push({
      kind: "stop",
      title: `On the stop list: ${STOP_REASONS[stopEntry.reason]}`,
      detail: "",
      at: stopEntry.at,
      by: null,
      href: null,
    });
  for (const followUp of followUps) {
    activity.push({
      kind: "follow_up",
      title: `Follow-up set: ${followUp.title}`,
      detail: `Due ${shortDay(followUp.due_on, context.today)}`,
      at: followUp.created_at,
      by: null,
      href: null,
    });
    if (followUp.done_at)
      activity.push({
        kind: "follow_up_done",
        title:
          followUp.state === "closed_by_send"
            ? `Follow-up closed: ${followUp.note || "written to again"}`
            : followUp.state === "taken_back"
              ? `Follow-up taken back: ${followUp.title}`
              : `Follow-up done: ${followUp.title}`,
        detail: followUp.state === "done" ? followUp.note : "",
        at: followUp.done_at,
        by: followUp.done_by,
        href: null,
      });
  }
  activity.sort((a, b) => b.at.localeCompare(a.at));

  const colleagues = context.colleagues(lead);
  const openFollowUp =
    followUps
      .filter((followUp) => followUp.state === "open")
      .sort((a, b) => a.due_on.localeCompare(b.due_on))[0] ?? null;
  const sending = context.sender.sending();
  const sendingMailing = sending ? context.sender.mailing(sending.mailing_id) : null;
  const fields = {} as Record<LeadField, string>;
  for (const key of LEAD_FIELD_KEYS) fields[key] = lead.fields[key];

  return {
    ...row,
    fields,
    other,
    edited: [...lead.edited],
    first_written_at: lead.first_at,
    sent,
    replies: replyRows,
    notes,
    activity,
    stop,
    held: lead.held ? { reason: lead.held.reason, source: lead.held.source } : null,
    firm_hold: lead.firm_hold,
    follow_up: openFollowUp,
    waitlist: context.waitlist()?.forEmail(lead.email) ?? null,
    investor: context.investors()?.forEmail?.(lead.email) ?? null,
    stale_in: staleIn,
    stale_seen_in: staleSeen,
    sources,
    firm: {
      domain: lead.firm_key,
      free_mail: !lead.firm_key,
      people: colleagues
        .filter((other) => other !== lead)
        .slice(0, 8)
        .map(context.rowOf),
      total: lead.firm_key ? colleagues.length : 1,
    },
    sending_to_them: Boolean(
      sendingMailing &&
      lead.lists.some((member) => !member.gone && sendingMailing.list_ids.includes(member.list_id)),
    ),
    origin: lead.origin,
  };
}
