/**
 * The incident book (ws-notes/duties/spec.md §6.3): `incidents/incidents.json` (the records
 * and each year's next number), `incidents/events.jsonl` (one line per change, naming the
 * fields and never their values) and `incidents/runbooks.json` (a file in Files per kind).
 * An incident is never deleted: it is closed, and a customer row is withdrawn. Every input
 * is checked here; the clocks are `clock.ts`.
 */

import { randomUUID } from "node:crypto";

import { Refused } from "../../mail-merge/engine";
import type { DataCore } from "../core";
import { clean, cleanText, isDay } from "../guard";
import type { Staff } from "../protocol";
import { addHours, istInstant, istParts } from "../../../src/lib/data/labels-duties";
import { INCIDENT_FIELD_WORDS } from "../../../src/lib/data/labels-security";
import { isKind, isListed } from "./kinds";
import { LIMIT, SAY, lateSentence, tooMany } from "./limits";
import type {
  CustomerRow,
  Incident,
  IncidentEvent,
  IncidentKind,
  IncidentStatus,
  ReportChannel,
  Severity,
} from "./types";

const INCIDENTS = "incidents/incidents.json";
const EVENTS = "incidents/events.jsonl";
const RUNBOOKS = "incidents/runbooks.json";

const SEVERITIES = new Set<string>(["low", "medium", "high", "critical"]);
const STATUSES = new Set<string>(["open", "contained", "resolved", "closed"]);
const CHANNELS = new Set<string>(["email", "phone", "fax", "form"]);

type Input = Record<string, unknown>;

/** The clock and the rule the book checks against: from the module, at request time. */
export type Env = {
  now: string;
  today: string;
  /** The CERT-In rule's hours, when the rule book answers; null otherwise. */
  certInHours: number | null;
};

const textOf = (value: unknown): string => (typeof value === "string" ? value : "");
const instantOrNull = (value: unknown): string | null =>
  typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null;
const staffOf = (value: unknown): Staff => {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return typeof record.staff_id === "string" && typeof record.name === "string"
    ? { staff_id: record.staff_id, name: record.name }
    : { staff_id: "unknown", name: "Unknown" };
};

/** A stored incident read back; null when it is not one. Missing fields read empty. */
function incidentOf(raw: unknown): Incident | null {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  if (!r || typeof r.incident_id !== "string" || !instantOrNull(r.aware_at)) return null;
  const certIn = (r.cert_in && typeof r.cert_in === "object" ? r.cert_in : {}) as Record<
    string,
    unknown
  >;
  const board = (r.board && typeof r.board === "object" ? r.board : {}) as Record<string, unknown>;
  const kind = isKind(r.kind) ? r.kind : "other";
  return {
    incident_id: r.incident_id,
    reference: textOf(r.reference),
    title: textOf(r.title),
    summary: textOf(r.summary),
    kind,
    severity: SEVERITIES.has(textOf(r.severity)) ? (r.severity as Severity) : "medium",
    status: STATUSES.has(textOf(r.status)) ? (r.status as IncidentStatus) : "open",
    personal_data: r.personal_data === true,
    occurred_at: instantOrNull(r.occurred_at),
    aware_at: String(r.aware_at),
    contained_at: instantOrNull(r.contained_at),
    resolved_at: instantOrNull(r.resolved_at),
    closed_at: instantOrNull(r.closed_at),
    systems: textOf(r.systems),
    actions: textOf(r.actions),
    cert_in: {
      not_reportable:
        certIn.not_reportable && typeof certIn.not_reportable === "object"
          ? (certIn.not_reportable as Incident["cert_in"]["not_reportable"])
          : null,
      report:
        certIn.report && typeof certIn.report === "object"
          ? (certIn.report as Incident["cert_in"]["report"])
          : null,
    },
    board: {
      report:
        board.report && typeof board.report === "object"
          ? (board.report as Incident["board"]["report"])
          : null,
    },
    customers: Array.isArray(r.customers)
      ? (r.customers as CustomerRow[]).filter((row) => typeof row?.row_id === "string")
      : [],
    lessons: textOf(r.lessons),
    created_at: textOf(r.created_at),
    created_by: staffOf(r.created_by),
    updated_at: textOf(r.updated_at),
    updated_by: staffOf(r.updated_by),
  };
}

