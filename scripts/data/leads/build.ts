/**
 * The leads index: one compact record per normalised address, built from Mail merge's
 * lists, the lead source files (every version), held-back files, Data's own manual leads
 * and edits, and the written log, in that order (spec §3.7). A later value fills or
 * replaces an earlier one only when it is not empty; an edit always wins.
 *
 * A lead's status is worked out on demand from the newest reply, the stop list, the
 * written log and a hold, against a version number every change bumps, so a query never
 * reads a status older than the last thing that happened.
 */

import type { SenderList, Stop, Written } from "../sender-files";
import type { GoneRows } from "./seen-lists";
import { localDay } from "../days";
import { STOP_REASONS, type LeadStatus } from "../../../src/lib/data/labels";
import type { SourceRow } from "./sources";
import {
  LEAD_FIELD_KEYS,
  domainOf,
  fieldOf,
  firmKeyOf,
  leadIdOf,
  shortDay,
  type FileRef,
  type LeadEdit,
  type LeadField,
  type LeadSource,
  type ManualLead,
  type Membership,
  type ReplyMark,
  type Standing,
} from "./types";

export const STEP = 5_000;
export const MAX_LEADS = 200_000;

export type Lead = {
  lead_id: string;
  email: string;
  domain: string;
  firm_key: string;
  fields: Record<LeadField, string>;
  edited: LeadField[];
  lists: Membership[];
  files: FileRef[];
  held: { reason: string; source: string; at: string } | null;
  origin: ManualLead["origin"] | null;
  referred_by: string | null;
  tags: string[];
  times: number;
  first_at: string | null;
  first_mailing: string;
  last_at: string | null;
  last_mailing: string;
  last_mailing_id: string;
  name: string;
  sort_name: string;
  sort_firm: string;
  search: string;
  /** The status, as of index version `sv`. */
  sv: number;
  status: LeadStatus;
  detail: string;
  status_at: string | null;
  firm_hold: { reason: string; firm: string; on: string } | null;
};

export type BuildInputs = {
  /** Oldest first, so a newer list's values win. */
  lists: readonly SenderList[];
  /** List rows Data remembers that Mail merge no longer holds: the leads stay, batch gone. */
  gone?: readonly GoneRows[];
  /** In the order added: lead files, then held-back files. */
  sources: readonly { source: LeadSource; rows: Iterable<SourceRow> }[];
  manual: readonly ManualLead[];
  edits: Readonly<Record<string, LeadEdit>>;
  written: readonly Written[];
};

const REPLY_STATUS: Record<ReplyMark["outcome"], LeadStatus> = {
  replied_positive: "yes",
  meeting_request: "yes",
  not_interested: "no",
  not_now: "later",
  out_of_office: "later",
  wrong_person: "wrong_person",
  question: "question",
  needs_review: "review",
};

export const REPLY_STATUSES: ReadonlySet<LeadStatus> = new Set([
  "yes",
  "later",
  "question",
  "review",
  "wrong_person",
  "no",
]);

function blankFields(): Record<LeadField, string> {
  const fields = {} as Record<LeadField, string>;
  for (const key of LEAD_FIELD_KEYS) fields[key] = "";
  return fields;
}

function nameOf(fields: Record<LeadField, string>): string {
  return (
    fields.full_name || [fields.first_name, fields.last_name].filter(Boolean).join(" ")
  ).slice(0, 200);
}

export type StatusContext = {
  stops: ReadonlyMap<string, Stop>;
  marks: ReadonlyMap<string, ReplyMark>;
  standings: readonly Standing[];
  listName: (listId: string) => string;
  today: string;
};

export class LeadsIndex {
  readonly byEmail = new Map<string, Lead>();
  readonly byId = new Map<string, Lead>();
  readonly byFirm = new Map<string, Lead[]>();
  /** In the order first met. */
  readonly all: Lead[] = [];
  readonly listNames = new Map<string, string>();
  /** A list's place, oldest first: "the first Mail merge list" of a lead. */
  readonly listOrder = new Map<string, number>();
  /** Lists deleted in Mail merge that leads were on; their names are kept in `listNames`. */
  readonly goneLists = new Set<string>();
  version = 1;
  built_at = "";
  read_at = "";
  /** Rows read from lists and files, for "Mail merge lists: {n} rows". */
  list_rows = 0;
  #sorted = new Map<string, { version: number; leads: Lead[] }>();

  get size(): number {
    return this.all.length;
  }

  bump(): void {
    this.version += 1;
  }

  lead(email: string): Lead | null {
    return this.byEmail.get(email) ?? null;
  }

