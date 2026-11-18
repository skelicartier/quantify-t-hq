/**
 * The batch funnel, counted (ws-notes/delivery/spec.md §5.5). Everything here is pure: it
 * is given the live mailings, Mail merge's written lines, what was read back about
 * delivery, the recorded replies and the waitlist's stages as plain data, and it counts.
 * Every figure is a count of sends, of people or of firms; nothing is estimated, there is
 * no target, and no rate: the page writes ratios as "x of y".
 *
 * A batch is one mailing sent for real. A reply belongs to one batch: of the written lines
 * for its address, the one with the latest time at or before the reply; the earliest when
 * none is before it; none at all is "Not from a batch". A waitlist firm belongs to the
 * batch of the earliest yes that leads to it.
 */

import { OUTCOME_ORDER, POSITIVE_OUTCOMES, type Outcome } from "../../../src/lib/data/labels";
import {
  NO_COUNTS,
  addCounts,
  warningsOf,
  type DeliveryCounts,
  type MailingDelivery,
} from "../../../src/lib/merge/delivery-contracts";

export type FunnelInput = {
  /** The mailings sent for real: one row each. */
  mailings: { mailing_id: string; name: string; lists: string[]; list_ids: string[] }[];
  /** Mail merge's written log: live sends only. */
  written: readonly { email: string; mailing_id: string; at: string }[];
  /** What was read back, by mailing; null when nothing reads delivery here. */
  delivery: ReadonlyMap<string, MailingDelivery> | null;
  replies: readonly {
    reply_id: string;
    email: string;
    outcome: string;
    received_at: string;
    taken_back: boolean;
  }[];
  /** The waitlist firm an address belongs to, or null. */
  entryOf: (email: string) => { entry_id: string; firm: string } | null;
  /** By waitlist entry: its stage now, and every stage a move took it to. */
  stages: ReadonlyMap<string, { stage: string; reached: ReadonlySet<string> }>;
};

export type BatchRow = {
  mailing_id: string;
  name: string;
  /** The batch name: its lists' names. */
  lists: string[];
  list_ids: string[];
  first_sent_at: string;
  last_sent_at: string;
  accepted: number;
  /** null: not read. */
  delivery: DeliveryCounts | null;
  read_at: string | null;
  warning: "attention" | "danger" | null;
  replied: number;
  out_of_office: number;
  by_outcome: Record<Outcome, number>;
  yes: number;
  yes_not_on_waitlist: number;
  joined: number;
  calls_booked: number;
  calls_held: number;
  pilots: number;
};

export type FunnelTotal = Omit<
  BatchRow,
  | "mailing_id"
  | "name"
  | "lists"
  | "list_ids"
  | "first_sent_at"
  | "last_sent_at"
  | "read_at"
  | "warning"
>;

export type Funnel = {
  /** Newest first send first. */
  rows: BatchRow[];
  total: FunnelTotal;
  not_from_a_batch: {
    replied: number;
    out_of_office: number;
    yes: number;
    by_outcome: Record<Outcome, number>;
  };
};

const BOOKED: readonly string[] = ["call_booked", "call_held", "pilot", "customer"];
const HELD: readonly string[] = ["call_held", "pilot", "customer"];
const PILOT: readonly string[] = ["pilot", "customer"];
const OUT_OF_OFFICE = "out_of_office";
const YES = new Set<string>(POSITIVE_OUTCOMES);
const KNOWN = new Set<string>(OUTCOME_ORDER);

const noOutcomes = (): Record<Outcome, number> =>
  Object.fromEntries(OUTCOME_ORDER.map((outcome) => [outcome, 0])) as Record<Outcome, number>;

/** The people of one batch (or of none), by what they answered. */
type People = {
  replied: Set<string>;
  out_of_office: Set<string>;
  yes: Set<string>;
  by_outcome: Map<string, Set<string>>;
};
const noPeople = (): People => ({
  replied: new Set(),
  out_of_office: new Set(),
  yes: new Set(),
  by_outcome: new Map(),
});

function outcomesOf(people: People): Record<Outcome, number> {
  const counts = noOutcomes();
  for (const outcome of OUTCOME_ORDER) counts[outcome] = people.by_outcome.get(outcome)?.size ?? 0;
  return counts;
}

/**
 * The batch a reply belongs to: of the sends to its address, the latest at or before the
 * reply; the earliest when every send came after it; null when the address was never
 * written to.
 */
export function batchOf(
  sends: readonly { mailing_id: string; at: string }[] | undefined,
  receivedAt: string,
): string | null {
  if (!sends || sends.length === 0) return null;
  let before: { mailing_id: string; at: string } | null = null;
  let earliest = sends[0]!;
  for (const send of sends) {
    if (send.at < earliest.at) earliest = send;
    if (send.at <= receivedAt && (before === null || send.at >= before.at)) before = send;
  }
  return (before ?? earliest).mailing_id;
}

/** The worse of a mailing's warnings, or null when there is none. */
export function warningLevelOf(counts: DeliveryCounts | null): "attention" | "danger" | null {
  if (!counts) return null;
  const warnings = warningsOf(counts, "mailing");
  if (warnings.some((warning) => warning.level === "danger")) return "danger";
  return warnings.length > 0 ? "attention" : null;
}

