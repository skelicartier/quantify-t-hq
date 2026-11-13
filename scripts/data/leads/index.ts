/**
 * All leads: every address from the lead files and Mail merge's lists, one row each, with
 * where each came from and what has happened to them, kept fresh as Mail merge sends.
 *
 * The index is built at start (before Data says ready, with progress), and again in the
 * background when a list or a source file changes; the written log and the stop list
 * update it in place every few seconds. Edits stay in Data and never touch a Mail merge
 * list; a stop goes through Mail merge's own stop list (the engine bridge) and nowhere
 * else. No lead is ever deleted.
 */

import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";

import { Refused } from "../../mail-merge/engine";
import type { DataCore } from "../core";
import { LIMITS, clean, cleanText, isRouteId, normaliseEmail } from "../guard";
import type { Staff } from "../protocol";
import type { SenderChanges, Stop } from "../sender-files";
import { DEFAULT_FOLDERS, LEAD_FIELDS } from "../../../src/lib/data/labels";
import { LeadsIndex, MAX_LEADS, type Lead, type StatusContext } from "./build";
import type {
  FilesService,
  FollowUp,
  InvestorsLookup,
  LeadsEvent,
  LeadsService,
  ReplyRow,
  WaitlistService,
} from "./contracts";
import { LeadRecords } from "./edits";
import { leftOutCsv, listCsv, trackerCsv, viewCsv, type ExportContext } from "./exports";
import { PAGE, parseLeadQuery, queryString, runQuery } from "./query";
import { detailOf, type LeadDetail } from "./record";
import { SeenLists } from "./seen-lists";
import {
  leftOutName,
  readLeftOut,
  readSnapshot,
  readSourceFile,
  readingOrder,
  signatureOf,
  snapshotName,
  writeSnapshot,
  type SourceRow,
} from "./sources";
import {
  firmKeyOf,
  isLeadField,
  leadIdOf,
  type LeadField,
  type LeadRow,
  type LeadSource,
  type ManualLead,
  type ReplyMark,
  type Standing,
} from "./types";
import { WALK_FILES, WALK_HELD, heldBackText, leadFileText } from "./walk-seed";

const SOURCES = "leads/sources.json";
const LEAD_ID = "([0-9a-f]{32})";
const SOURCE_ID = "([A-Za-z0-9-]{1,64})";
const LIST_CAP = 5_000;
const BULK_CAP = 500;
const EMAIL_KINDS = new Set(["", "named", "role", "personal-domain"]);
const LEADS_FOLDER = DEFAULT_FOLDERS.find((folder) => folder.key === "leads")?.name ?? "00 Inbox";

/** The internal face of the module: what the replies module and the tests reach for. */
export type LeadsInternal = LeadsService & {
  module: LeadsModule;
};

export class LeadsModule {
  readonly core: DataCore;
  readonly records: LeadRecords;
  /** Every list row seen, so a list deleted in Mail merge never takes a lead with it. */
  readonly seen: SeenLists;
  index = new LeadsIndex();
  sources: LeadSource[];
  readonly sourceRows = new Map<string, Map<string, SourceRow>>();
  readonly marks = new Map<string, ReplyMark>();
  readonly standings: Standing[] = [];
  readonly #listeners = new Set<(event: LeadsEvent) => void>();
  readonly #unknown = new Map<string, boolean>();
  #stops: { from: readonly Stop[]; map: Map<string, Stop> } | null = null;
  #building: Promise<void> | null = null;
  #again = false;
  readonly #pendingReread = new Set<LeadSource>();
  #pendingForce = false;
  reading = false;

  constructor(core: DataCore) {
    this.core = core;
    this.records = new LeadRecords(core.store);
    this.seen = new SeenLists(core.store, (line) => core.log(line));
    const stored = core.store.readJson<LeadSource[]>(SOURCES, []);
    this.sources = Array.isArray(stored) ? stored.filter((item) => isRouteId(item?.source_id)) : [];
  }

  files(): FilesService | null {
    return this.core.need<FilesService>("files");
  }

  replies(): {
    forEmail(email: string): ReplyRow[];
    followUpsFor(email: string): FollowUp[];
  } | null {
    return this.core.need("replies");
  }

  // ------------------------------------------------------------------ status

  stopsMap(): Map<string, Stop> {
    const from = this.core.sender.stops();
    if (this.#stops?.from !== from) {
      this.#stops = { from, map: new Map(from.map((stop) => [stop.email, stop])) };
      this.index.bump();
    }
    return this.#stops.map;
  }

  context(): StatusContext {
    return {
      stops: this.stopsMap(),
      marks: this.marks,
      standings: this.standings,
      listName: (listId) => this.index.listNames.get(listId) ?? "",
      today: this.core.day(),
    };
  }