/** "INC-2026-001". */
export const referenceOf = (year: string, number: number): string =>
  `INC-${year}-${String(number).padStart(3, "0")}`;

export class IncidentsBook {
  readonly #core: DataCore;
  incidents: Incident[];
  next: Record<string, number>;
  runbooks: Partial<Record<IncidentKind, string>>;
  /** Under test routes: the id the next logged incident takes (the walk's pinned record). */
  pinned: string | null = null;

  constructor(core: DataCore) {
    this.#core = core;
    core.store.ensureDir("incidents");
    const stored = core.store.readJson<{ incidents?: unknown[]; next?: unknown }>(INCIDENTS, {});
    this.incidents = Array.isArray(stored.incidents)
      ? stored.incidents.map(incidentOf).filter((item): item is Incident => item !== null)
      : [];
    const next = stored.next && typeof stored.next === "object" ? stored.next : {};
    this.next = Object.fromEntries(
      Object.entries(next as Record<string, unknown>).filter(
        (entry): entry is [string, number] =>
          /^\d{4}$/.test(entry[0]) && typeof entry[1] === "number",
      ),
    );
    const books = core.store.readJson<{ runbooks?: Record<string, unknown> }>(RUNBOOKS, {});
    this.runbooks = {};
    for (const [kind, fileId] of Object.entries(books.runbooks ?? {}))
      if (isKind(kind) && typeof fileId === "string" && fileId) this.runbooks[kind] = fileId;
  }

  // ---------------------------------------------------------------- storing