export function funnelOf(input: FunnelInput): Funnel {
  // Each mailing's sends, and each address's sends, from the written log.
  const sentTo = new Map<string, { mailing_id: string; at: string }[]>();
  const sends = new Map<string, { count: number; first: string; last: string }>();
  for (const line of input.written) {
    const known = sentTo.get(line.email);
    if (known) known.push(line);
    else sentTo.set(line.email, [line]);
    const span = sends.get(line.mailing_id);
    if (!span) sends.set(line.mailing_id, { count: 1, first: line.at, last: line.at });
    else {
      span.count += 1;
      if (line.at < span.first) span.first = line.at;
      if (line.at > span.last) span.last = line.at;
    }
  }

  // Who answered what, by the batch each reply belongs to.
  const rowIds = new Set(input.mailings.map((mailing) => mailing.mailing_id));
  const people = new Map<string, People>();
  const outside = noPeople();
  const peopleOf = (mailingId: string | null): People => {
    if (mailingId === null || !rowIds.has(mailingId)) return outside;
    let found = people.get(mailingId);
    if (!found) {
      found = noPeople();
      people.set(mailingId, found);
    }
    return found;
  };
  const live = input.replies
    .filter((reply) => !reply.taken_back)
    .sort(
      (a, b) => a.received_at.localeCompare(b.received_at) || a.reply_id.localeCompare(b.reply_id),
    );
  /** A waitlist entry, and the batch of the earliest yes that leads to it (null: none). */
  const entryBatch = new Map<string, string | null>();
  for (const reply of live) {
    const mailingId = batchOf(sentTo.get(reply.email), reply.received_at);
    const inRow = mailingId !== null && rowIds.has(mailingId);
    const group = peopleOf(mailingId);
    if (reply.outcome === OUT_OF_OFFICE) group.out_of_office.add(reply.email);
    else group.replied.add(reply.email);
    if (KNOWN.has(reply.outcome)) {
      const answered = group.by_outcome.get(reply.outcome);
      if (answered) answered.add(reply.email);
      else group.by_outcome.set(reply.outcome, new Set([reply.email]));
    }
    if (YES.has(reply.outcome)) {
      group.yes.add(reply.email);
      const entry = input.entryOf(reply.email);
      // Replies run oldest first, so the first yes to reach an entry is its earliest.
      if (entry && !entryBatch.has(entry.entry_id))
        entryBatch.set(entry.entry_id, inRow ? mailingId : null);
    }
  }
  const entriesOf = new Map<string, string[]>();
  for (const [entryId, mailingId] of entryBatch) {
    if (mailingId === null) continue;
    const known = entriesOf.get(mailingId);
    if (known) known.push(entryId);
    else entriesOf.set(mailingId, [entryId]);
  }
  const reachedAny = (entryId: string, stages: readonly string[]): boolean => {
    const entry = input.stages.get(entryId);
    if (!entry) return false;
    return stages.some((stage) => entry.stage === stage || entry.reached.has(stage));
  };

  const rows: BatchRow[] = input.mailings.map((mailing) => {
    const span = sends.get(mailing.mailing_id);
    const read = input.delivery?.get(mailing.mailing_id) ?? null;
    const group = people.get(mailing.mailing_id) ?? noPeople();
    const entries = entriesOf.get(mailing.mailing_id) ?? [];
    let notOnWaitlist = 0;
    for (const email of group.yes) if (input.entryOf(email) === null) notOnWaitlist += 1;
    return {
      mailing_id: mailing.mailing_id,
      name: mailing.name,
      lists: [...mailing.lists],
      list_ids: [...mailing.list_ids],
      first_sent_at: span?.first ?? read?.first_sent_at ?? "",
      last_sent_at: span?.last ?? read?.last_sent_at ?? "",
      accepted: read ? read.counts.accepted : (span?.count ?? 0),
      delivery: read ? { ...read.counts } : null,
      read_at: read?.read_at ?? null,
      warning: warningLevelOf(read?.counts ?? null),
      replied: group.replied.size,
      out_of_office: group.out_of_office.size,
      by_outcome: outcomesOf(group),
      yes: group.yes.size,
      yes_not_on_waitlist: notOnWaitlist,
      joined: entries.length,
      calls_booked: entries.filter((id) => reachedAny(id, BOOKED)).length,
      calls_held: entries.filter((id) => reachedAny(id, HELD)).length,
      pilots: entries.filter((id) => reachedAny(id, PILOT)).length,
    };
  });
  rows.sort(
    (a, b) => b.first_sent_at.localeCompare(a.first_sent_at) || a.name.localeCompare(b.name),
  );

  const total: FunnelTotal = {
    accepted: 0,
    delivery: null,
    replied: 0,
    out_of_office: 0,
    by_outcome: noOutcomes(),
    yes: 0,
    yes_not_on_waitlist: 0,
    joined: 0,
    calls_booked: 0,
    calls_held: 0,
    pilots: 0,
  };
  for (const row of rows) {
    total.accepted += row.accepted;
    if (row.delivery) total.delivery = addCounts(total.delivery ?? NO_COUNTS, row.delivery);
    total.replied += row.replied;
    total.out_of_office += row.out_of_office;
    for (const outcome of OUTCOME_ORDER) total.by_outcome[outcome] += row.by_outcome[outcome];
    total.yes += row.yes;
    total.yes_not_on_waitlist += row.yes_not_on_waitlist;
    total.joined += row.joined;
    total.calls_booked += row.calls_booked;
    total.calls_held += row.calls_held;
    total.pilots += row.pilots;
  }

  return {
    rows,
    total,
    not_from_a_batch: {
      replied: outside.replied.size,
      out_of_office: outside.out_of_office.size,
      yes: outside.yes.size,
      by_outcome: outcomesOf(outside),
    },
  };
}