  /** The lead for an address, made when it is new. */
  ensure(email: string): Lead {
    const known = this.byEmail.get(email);
    if (known) return known;
    const lead: Lead = {
      lead_id: leadIdOf(email),
      email,
      domain: domainOf(email),
      firm_key: firmKeyOf(email),
      fields: blankFields(),
      edited: [],
      lists: [],
      files: [],
      held: null,
      origin: null,
      referred_by: null,
      tags: [],
      times: 0,
      first_at: null,
      first_mailing: "",
      last_at: null,
      last_mailing: "",
      last_mailing_id: "",
      name: "",
      sort_name: "",
      sort_firm: "",
      search: "",
      sv: 0,
      status: "not_sent",
      detail: "",
      status_at: null,
      firm_hold: null,
    };
    this.byEmail.set(email, lead);
    this.byId.set(lead.lead_id, lead);
    this.all.push(lead);
    return lead;
  }

  /** A row's columns over a lead's fields: a non-empty value fills or replaces. */
  static merge(lead: Lead, values: Readonly<Record<string, string>>): void {
    for (const [key, raw] of Object.entries(values)) {
      const field = fieldOf(key);
      if (!field) continue;
      const value = typeof raw === "string" ? raw.trim() : "";
      if (value) lead.fields[field] = value;
    }
  }

  /** Name, firm key, search text and sort keys, after the fields changed. */
  derive(lead: Lead): void {
    lead.name = nameOf(lead.fields);
    lead.firm_key = firmKeyOf(lead.email, lead.fields.email_kind);
    lead.sort_name = (lead.name || lead.email).toLowerCase();
    lead.sort_firm = lead.fields.company.toLowerCase();
    const batches = lead.lists.map((member) => this.listNames.get(member.list_id) ?? "");
    lead.search = [
      lead.email,
      lead.name,
      lead.fields.company,
      lead.fields.title,
      lead.fields.city,
      lead.fields.country,
      lead.domain,
      ...batches,
    ]
      .join(" ")
      .toLowerCase();
  }