  #save(): void {
    this.#core.store.writeJson(INCIDENTS, {
      format: 1,
      incidents: this.incidents,
      next: this.next,
    });
  }

  #saveRunbooks(): void {
    this.#core.store.writeJson(RUNBOOKS, { format: 1, runbooks: this.runbooks });
  }

  log(incident: Incident, verb: string, detail: string, by: Staff): void {
    const line: IncidentEvent = {
      event_id: randomUUID(),
      incident_id: incident.incident_id,
      verb,
      detail,
      by,
      at: this.#core.now(),
    };
    this.#core.store.appendLine(EVENTS, line);
  }

  eventsOf(incidentId: string, limit = 100): IncidentEvent[] {
    return this.#core.store
      .readLines<IncidentEvent>(EVENTS)
      .filter((event) => event?.incident_id === incidentId)
      .reverse()
      .slice(0, limit);
  }

  get(id: string | undefined): Incident {
    const found = id ? this.incidents.find((item) => item.incident_id === id) : undefined;
    if (!found) throw new Refused(404, "not_found", SAY.incident);
    return found;
  }

  #touch(incident: Incident, by: Staff): void {
    incident.updated_at = this.#core.now();
    incident.updated_by = by;
    this.#save();
  }

  // ---------------------------------------------------------------- reading inputs

  /** A day and an IST minute as an instant, not after now (a clock five minutes fast passes). */
  #instant(day: unknown, time: unknown, env: Env, sentence: string = SAY.when): string {
    const typedDay = clean(day, 10);
    const typedTime = clean(time, 5);
    if (!isDay(typedDay)) throw new Refused(400, "invalid", sentence);
    if (typedDay > env.today) throw new Refused(400, "invalid", SAY.futureDay);
    const at = istInstant(typedDay, typedTime);
    if (!at) throw new Refused(400, "invalid", sentence);
    if (at > addHours(env.now, LIMIT.ahead_minutes / 60))
      throw new Refused(400, "invalid", SAY.future);
    return at;
  }

  #title(value: unknown): string {
    const title = cleanText(value, LIMIT.title);
    if (title.length < LIMIT.title_min) throw new Refused(400, "invalid", SAY.title);
    return title;
  }

  #kind(value: unknown): IncidentKind {
    if (!isKind(value)) throw new Refused(400, "invalid", SAY.kind);
    return value;
  }

  #severity(value: unknown): Severity {
    const severity = clean(value, 10) || "medium";
    if (!SEVERITIES.has(severity)) throw new Refused(400, "invalid", SAY.severity);
    return severity as Severity;
  }

  #occurred(input: Input, awareAt: string, env: Env): string | null {
    if (!clean(input.occurred_day, 10)) return null;
    const at = this.#instant(input.occurred_day, clean(input.occurred_time, 5) || "00:00", env);
    if (at > awareAt) throw new Refused(400, "invalid", SAY.occurredAfter);
    return at;
  }

  #ticked(value: unknown): boolean {
    return value === true || value === "on" || value === "true";
  }

  #open(incident: Incident): void {
    if (incident.status === "closed") throw new Refused(409, "closed", SAY.closed);
  }

  // ---------------------------------------------------------------- logging and changing

  add(input: Input, by: Staff, env: Env): Incident {
    if (this.incidents.length >= LIMIT.incidents)
      throw new Refused(409, "too_many", tooMany(LIMIT.incidents));
    const title = this.#title(input.title);
    const kind = this.#kind(input.kind);
    const severity = this.#severity(input.severity);
    const awareAt = this.#instant(input.aware_day, input.aware_time, env, SAY.noticed);
    const occurredAt = this.#occurred(input, awareAt, env);
    const year = istParts(awareAt).day.slice(0, 4);
    const number = this.next[year] ?? 1;
    const now = this.#core.now();
    const incident: Incident = {
      incident_id: this.pinned ?? randomUUID(),
      reference: referenceOf(year, number),
      title,
      summary: cleanText(input.summary, LIMIT.text),
      kind,
      severity,
      status: "open",
      personal_data: this.#ticked(input.personal_data),
      occurred_at: occurredAt,
      aware_at: awareAt,
      contained_at: null,
      resolved_at: null,
      closed_at: null,
      systems: cleanText(input.systems, LIMIT.text),
      actions: cleanText(input.actions, LIMIT.text),
      cert_in: { not_reportable: null, report: null },
      board: { report: null },
      customers: [],
      lessons: "",
      created_at: now,
      created_by: by,
      updated_at: now,
      updated_by: by,
    };
    this.pinned = null;
    this.next[year] = number + 1;
    this.incidents.push(incident);
    this.#save();
    this.log(incident, "logged", "", by);
    return incident;
  }

  update(incident: Incident, input: Input, by: Staff, env: Env): Incident {
    this.#open(incident);
    const has = (name: string) => Object.prototype.hasOwnProperty.call(input, name);
    const before = flat(incident);
    const next = structuredClone(incident);
    if (has("title")) next.title = this.#title(input.title);
    if (has("summary")) next.summary = cleanText(input.summary, LIMIT.text);
    if (has("kind")) next.kind = this.#kind(input.kind);
    if (has("severity")) next.severity = this.#severity(input.severity);
    if (has("personal_data")) next.personal_data = this.#ticked(input.personal_data);
    if (has("systems")) next.systems = cleanText(input.systems, LIMIT.text);
    if (has("actions")) next.actions = cleanText(input.actions, LIMIT.text);
    if (has("lessons")) next.lessons = cleanText(input.lessons, LIMIT.text);
    if (has("aware_day") || has("aware_time")) {
      const awareAt = this.#instant(input.aware_day, input.aware_time, env, SAY.noticed);
      if (awareAt !== incident.aware_at) {
        if (incident.cert_in.report || incident.board.report)
          throw new Refused(409, "frozen", SAY.frozen);
        next.aware_at = awareAt;
      }
    }
    if (has("occurred_day")) next.occurred_at = this.#occurred(input, next.aware_at, env);
    else if (next.occurred_at && next.occurred_at > next.aware_at)
      throw new Refused(400, "invalid", SAY.occurredAfter);
    const after = flat(next);
    const changed = Object.keys(after).filter((key) => after[key] !== before[key]);
    Object.assign(incident, next);
    this.#touch(incident, by);
    this.log(
      incident,
      "changed",
      changed.length
        ? changed.map((key) => INCIDENT_FIELD_WORDS[key] ?? key).join(", ")
        : "Nothing",
      by,
    );
    return incident;
  }

  status(incident: Incident, input: Input, by: Staff, env: Env): Incident {
    const to = clean(input.to, 12);
    if (!STATUSES.has(to)) throw new Refused(400, "invalid", SAY.status);
    if (to === incident.status) throw new Refused(409, "invalid", SAY.already);
    if (to === "open") {
      incident.status = "open";
      incident.closed_at = null;
      this.#touch(incident, by);
      this.log(incident, "reopened", "", by);
      return incident;
    }
    this.#open(incident);
    const at = this.#instant(input.day, input.time, env);
    if (at < incident.aware_at) throw new Refused(400, "invalid", SAY.beforeNoticed);
    const previous =
      to === "closed"
        ? (incident.resolved_at ?? incident.contained_at)
        : to === "resolved"
          ? incident.contained_at
          : null;
    if (previous && at < previous) throw new Refused(400, "invalid", SAY.beforeLast);
    if (
      to === "closed" &&
      isListed(incident.kind) &&
      !incident.cert_in.report &&
      !incident.cert_in.not_reportable
    )
      throw new Refused(409, "report_first", SAY.closeFirst);
    if (to === "contained") incident.contained_at = at;
    if (to === "resolved") incident.resolved_at = at;
    if (to === "closed") incident.closed_at = at;
    incident.status = to as IncidentStatus;
    this.#touch(incident, by);
    this.log(incident, to, "", by);
    return incident;
  }

  /** Checks a CERT-In report before its copy is kept; answers the instant it went. */
  checkReport(incident: Incident, input: Input, env: Env): string {
    this.#open(incident);
    if (incident.cert_in.report) throw new Refused(409, "invalid", SAY.reportedAlready);
    const sentAt = this.#instant(input.sent_day, input.sent_time, env);
    if (sentAt < incident.aware_at) throw new Refused(400, "invalid", SAY.beforeNoticed);
    if (!CHANNELS.has(clean(input.channel, 10))) throw new Refused(400, "invalid", SAY.channel);
    const lateReason = cleanText(input.late_reason, LIMIT.late_reason);
    if (env.certInHours !== null && isListed(incident.kind)) {
      const reportBy = addHours(incident.aware_at, env.certInHours);
      if (sentAt > reportBy && !lateReason)
        throw new Refused(400, "late_reason", lateSentence(env.certInHours));
    }
    return sentAt;
  }

  report(incident: Incident, input: Input, fileId: string | null, by: Staff, env: Env): Incident {
    const sentAt = this.checkReport(incident, input, env);
    incident.cert_in.report = {
      sent_at: sentAt,
      channel: clean(input.channel, 10) as ReportChannel,
      reference: clean(input.reference, LIMIT.reference),
      sent_by: cleanText(input.sent_by, LIMIT.sent_by) || by.name,
      file_id: fileId,
      late_reason: cleanText(input.late_reason, LIMIT.late_reason),
    };
    this.#touch(incident, by);
    this.log(incident, "reported to CERT-In", fileId ? "with its copy" : "", by);
    return incident;
  }

  notReportable(incident: Incident, input: Input, by: Staff, env: Env): Incident {
    this.#open(incident);
    if (input.undo === true || input.undo === "true") {
      if (!incident.cert_in.not_reportable)
        throw new Refused(409, "invalid", SAY.notReportableNone);
      incident.cert_in.not_reportable = null;
      this.#touch(incident, by);
      this.log(incident, "not reportable taken back", "", by);
      return incident;
    }
    if (incident.cert_in.report) throw new Refused(409, "invalid", SAY.reportedAlready);
    const why = cleanText(input.why, LIMIT.why);
    if (why.length < LIMIT.why_min) throw new Refused(400, "invalid", SAY.why);
    const decidedBy = cleanText(input.decided_by, LIMIT.decided_by);
    if (!decidedBy) throw new Refused(400, "invalid", SAY.decidedBy);
    const on = clean(input.on, 10) || env.today;
    if (!isDay(on)) throw new Refused(400, "invalid", SAY.when);
    if (on > env.today) throw new Refused(400, "invalid", SAY.futureDay);
    incident.cert_in.not_reportable = { why, decided_by: decidedBy, on };
    this.#touch(incident, by);
    this.log(incident, "not reportable", "", by);
    return incident;
  }

  checkBoard(incident: Incident, input: Input, env: Env): string {
    this.#open(incident);
    if (!incident.personal_data) throw new Refused(409, "invalid", SAY.noPersonalData);
    if (incident.board.report) throw new Refused(409, "invalid", SAY.boardAlready);
    const sentAt = this.#instant(input.sent_day, input.sent_time, env);
    if (sentAt < incident.aware_at) throw new Refused(400, "invalid", SAY.beforeNoticed);
    return sentAt;
  }

  boardReport(
    incident: Incident,
    input: Input,
    fileId: string | null,
    by: Staff,
    env: Env,
  ): Incident {
    const sentAt = this.checkBoard(incident, input, env);
    incident.board.report = {
      sent_at: sentAt,
      reference: clean(input.reference, LIMIT.reference),
      file_id: fileId,
    };
    this.#touch(incident, by);
    this.log(incident, "reported to the Board", fileId ? "with its copy" : "", by);
    return incident;
  }

  addCustomer(
    incident: Incident,
    input: Input,
    by: Staff,
    firmOf: (entryId: string) => string | null | undefined,
  ): Incident {
    this.#open(incident);
    if (incident.customers.length >= LIMIT.customers)
      throw new Refused(409, "too_many", SAY.customers);
    const entryId = clean(input.waitlist_entry_id, 64) || null;
    let name = cleanText(input.name, LIMIT.customer_name);
    if (entryId) {
      const firm = firmOf(entryId);
      if (firm === null) throw new Refused(404, "not_found", SAY.waitlist);
      if (!name && firm) name = firm.slice(0, LIMIT.customer_name);
    }
    if (!name) throw new Refused(400, "invalid", SAY.customerName);
    const hoursText = clean(input.hours, 6);
    const hours = /^\d+$/.test(hoursText) ? Number(hoursText) : NaN;
    if (!Number.isInteger(hours) || hours < LIMIT.hours_min || hours > LIMIT.hours_max)
      throw new Refused(400, "invalid", SAY.hours);
    incident.customers.push({
      row_id: randomUUID(),
      name,
      waitlist_entry_id: entryId,
      hours,
      told_at: null,
      how: "",
      withdrawn: false,
    });
    this.#touch(incident, by);
    this.log(incident, "customer added", "", by);
    return incident;
  }

  #row(incident: Incident, rowId: string | undefined): CustomerRow {
    const row = incident.customers.find((item) => item.row_id === rowId);
    if (!row) throw new Refused(404, "not_found", SAY.customer);
    return row;
  }

  told(incident: Incident, rowId: string | undefined, input: Input, by: Staff, env: Env): Incident {
    this.#open(incident);
    const row = this.#row(incident, rowId);
    if (row.withdrawn) throw new Refused(409, "invalid", SAY.withdrawn);
    if (row.told_at) throw new Refused(409, "invalid", SAY.told);
    const at = this.#instant(input.day, input.time, env);
    if (at < incident.aware_at) throw new Refused(400, "invalid", SAY.beforeNoticed);
    row.told_at = at;
    row.how = cleanText(input.how, LIMIT.how);
    this.#touch(incident, by);
    this.log(incident, "customer told", "", by);
    return incident;
  }

  withdraw(incident: Incident, rowId: string | undefined, by: Staff): Incident {
    this.#open(incident);
    const row = this.#row(incident, rowId);
    if (row.withdrawn) throw new Refused(409, "invalid", SAY.withdrawn);
    row.withdrawn = true;
    this.#touch(incident, by);
    this.log(incident, "customer withdrawn", "", by);
    return incident;
  }

  // ---------------------------------------------------------------- runbooks

  setRunbook(kind: unknown, fileId: string | null): void {
    if (!isKind(kind)) throw new Refused(400, "invalid", SAY.runbook);
    if (fileId) this.runbooks[kind] = fileId;
    else delete this.runbooks[kind];
    this.#saveRunbooks();
  }
}

/** The fields an edit may change, flat, to name what changed (never the values). */
function flat(incident: Incident): Record<string, string> {
  return {
    title: incident.title,
    summary: incident.summary,
    kind: incident.kind,
    severity: incident.severity,
    personal_data: incident.personal_data ? "yes" : "no",
    occurred_at: incident.occurred_at ?? "",
    aware_at: incident.aware_at,
    systems: incident.systems,
    actions: incident.actions,
    lessons: incident.lessons,
  };
}