  /** Whether the last live send to them had no answer from the provider: "may have gone". */
  #mayHaveGone(lead: Lead): boolean {
    if (!lead.last_mailing_id) return false;
    const key = `${lead.last_mailing_id}|${lead.email}`;
    const known = this.#unknown.get(key);
    if (known !== undefined) return known;
    const run = this.core.sender.runFor(lead.last_mailing_id, lead.email);
    const unknown = typeof run === "object" && run !== null && run.outcome.state === "unknown";
    this.#unknown.set(key, unknown);
    return unknown;
  }

  detailLine(lead: Lead): string {
    return lead.status === "sent" && this.#mayHaveGone(lead)
      ? `${lead.detail} · may have gone`
      : lead.detail;
  }

  badgesOf(lead: Lead): string[] {
    const badges: string[] = [];
    if (lead.origin === "referral") badges.push("Referral");
    if (lead.origin === "copied") badges.push("Copied on a yes");
    for (const standing of this.standings)
      for (const badge of standing.badges?.(lead.email) ?? [])
        if (!badges.includes(badge)) badges.push(badge);
    return badges;
  }

  rowOf = (lead: Lead): LeadRow => {
    this.index.status(lead, this.context());
    const batches = [...lead.lists]
      .sort(
        (a, b) =>
          (this.index.listOrder.get(a.list_id) ?? 0) - (this.index.listOrder.get(b.list_id) ?? 0),
      )
      .map((member) => this.index.batchName(member))
      .filter(Boolean);
    return {
      lead_id: lead.lead_id,
      email: lead.email,
      name: lead.name,
      title: lead.fields.title,
      company: lead.fields.company,
      firm_type: lead.fields.firm_type,
      city: lead.fields.city,
      country: lead.fields.country,
      domain: lead.domain,
      email_kind: lead.fields.email_kind,
      status: lead.status,
      status_detail: this.detailLine(lead),
      status_at: lead.status_at,
      times_written: lead.times,
      last_written_at: lead.last_at,
      last_mailing: lead.last_mailing,
      batches,
      tags: [...lead.tags],
      badges: this.badgesOf(lead),
    };
  };

  /** Who a Mail merge list made here may hold: not on the stop list, and no "No" standing. */
  listable(lead: Lead, stops: ReadonlyMap<string, Stop>): boolean {
    if (stops.has(lead.email)) return false;
    const mark = this.marks.get(lead.email);
    return !(mark?.said_no || mark?.outcome === "not_interested");
  }

  sourceTitle(sourceId: string): string {
    return this.sources.find((source) => source.source_id === sourceId)?.title ?? "A lead file";
  }

  exportContext(): ExportContext {
    const context = this.context();
    return {
      stops: context.stops,
      marks: this.marks,
      listName: context.listName,
      firstList: (lead) => this.index.firstList(lead),
      detailOf: (lead) => this.detailLine(lead),
    };
  }

  detail(lead: Lead): LeadDetail {
    this.index.status(lead, this.context());
    return detailOf(lead, {
      sender: this.core.sender,
      records: this.records,
      stops: this.stopsMap(),
      rowOf: this.rowOf,
      colleagues: (item) => (item.firm_key ? (this.index.byFirm.get(item.firm_key) ?? []) : [item]),
      sourceOf: (id) => this.sources.find((source) => source.source_id === id) ?? null,
      sourceRow: (id, email) => this.sourceRows.get(id)?.get(email) ?? null,
      seenRow: (listId, email) => this.seen.row(listId, email),
      replies: () => this.replies(),
      waitlist: () => this.core.need<WaitlistService>("waitlist"),
      investors: () => this.core.need<InvestorsLookup>("investors"),
      today: this.core.day(),
    });
  }

  // ------------------------------------------------------------------ changes

  emit(event: LeadsEvent): void {
    for (const listener of this.#listeners) {
      try {
        listener(event);
      } catch (error) {
        this.core.log(`a leads listener failed: ${error instanceof Error ? error.name : "error"}`);
      }
    }
  }

  onChange(listener: (event: LeadsEvent) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** What the sender's files say moved: new sends, the stop list, the lists. */
  onSender(changes: SenderChanges): void {
    if (changes.written.length) {
      const emails: string[] = [];
      for (const line of changes.written) {
        const known = this.index.byEmail.has(line.email);
        const lead = this.index.applyWritten(line);
        if (!known) {
          this.index.derive(lead);
          this.index.regroup(lead, "");
        }
        emails.push(line.email);
      }
      this.index.bump();
      this.index.read_at = this.core.now();
      this.emit({ kind: "written", emails });
    }
    if (changes.stops) {
      this.index.bump();
      this.index.read_at = this.core.now();
      this.emit({ kind: "stops" });
    }
    if (changes.lists.length) void this.rebuild();
  }

  // ------------------------------------------------------------------ sources

  saveSources(): void {
    this.core.store.writeJson(SOURCES, this.sources);
  }

  /** Read one source's file (every version), or keep its last snapshot when it cannot be. */
  async readSource(source: LeadSource, force = false): Promise<void> {
    const files = this.files();
    const snapshot = (): Map<string, SourceRow> =>
      this.sourceRows.get(source.source_id) ??
      readSnapshot(this.core.store, source.source_id)?.rows ??
      new Map();
    if (!files) {
      this.sourceRows.set(source.source_id, snapshot());
      return;
    }
    const order = readingOrder(files, source.file_id);
    if (order.length === 0) {
      this.sourceRows.set(source.source_id, snapshot());
      if (source.read)
        source.detail = "The file is no longer in Files; the leads it brought are kept.";
      else {
        source.state = "failed";
        source.detail = "The file is no longer in Files.";
      }
      return;
    }
    source.title = files.fileRow(source.file_id)?.title || source.title;
    const signature = signatureOf(order);
    if (!force && source.read && source.state === "read") {
      const stored = readSnapshot(this.core.store, source.source_id);
      if (stored && stored.signature === signature) {
        this.sourceRows.set(source.source_id, stored.rows);
        return;
      }
    }
    const pill = `source:${source.source_id}:${order[order.length - 1]!.sha256}`;
    if (this.core.pills.poisoned(pill)) {
      this.core.pills.forget(pill);
      source.state = "failed";
      source.detail = "It stopped Data the last time it was read, so it was not read again.";
      this.sourceRows.set(source.source_id, snapshot());
      this.saveSources();
      return;
    }
    source.state = "reading";
    source.detail = "";
    this.saveSources();
    try {
      const read = await this.core.pills.guard(pill, () =>
        readSourceFile(files, source, () => this.core.yield()),
      );
      let fresh = 0;
      for (const email of read.rows.keys()) if (!this.index.byEmail.has(email)) fresh += 1;
      if (this.index.size + fresh > MAX_LEADS)
        throw new Refused(400, "too_many", "The leads would pass 200,000; split the file.");
      writeSnapshot(this.core.store, source.source_id, read);
      this.sourceRows.set(source.source_id, read.rows);
      let leads = 0;
      for (const row of read.rows.values()) if (!row.stale) leads += 1;
      source.read = {
        at: this.core.now(),
        version_n: read.version_n,
        sha256: read.sha256,
        rows: read.row_count,
        leads,
        left_out_total: read.left_out.length,
        left_out: read.left_out.slice(0, 200),
      };
      source.state = "read";
      source.detail = "";
    } catch (error) {
      source.state = "failed";
      source.detail =
        error instanceof Refused ? error.message : "It could not be read as a CSV of leads.";
      this.sourceRows.set(source.source_id, snapshot());
      this.core.log(
        `a lead source could not be read: ${error instanceof Error ? error.name : "error"}`,
      );
    }
    this.saveSources();
  }

  /** Build the index from nothing; a running build makes another one follow it. */
  rebuild(
    options: { initial?: boolean; reread?: LeadSource[]; force?: boolean } = {},
  ): Promise<void> {
    if (this.#building) {
      // Asked again while one runs: another build follows it, reading what this one asked for.
      this.#again = true;
      for (const source of options.reread ?? []) this.#pendingReread.add(source);
      if (options.force) this.#pendingForce = true;
      // The running build's promise settles only after the follow-up build is done too.
      return this.#building;
    }
    this.#building = (async () => {
      try {
        do {
          this.#again = false;
          await this.#buildOnce(options);
          options = { reread: [...this.#pendingReread], force: this.#pendingForce };
          this.#pendingReread.clear();
          this.#pendingForce = false;
        } while (this.#again);
      } finally {
        this.#building = null;
        this.reading = false;
      }
    })();
    return this.#building;
  }

  async #buildOnce(options: {
    initial?: boolean;
    reread?: LeadSource[];
    force?: boolean;
  }): Promise<void> {
    this.reading = true;
    const job = options.initial ? null : this.core.startJob("leads", 0, "Reading the lead files");
    const progress = async (done: number, total: number): Promise<void> => {
      if (options.initial) this.core.setStarting("Reading the lead files", { done, total });
      else if (job) {
        job.setTotal(total);
        job.done = done;
      }
      await this.core.yield();
    };
    try {
      if (options.initial) this.core.setStarting("Reading the lead files");
      for (const source of this.sources)
        if (!this.sourceRows.has(source.source_id) || options.reread?.includes(source))
          await this.readSource(source, options.force === true);
      this.core.sender.poll();
      const written = this.core.sender.written();
      const writtenCount = written.length;
      const lists = [...this.core.sender.lists()].reverse();
      const gone = this.seen.update(lists);
      const built = await LeadsIndex.build(
        {
          lists,
          gone,
          sources: this.sources
            .filter((source) => source.state !== "waiting")
            .map((source) => ({
              source,
              rows: (
                this.sourceRows.get(source.source_id) ?? new Map<string, SourceRow>()
              ).values(),
            })),
          manual: this.records.manual,
          edits: this.records.edits,
          written: written.slice(0, writtenCount),
        },
        progress,
        this.core.now(),
      );
      // What changed while it was being built: later sends, and any edit or manual lead.
      for (const line of this.core.sender.written().slice(writtenCount)) {
        const lead = built.applyWritten(line);
        built.derive(lead);
      }
      for (const manual of this.records.manual) built.derive(built.applyManual(manual));
      for (const [leadId, edit] of Object.entries(this.records.edits)) {
        const lead = built.byId.get(leadId);
        if (!lead) continue;
        const before = lead.firm_key;
        built.applyEdit(lead, edit);
        built.derive(lead);
        built.regroup(lead, before);
      }
      built.version = this.index.version + 1;
      this.index = built;
      this.#unknown.clear();
      job?.finish();
      this.emit({ kind: "rebuilt" });
    } catch (error) {
      job?.fail("The lead files could not be read.");
      this.core.log(
        `the leads index could not be built: ${error instanceof Error ? error.name : "error"}`,
      );
      if (options.initial) throw error;
    }
  }

  // ------------------------------------------------------------------ writes

  addManual(input: {
    email: string;
    values: Partial<Record<LeadField, string>>;
    origin: ManualLead["origin"];
    referred_by: string | null;
    by: Staff;
  }): LeadRow {
    const email = normaliseEmail(input.email);
    if (!email) throw new Refused(400, "invalid", "That is not an email address.");
    if (this.index.byEmail.has(email))
      throw new Refused(409, "already_a_lead", "That address is already a lead.");
    if (this.index.size >= MAX_LEADS)
      throw new Refused(409, "too_many", "The leads would pass 200,000; split the file.");
    const values: Partial<Record<LeadField, string>> = {};
    for (const [key, value] of Object.entries(input.values ?? {}))
      if (isLeadField(key) && typeof value === "string" && value.trim())
        values[key] = cleanText(value, key === "notes" ? LIMITS.notes : LIMITS.title);
    const manual: ManualLead = {
      lead_id: leadIdOf(email),
      email,
      values,
      origin: input.origin,
      referred_by: input.referred_by,
      added_at: this.core.now(),
      added_by: input.by,
    };
    this.records.addManual(manual);
    const lead = this.index.applyManual(manual);
    this.index.derive(lead);
    this.index.regroup(lead, "");
    this.index.bump();
    this.records.logEvent({
      lead_id: lead.lead_id,
      kind: "added",
      detail:
        input.origin === "hand"
          ? "Added by hand"
          : input.origin === "referral"
            ? `Named by ${input.referred_by ?? "someone"}`
            : input.origin === "copied"
              ? "Copied on a yes"
              : "Added from a reply",
      by: input.by,
      at: manual.added_at,
    });
    this.emit({ kind: "lead", emails: [email] });
    return this.rowOf(lead);
  }

  tag(lead: Lead, add: readonly string[], remove: readonly string[], by: Staff): void {
    const adding = add.map((tag) => cleanText(tag, LIMITS.tag)).filter(Boolean);
    const removing = new Set(remove.map((tag) => clean(tag, LIMITS.tag).toLowerCase()));
    const next = lead.tags.filter((tag) => !removing.has(tag.toLowerCase()));
    const added: string[] = [];
    for (const tag of adding)
      if (!next.some((item) => item.toLowerCase() === tag.toLowerCase())) {
        next.push(tag);
        added.push(tag);
      }
    if (next.length > LIMITS.tags)
      throw new Refused(400, "invalid", "A lead holds 20 tags at most.");
    const taken = lead.tags.filter((tag) => removing.has(tag.toLowerCase()));
    if (added.length === 0 && taken.length === 0) return;
    const at = this.core.now();
    this.records.saveEdit(lead.lead_id, (edit) => (edit.tags = next), by, at);
    lead.tags = next;
    this.index.bump();
    for (const tag of added)
      this.records.logEvent({
        lead_id: lead.lead_id,
        kind: "tag",
        detail: `Tagged “${tag}”`,
        by,
        at,
      });
    for (const tag of taken)
      this.records.logEvent({
        lead_id: lead.lead_id,
        kind: "tag",
        detail: `Untagged “${tag}”`,
        by,
        at,
      });
    this.emit({ kind: "lead", emails: [lead.email] });
  }

  leadOr404(leadId: string | undefined): Lead {
    const lead = leadId ? this.index.byId.get(leadId) : undefined;
    if (!lead) throw new Refused(404, "not_found", "That lead is not here.");
    return lead;
  }

  service(): LeadsInternal {
    return {
      module: this,
      byEmail: (email) => {
        const lead = this.index.byEmail.get(normaliseEmail(email));
        return lead ? this.rowOf(lead) : null;
      },
      detail: (leadId) => {
        const lead = this.index.byId.get(leadId);
        return lead ? this.detail(lead) : null;
      },
      firmKeyOf: (email, emailKind) => firmKeyOf(normaliseEmail(email) || email, emailKind ?? ""),
      atFirm: (firmKey) => (this.index.byFirm.get(firmKey) ?? []).map(this.rowOf),
      unsentAt: (firmKey) => {
        const stops = this.stopsMap();
        return (this.index.byFirm.get(firmKey) ?? [])
          .filter((lead) => lead.times === 0 && !stops.has(lead.email))
          .map((lead) => ({
            email: lead.email,
            name: lead.name,
            title: lead.fields.title,
            lists: lead.lists.map((member) => this.index.batchName(member)),
          }));
      },
      addManual: (input) => this.addManual(input),
      tag: (leadId, add, remove, by) => this.tag(this.leadOr404(leadId), add, remove, by),
      sentMail: (email) => this.core.sender.sentMail(normaliseEmail(email)),
      usedFor: (fileId) =>
        this.sources
          .filter((source) => source.file_id === fileId)
          .map((source) => ({
            label:
              source.role === "leads"
                ? "A lead source in All leads"
                : `People held back in All leads (${source.reason || "Not a buyer"})`,
            href: "/data/leads/sources",
          })),
      onChange: (listener) => this.onChange(listener),
      noteReply: (email, mark) => {
        if (mark) this.marks.set(email, mark);
        else this.marks.delete(email);
        this.index.bump();
      },
      registerStanding: (standing) => {
        this.standings.push(standing);
        this.index.bump();
      },
    };
  }
}