  #groupFirms(): void {
    this.byFirm.clear();
    for (const lead of this.all) {
      if (!lead.firm_key) continue;
      const group = this.byFirm.get(lead.firm_key);
      if (group) group.push(lead);
      else this.byFirm.set(lead.firm_key, [lead]);
    }
  }

  /** Move a lead into its firm's group after its firm key may have changed. */
  regroup(lead: Lead, previousKey: string): void {
    if (previousKey === lead.firm_key) {
      if (lead.firm_key && !this.byFirm.get(lead.firm_key)?.includes(lead)) {
        const group = this.byFirm.get(lead.firm_key);
        if (group) group.push(lead);
        else this.byFirm.set(lead.firm_key, [lead]);
      }
      return;
    }
    if (previousKey) {
      const before = this.byFirm.get(previousKey)?.filter((item) => item !== lead) ?? [];
      if (before.length) this.byFirm.set(previousKey, before);
      else this.byFirm.delete(previousKey);
    }
    if (lead.firm_key) {
      const group = this.byFirm.get(lead.firm_key);
      if (group) group.push(lead);
      else this.byFirm.set(lead.firm_key, [lead]);
    }
  }

  /** One written line: counts, first and last send. */
  applyWritten(line: Written): Lead {
    const lead = this.ensure(line.email);
    lead.times += 1;
    if (!lead.first_at || line.at < lead.first_at) {
      lead.first_at = line.at;
      lead.first_mailing = line.mailing;
    }
    if (!lead.last_at || line.at >= lead.last_at) {
      lead.last_at = line.at;
      lead.last_mailing = line.mailing;
      lead.last_mailing_id = line.mailing_id;
    }
    return lead;
  }

  applyManual(manual: ManualLead): Lead {
    const lead = this.ensure(manual.email);
    LeadsIndex.merge(lead, manual.values as Record<string, string>);
    lead.origin = manual.origin;
    lead.referred_by = manual.referred_by;
    return lead;
  }

  applyEdit(lead: Lead, edit: LeadEdit): void {
    for (const [key, value] of Object.entries(edit.fields)) {
      const field = key as LeadField;
      if (!LEAD_FIELD_KEYS.includes(field)) continue;
      lead.fields[field] = typeof value === "string" ? value : "";
      if (!lead.edited.includes(field)) lead.edited.push(field);
    }
    lead.tags = Array.isArray(edit.tags) ? [...edit.tags] : [];
  }

  /**
   * Build from nothing, in steps of 5,000 rows: `step(done, total)` runs between steps so
   * the worker can post progress and let messages in.
   */
  static async build(
    inputs: BuildInputs,
    step: (done: number, total: number) => Promise<void>,
    now: string,
  ): Promise<LeadsIndex> {
    const index = new LeadsIndex();
    let total = inputs.written.length + inputs.manual.length;
    for (const list of inputs.lists) total += list.rows.length;
    for (const part of inputs.gone ?? []) total += part.rows.length;
    const sourceRows = inputs.sources.map(({ source, rows }) => ({
      source,
      rows: [...rows],
    }));
    for (const { rows } of sourceRows) total += rows.length;
    let done = 0;
    let sinceStep = 0;
    const tick = async (): Promise<void> => {
      done += 1;
      sinceStep += 1;
      if (sinceStep >= STEP) {
        sinceStep = 0;
        await step(done, total);
      }
    };
    await step(0, total);

    // 1. Mail merge lists, oldest first.
    inputs.lists.forEach((list, position) => {
      index.listNames.set(list.id, list.name);
      index.listOrder.set(list.id, position);
    });
    // Before them, what Data remembers of rows Mail merge no longer holds (a deleted list, a
    // person taken off one): the lead stays, with the fields it had when last seen.
    for (const part of inputs.gone ?? []) {
      if (!index.listNames.has(part.list_id)) index.listNames.set(part.list_id, part.name);
      if (part.deleted) index.goneLists.add(part.list_id);
      for (const row of part.rows) {
        const lead = index.ensure(row.email);
        if (!lead.lists.some((member) => member.list_id === part.list_id))
          lead.lists.push({ list_id: part.list_id, row_id: row.id, gone: true });
        LeadsIndex.merge(lead, row.values ?? {});
        if (!lead.fields.full_name && !lead.fields.first_name && row.name)
          lead.fields.full_name = row.name;
        await tick();
      }
    }
    for (const list of inputs.lists) {
      for (const row of list.rows) {
        if (typeof row?.email !== "string" || !row.email) {
          await tick();
          continue;
        }
        const lead = index.ensure(row.email);
        if (!lead.lists.some((member) => member.list_id === list.id))
          lead.lists.push({ list_id: list.id, row_id: row.id });
        LeadsIndex.merge(lead, row.values ?? {});
        if (!lead.fields.full_name && !lead.fields.first_name && row.name)
          lead.fields.full_name = row.name;
        index.list_rows += 1;
        await tick();
      }
    }
    // A lead on a list Mail merge holds now needs no memory of the lists it has left: a gone
    // place reads only for a lead on no list at all. Re-packing the drafts would otherwise hang
    // every lead's old list beside its new one.
    for (const lead of index.byEmail.values()) {
      if (lead.lists.some((member) => !member.gone) && lead.lists.some((member) => member.gone))
        lead.lists = lead.lists.filter((member) => !member.gone);
    }
    // 2 and 3. Lead files in the order added, then held-back files (their rows are leads too).
    const ordered = [
      ...sourceRows.filter(({ source }) => source.role === "leads"),
      ...sourceRows.filter(({ source }) => source.role === "held_back"),
    ];
    for (const { source, rows } of ordered) {
      for (const row of rows) {
        const lead = index.ensure(row.email);
        LeadsIndex.merge(lead, row.values);
        if (!lead.files.some((ref) => ref.source_id === source.source_id))
          lead.files.push({
            source_id: source.source_id,
            n: row.n,
            line: row.line,
            stale: row.stale,
          });
        if (source.role === "held_back" && !row.stale)
          lead.held = {
            reason: source.reason || "Not a buyer",
            source: source.title,
            at: source.read?.at ?? source.added_at,
          };
        await tick();
      }
    }
    // 4. Data's own records: manual leads, then edits.
    for (const manual of inputs.manual) {
      index.applyManual(manual);
      await tick();
    }
    for (const [leadId, edit] of Object.entries(inputs.edits)) {
      const lead = index.byId.get(leadId);
      if (lead) index.applyEdit(lead, edit);
    }
    // 5. The written log: everyone real mail reached is a lead, even off every list now.
    for (const line of inputs.written) {
      index.applyWritten(line);
      await tick();
    }
    for (const lead of index.all) index.derive(lead);
    index.#groupFirms();
    await step(total, total);
    index.built_at = now;
    index.read_at = now;
    return index;
  }

  // ------------------------------------------------------------------ status

  /** The lead's status as of now: reply, then stop list, then a send, then a hold. */
  status(lead: Lead, context: StatusContext): Lead {
    if (lead.sv === this.version) return lead;
    lead.sv = this.version;
    lead.firm_hold = null;
    const mark = context.marks.get(lead.email);
    if (mark) {
      const day = localDay(mark.received_at);
      lead.status = REPLY_STATUS[mark.outcome];
      lead.status_at = mark.received_at;
      switch (mark.outcome) {
        case "replied_positive":
        case "meeting_request":
          lead.detail =
            mark.went === "waitlist"
              ? `${shortDay(day, context.today)} · on the waitlist`
              : mark.went === "investors"
                ? `${shortDay(day, context.today)} · in Investors`
                : shortDay(day, context.today);
          break;
        case "not_interested":
          // Read from the stop list itself: the entry can have been taken off by hand since.
          lead.detail = `${shortDay(day, context.today)} · ${context.stops.has(lead.email) ? "on the stop list" : "not on the stop list"}`;
          break;
        case "not_now":
          lead.detail = mark.later_until
            ? `Write again ${shortDay(mark.later_until, context.today)}`
            : "Write again later";
          break;
        case "out_of_office":
          lead.detail = mark.later_until
            ? `Out of office until ${shortDay(mark.later_until, context.today)}`
            : "Out of office";
          break;
        case "question":
          lead.detail = `${shortDay(day, context.today)} · answer due`;
          break;
        case "needs_review":
          lead.detail = `${shortDay(day, context.today)} · decide what it means`;
          break;
        case "wrong_person":
          lead.detail = mark.referral_name ? `Named ${mark.referral_name}` : "Named someone else";
          break;
      }
      return lead;
    }
    const stop = context.stops.get(lead.email);
    if (stop) {
      for (const standing of context.standings) {
        const hold = standing.holdFor?.(lead.email) ?? null;
        if (hold) {
          lead.firm_hold = hold;
          break;
        }
      }
      lead.status_at = stop.at || null;
      if (lead.firm_hold) {
        lead.status = "held_back";
        lead.detail = lead.firm_hold.reason || "Firm already joined";
      } else {
        lead.status = "stopped";
        lead.detail = STOP_REASONS[stop.reason] ?? "Added by hand";
      }
      return lead;
    }
    if (lead.times > 0 && lead.last_at) {
      lead.status = "sent";
      lead.status_at = lead.last_at;
      lead.detail = `${shortDay(localDay(lead.last_at), context.today)} · ${lead.last_mailing}`;
      return lead;
    }
    if (lead.held) {
      lead.status = "held_back";
      lead.status_at = lead.held.at;
      lead.detail = lead.held.reason;
      return lead;
    }
    lead.status = "not_sent";
    lead.status_at = null;
    const first = this.firstList(lead);
    lead.detail = first
      ? `On ${context.listName(first)}`
      : lead.lists.length > 0
        ? "On no list now"
        : "On no list yet";
    return lead;
  }

  /** A batch as a row shows it: a list (or a place on one) Mail merge no longer holds reads as gone. */
  batchName(member: Membership): string {
    const name = this.listNames.get(member.list_id) ?? "";
    return name && member.gone ? `${name} (gone)` : name;
  }

  /** The lead's first Mail merge list by the lists' own order (oldest first); gone ones are not. */
  firstList(lead: Lead): string {
    let best = "";
    let bestAt = Number.POSITIVE_INFINITY;
    for (const member of lead.lists) {
      if (member.gone) continue;
      const at = this.listOrder.get(member.list_id) ?? Number.POSITIVE_INFINITY;
      if (at < bestAt) {
        best = member.list_id;
        bestAt = at;
      }
    }
    return best;
  }

  refreshAll(context: StatusContext): void {
    for (const lead of this.all) this.status(lead, context);
  }

  // ------------------------------------------------------------------ sort orders

  /** Every lead in a sort's order, kept until the next change. */
  sorted(key: SortKey, context: StatusContext): Lead[] {
    const cached = this.#sorted.get(key);
    if (cached && cached.version === this.version) return cached.leads;
    if (key === "changed") this.refreshAll(context);
    const leads = [...this.all].sort(COMPARE[key]);
    this.#sorted.set(key, { version: this.version, leads });
    return leads;
  }
}