function stringList(value: unknown, limit: number): string[] {
  const items = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,\n]/)
      : [];
  return items
    .map((item) => clean(item, limit))
    .filter(Boolean)
    .slice(0, 1_000);
}

function fieldLimit(field: LeadField): number {
  if (field === "notes") return LIMITS.notes;
  if (field === "first_name" || field === "last_name" || field === "full_name") return LIMITS.name;
  return LIMITS.title;
}

export async function register(core: DataCore): Promise<void> {
  const leads = new LeadsModule(core);
  const service = leads.service();
  core.provide("leads", service);
  await leads.rebuild({ initial: true });
  core.sender.watch((changes) => leads.onSender(changes));
  leads.files()?.onChange((event) => {
    const using = leads.sources.filter((source) => source.file_id === event.file_id);
    if (using.length === 0) return;
    if (event.kind === "version_added" || event.kind === "current_changed")
      void leads.rebuild({ reread: using });
  });

  const fresh = (): void => {
    core.sender.poll();
  };
  const json = (ctx: { body: Record<string, unknown> }, key: string) => ctx.body[key];

  // ---------------------------------------------------------------- the list

  core.route("GET", "/data/leads", (ctx) => {
    fresh();
    const query = parseLeadQuery(ctx.query);
    const result = runQuery(leads.index, query, leads.context(), {
      source: (id) => leads.sourceTitle(id),
    });
    const stops = leads.stopsMap();
    return {
      leads: result.matches.slice(query.offset, query.offset + PAGE).map(leads.rowOf),
      total: result.total,
      // Who a Mail merge list made from this view would hold: not stopped, and no "No" standing.
      listable: result.matches.reduce(
        (count, lead) => count + (leads.listable(lead, stops) ? 1 : 0),
        0,
      ),
      all: result.all,
      offset: query.offset,
      limit: PAGE,
      counts: result.counts,
      book: result.book,
      facets: result.facets,
      read_at: leads.index.read_at,
      sending: core.sender.sending() !== null,
      reading: leads.reading,
    };
  });

  // ---------------------------------------------------------------- sources (before /:lead_id)

  const sourceView = (source: LeadSource) => {
    const file = leads.files()?.fileRow(source.file_id) ?? null;
    const job = core.jobs("leads")[0] ?? null;
    return {
      ...source,
      title: file?.title || source.title,
      folder_path: file?.folder_path ?? "",
      trashed: Boolean(file?.trashed_at),
      in_files: file !== null,
      progress: source.state === "reading" && job ? { done: job.done, total: job.total } : null,
    };
  };

  core.route("GET", "/data/leads/sources", () => {
    fresh();
    const lists = core.sender.lists();
    return {
      sources: leads.sources.map(sourceView),
      merge: {
        lists: lists.length,
        rows: lists.reduce((sum, list) => sum + list.rows.length, 0),
        read_at: leads.index.read_at,
      },
      csv_files: leads.files()?.csvFiles() ?? [],
      files: leads.files() !== null,
      reading: leads.reading,
    };
  });

  core.route("POST", "/data/leads/sources", (ctx) => {
    const by = ctx.staff();
    const files = leads.files();
    if (!files)
      throw new Refused(
        409,
        "files_missing",
        "Files is not set up here yet, so there is no file to choose.",
      );
    const fileId = clean(json(ctx, "file_id"), 64);
    const file = fileId ? files.fileRow(fileId) : null;
    if (!file) throw new Refused(404, "not_found", "That file is not in Files.");
    if (file.trashed_at) throw new Refused(409, "trashed", "That file is in the trash.");
    if (file.kind !== "csv")
      throw new Refused(400, "invalid", "Only a CSV file can be a lead source.");
    if (leads.sources.some((source) => source.file_id === fileId))
      throw new Refused(409, "already_a_source", "That file is a lead source already.");
    const role = json(ctx, "role") === "held_back" ? "held_back" : "leads";
    const reason = role === "held_back" ? cleanText(json(ctx, "reason"), LIMITS.reason) : "";
    const source: LeadSource = {
      source_id: randomUUID(),
      file_id: fileId,
      role,
      reason: role === "held_back" ? reason || "Not a buyer" : "",
      added_at: core.now(),
      added_by: by,
      state: "waiting",
      detail: "",
      title: file.title,
      read: null,
    };
    leads.sources.push(source);
    leads.saveSources();
    void leads.rebuild({ reread: [source] });
    return { source: sourceView(source) };
  });

  const sourceOr404 = (id: string | undefined): LeadSource => {
    const source = leads.sources.find((item) => item.source_id === id);
    if (!source) throw new Refused(404, "not_found", "That lead source is not here.");
    return source;
  };

  /** Leads only this source brings: on no list, in no other file, not added here, never written. */
  const onlyHere = (source: LeadSource): Lead[] =>
    leads.index.all.filter(
      (lead) =>
        lead.lists.length === 0 &&
        lead.files.length === 1 &&
        lead.files[0]!.source_id === source.source_id &&
        !leads.records.manualFor(lead.email) &&
        lead.times === 0,
    );
  const withData = (lead: Lead): boolean =>
    leads.records.hasData(lead.lead_id) ||
    leads.marks.has(lead.email) ||
    (leads.replies()?.forEmail(lead.email).length ?? 0) > 0;

  core.route("GET", new RegExp(`^/data/leads/sources/${SOURCE_ID}/remove-preview$`), (ctx) => {
    const only = onlyHere(sourceOr404(ctx.params[0]));
    return { only_here: only.length, with_data: only.filter(withData).length };
  });

  core.route("POST", new RegExp(`^/data/leads/sources/${SOURCE_ID}/remove$`), async (ctx) => {
    ctx.staff();
    const source = sourceOr404(ctx.params[0]);
    const only = onlyHere(source);
    const kept = only.filter(withData).length;
    if (kept > 0)
      throw new Refused(
        409,
        "has_data",
        `${kept.toLocaleString("en-GB")} of the leads only this file brings have replies, notes or edits; they cannot leave. Upload a corrected version instead.`,
      );
    leads.sources = leads.sources.filter((item) => item !== source);
    leads.sourceRows.delete(source.source_id);
    leads.saveSources();
    core.store.remove(snapshotName(source.source_id));
    core.store.remove(leftOutName(source.source_id));
    await leads.rebuild();
    return { removed: only.length };
  });

  core.route("GET", new RegExp(`^/data/leads/sources/${SOURCE_ID}/left-out$`), (ctx) => {
    const source = sourceOr404(ctx.params[0]);
    const rows = readLeftOut(core.store, source.source_id);
    return { rows: rows.slice(0, 200), total: rows.length };
  });

  core.route("POST", "/data/leads/read-again", (ctx) => {
    ctx.staff();
    for (const source of leads.sources) leads.sourceRows.delete(source.source_id);
    void leads.rebuild({ reread: [...leads.sources], force: true });
    return { state: "reading" };
  });

  // ---------------------------------------------------------------- adding, bulk, Mail merge

  core.route("POST", "/data/leads/add", (ctx) => {
    const by = ctx.staff();
    const given = json(ctx, "values");
    const values =
      given && typeof given === "object" && !Array.isArray(given)
        ? (given as Record<string, string>)
        : {};
    const lead = leads.addManual({
      email: clean(json(ctx, "email"), LIMITS.email),
      values,
      origin: "hand",
      referred_by: null,
      by,
    });
    return { lead };
  });

  core.route("POST", "/data/leads/bulk-tag", (ctx) => {
    const by = ctx.staff();
    const ids = stringList(json(ctx, "ids"), 64);
    if (ids.length === 0) throw new Refused(400, "invalid", "Choose the leads first.");
    if (ids.length > BULK_CAP) throw new Refused(400, "invalid", "Choose 500 at most.");
    const add = stringList(json(ctx, "add"), LIMITS.tag);
    const remove = stringList(json(ctx, "remove"), LIMITS.tag);
    if (add.length === 0 && remove.length === 0)
      throw new Refused(400, "invalid", "Name the tag first.");
    let changed = 0;
    for (const id of ids) {
      const lead = leads.index.byId.get(id);
      if (!lead) continue;
      const before = lead.tags.join("\n");
      leads.tag(lead, add, remove, by);
      if (lead.tags.join("\n") !== before) changed += 1;
    }
    return { changed };
  });

  core.route("POST", "/data/leads/to-mail-merge", async (ctx) => {
    ctx.staff();
    fresh();
    const name = clean(json(ctx, "name"), LIMITS.name);
    if (!name) throw new Refused(400, "invalid", "Give the list a name.");
    const query = parseLeadQuery(new URLSearchParams(clean(json(ctx, "query"), 2_000)));
    const result = runQuery(leads.index, query, leads.context(), {
      source: (id) => leads.sourceTitle(id),
    });
    if (result.total === 0) throw new Refused(409, "empty", "Nobody is in this view.");
    const stops = leads.stopsMap();
    // Nobody on the stop list, and nobody whose "No" still stands even if the stop came off.
    const people = result.matches.filter((lead) => leads.listable(lead, stops));
    if (people.length > LIST_CAP)
      throw new Refused(
        400,
        "too_many",
        `This view has ${result.total.toLocaleString("en-GB")} leads; a list made here holds 5,000. Narrow it first.`,
      );
    if (people.length === 0)
      throw new Refused(
        409,
        "all_stopped",
        result.matches.every((lead) => stops.has(lead.email))
          ? "Everyone in this view is on the stop list."
          : "Everyone in this view is on the stop list or said no.",
      );
    const made = (await core.engine("importList", {
      name,
      file_name: `${name}.csv`,
      text: listCsv(people),
    })) as { list?: { id?: string; name?: string; people?: number } };
    fresh();
    return {
      list: {
        id: String(made.list?.id ?? ""),
        name: String(made.list?.name ?? name),
        people: Number(made.list?.people ?? people.length),
      },
    };
  });

  // ---------------------------------------------------------------- one lead

  core.route("GET", new RegExp(`^/data/leads/${LEAD_ID}$`), (ctx) => {
    fresh();
    return { lead: leads.detail(leads.leadOr404(ctx.params[0])), today: core.day() };
  });

  core.route("POST", new RegExp(`^/data/leads/${LEAD_ID}/update$`), (ctx) => {
    const by = ctx.staff();
    const lead = leads.leadOr404(ctx.params[0]);
    const field = json(ctx, "field");
    if (!isLeadField(field)) throw new Refused(400, "invalid", "That is not a detail of a lead.");
    const value = cleanText(json(ctx, "value"), fieldLimit(field));
    if (field === "email_kind" && !EMAIL_KINDS.has(value))
      throw new Refused(400, "invalid", "Choose named, shared or free mail.");
    if ((field === "website" || field === "source_url") && value && !/^https?:\/\//i.test(value))
      throw new Refused(400, "invalid", "A link starts with http:// or https://.");
    const before = lead.fields[field];
    if (before === value) return { lead: leads.rowOf(lead) };
    const at = core.now();
    leads.records.saveEdit(lead.lead_id, (edit) => (edit.fields[field] = value), by, at);
    const firmBefore = lead.firm_key;
    lead.fields[field] = value;
    if (!lead.edited.includes(field)) lead.edited.push(field);
    leads.index.derive(lead);
    leads.index.regroup(lead, firmBefore);
    leads.index.bump();
    leads.records.logEvent({
      lead_id: lead.lead_id,
      kind: "edit",
      detail: `${LEAD_FIELDS[field]}: ${before || "Not given"} → ${value || "Not given"}`,
      by,
      at,
    });
    leads.emit({ kind: "lead", emails: [lead.email] });
    return { lead: leads.rowOf(lead) };
  });

  core.route("POST", new RegExp(`^/data/leads/${LEAD_ID}/tags$`), (ctx) => {
    const by = ctx.staff();
    const lead = leads.leadOr404(ctx.params[0]);
    leads.tag(
      lead,
      stringList(json(ctx, "add"), LIMITS.tag),
      stringList(json(ctx, "remove"), LIMITS.tag),
      by,
    );
    return { lead: leads.rowOf(lead) };
  });

  core.route("POST", new RegExp(`^/data/leads/${LEAD_ID}/notes$`), (ctx) => {
    const by = ctx.staff();
    const lead = leads.leadOr404(ctx.params[0]);
    const text = cleanText(json(ctx, "text"), LIMITS.notes);
    if (!text) throw new Refused(400, "invalid", "Write the note first.");
    return { note: leads.records.addNote(lead.lead_id, text, by, core.now()) };
  });

  core.route(
    "POST",
    new RegExp(`^/data/leads/${LEAD_ID}/notes/([A-Za-z0-9-]{1,64})/delete$`),
    (ctx) => {
      const by = ctx.staff();
      const lead = leads.leadOr404(ctx.params[0]);
      const note = leads.records.note(ctx.params[1]!);
      if (!note || note.lead_id !== lead.lead_id)
        throw new Refused(404, "not_found", "That note is not here.");
      if (note.by.staff_id !== by.staff_id)
        throw new Refused(403, "not_yours", "Only the person who wrote a note can delete it.");
      leads.records.deleteNote(note.note_id, by, core.now());
      return { deleted: true };
    },
  );

  core.route("POST", new RegExp(`^/data/leads/${LEAD_ID}/stop$`), async (ctx) => {
    const by = ctx.staff();
    const lead = leads.leadOr404(ctx.params[0]);
    fresh();
    if (core.sender.isStopped(lead.email))
      throw new Refused(409, "already_stopped", "That address is on the stop list already.");
    const reason = json(ctx, "reason") === "asked" ? "asked" : "manual";
    const note = cleanText(json(ctx, "note"), LIMITS.reason);
    await core.engine("addStops", { emails: lead.email, reason });
    fresh();
    leads.index.bump();
    leads.records.logEvent({
      lead_id: lead.lead_id,
      kind: "stop",
      detail: `Put on the stop list: ${reason === "asked" ? "they asked to stop" : "do not write to them"}${note ? ` · ${note}` : ""}`,
      by,
      at: core.now(),
    });
    leads.emit({ kind: "stops", emails: [lead.email] });
    return { lead: leads.rowOf(lead) };
  });

  core.route("POST", new RegExp(`^/data/leads/${LEAD_ID}/unstop$`), async (ctx) => {
    const by = ctx.staff();
    const lead = leads.leadOr404(ctx.params[0]);
    fresh();
    if (!core.sender.isStopped(lead.email))
      throw new Refused(409, "not_stopped", "That address is not on the stop list.");
    await core.engine("removeStop", { email: lead.email });
    fresh();
    leads.index.bump();
    leads.records.logEvent({
      lead_id: lead.lead_id,
      kind: "unstop",
      detail: "Taken off the stop list",
      by,
      at: core.now(),
    });
    leads.emit({ kind: "stops", emails: [lead.email] });
    return { lead: leads.rowOf(lead) };
  });

  // ---------------------------------------------------------------- downloads

  const writeFile = (path: string, text: string): void => {
    writeFileSync(path, text, { mode: 0o600 });
  };

  core.builds.provide("leads_csv", async (handle, input) => {
    fresh();
    const query = parseLeadQuery(new URLSearchParams(input.query));
    const result = runQuery(leads.index, query, leads.context(), {
      source: (id) => leads.sourceTitle(id),
    });
    handle.setProgress(0, result.total);
    await core.yield();
    writeFile(handle.path, viewCsv(result.matches, leads.exportContext()));
    handle.setProgress(result.total, result.total);
    leads.records.logExport({
      at: core.now(),
      by: input.by,
      kind: "this_view",
      view: queryString(query),
      rows: result.total,
    });
    return { name: `All leads ${core.day()}.csv`, type: "text/csv; charset=utf-8" };
  });

  core.builds.provide("leads_tracker", async (handle, input) => {
    fresh();
    const context = leads.context();
    const all = leads.index.sorted("written", context);
    leads.index.refreshAll(context);
    handle.setProgress(0, all.length);
    await core.yield();
    writeFile(handle.path, trackerCsv(all, leads.exportContext()));
    handle.setProgress(all.length, all.length);
    leads.records.logExport({
      at: core.now(),
      by: input.by,
      kind: "tracker",
      view: "",
      rows: all.length,
    });
    return { name: `SENT TRACKER ${core.day()}.csv`, type: "text/csv; charset=utf-8" };
  });

  core.builds.provide("leads_left_out", async (handle, input) => {
    const source = sourceOr404(clean(input.body.source_id, 64));
    const rows = readLeftOut(core.store, source.source_id);
    writeFile(handle.path, leftOutCsv(rows));
    leads.records.logExport({
      at: core.now(),
      by: input.by,
      kind: "left_out",
      view: source.source_id,
      rows: rows.length,
    });
    await core.yield();
    return {
      name: `${source.title || "Lead file"} - rows left out.csv`,
      type: "text/csv; charset=utf-8",
    };
  });

  // ---------------------------------------------------------------- the walk's own seed

  if (core.testRoutes) {
    core.route("POST", "/data/_test/leads/walk-seed", async (ctx) => {
      const by = ctx.staff();
      const files = leads.files();
      if (!files) return { files: false, sources: 0, leads: leads.index.size };
      const made: LeadSource[] = [];
      const add = (fileId: string, title: string, role: LeadSource["role"], reason: string) => {
        if (leads.sources.some((source) => source.file_id === fileId)) return;
        const source: LeadSource = {
          source_id: randomUUID(),
          file_id: fileId,
          role,
          reason,
          added_at: core.now(),
          added_by: by,
          state: "waiting",
          detail: "",
          title,
          read: null,
        };
        leads.sources.push(source);
        made.push(source);
      };
      const encoder = new TextEncoder();
      for (const file of WALK_FILES) {
        const row = await files.putFile({
          folderPath: [LEADS_FOLDER],
          title: file.title,
          originalName: file.title,
          bytes: encoder.encode(leadFileText(file.from, file.to)),
          by,
        });
        add(row.file_id, row.title, "leads", "");
      }
      const held = await files.putFile({
        folderPath: [LEADS_FOLDER],
        title: WALK_HELD.title,
        originalName: WALK_HELD.title,
        bytes: encoder.encode(heldBackText(WALK_HELD.count)),
        by,
      });
      add(held.file_id, held.title, "held_back", WALK_HELD.reason);
      leads.saveSources();
      await leads.rebuild({ reread: made });
      return { files: true, sources: leads.sources.length, leads: leads.index.size };
    });
  }
}