export type SortKey = "written" | "name" | "firm" | "changed";
export const SORT_KEYS: readonly SortKey[] = ["written", "name", "firm", "changed"];

function byName(a: Lead, b: Lead): number {
  if (a.sort_name !== b.sort_name) return a.sort_name < b.sort_name ? -1 : 1;
  return a.email < b.email ? -1 : a.email > b.email ? 1 : 0;
}

const COMPARE: Record<SortKey, (a: Lead, b: Lead) => number> = {
  // Newest written first, then the never-written by name.
  written: (a, b) => {
    if (a.last_at && b.last_at) {
      if (a.last_at !== b.last_at) return a.last_at > b.last_at ? -1 : 1;
      return byName(a, b);
    }
    if (a.last_at) return -1;
    if (b.last_at) return 1;
    return byName(a, b);
  },
  name: byName,
  firm: (a, b) => {
    if (a.sort_firm !== b.sort_firm) {
      if (!a.sort_firm) return 1;
      if (!b.sort_firm) return -1;
      return a.sort_firm < b.sort_firm ? -1 : 1;
    }
    return byName(a, b);
  },
  changed: (a, b) => {
    if (a.status_at && b.status_at) {
      if (a.status_at !== b.status_at) return a.status_at > b.status_at ? -1 : 1;
      return byName(a, b);
    }
    if (a.status_at) return -1;
    if (b.status_at) return 1;
    return byName(a, b);
  },
};
