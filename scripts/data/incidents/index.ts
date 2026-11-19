/**
 * Incidents (ws-notes/duties/spec.md §6.3): the moment each was noticed, in IST; CERT-In's
 * report due within the rule's hours (6 as shipped) when its kind is on the directions'
 * list; the Data Protection Board's detailed report for personal data, not worked out
 * before the rule's start day; each customer's contractual hours; the report's record (when,
 * how, reference, copy), never sent from here; and a runbook per kind in Files.
 *
 * Due rows of kind "incident" (never Owner-only) sit on each deadline's IST day; search
 * (`search:incidents`) reads the reference, title, kind and summary, never what is affected,
 * what was done or a customer's name; there is no calendar feed (a 6-hour clock does not
 * belong in a feed read every few hours). Provides `incidents` (`RegisterLookup`). Nothing
 * here sends, files or pays anything. A record and a reminder, not legal advice.
 */

import { writeFileSync } from "node:fs";

import { Refused } from "../../mail-merge/engine";
import type { DataCore, DueItem } from "../core";
import {
  DUTIES_SERVICES,
  dutyRuleOf,
  isDutyRuleKey,
  ruleLineOf,
  standInDutyRules,
  type DutyRuleKey,
  type DutyRuleState,
  type DutyRulesService,
  type DutyStored,
  type RegisterLookup,
} from "../duties-contracts";
import { clean } from "../guard";
import { checkCopy, copyGiven, fileChoices, fileLink, keepCopy } from "../meetings/copy";
import { snippetOf } from "../notes/snippet";
import type { Staff } from "../protocol";
import {
  RAISE_SERVICES,
  searchService,
  type SearchSource,
  type WaitlistFeed,
} from "../raise-contracts";
import { toCsv } from "../text";
import type { CompanyInternal } from "../company/types";
import type { RegisterSummary } from "../domains/types";
import { findTerms, matchesTerms } from "../../../src/lib/merge/find";
import { istParts, istWords } from "../../../src/lib/data/labels-duties";
import {
  INCIDENT_SEVERITIES,
  INCIDENT_STATUSES,
  REPORT_CHANNELS,
} from "../../../src/lib/data/labels-security";
import { IncidentsBook, type Env } from "./book";
import { certInReportBy, clockOf } from "./clock";
import { KINDS, isListed, kindLabel } from "./kinds";
import { LIMIT, SAY } from "./limits";
import type { Incident } from "./types";
import { WALK_INCIDENT_ID, WALK_NOW } from "./walk-seed";

const BOM = "﻿";
const BOARD_STARTS_ON = dutyRuleOf("dpdp-board-report").starts_on;
const REPORT_FOLDER = ["Security", "Incidents"];

export const incidentHref = (id: string): string => `/data/registers/incidents/${id}`;

/** What the Registers Summary and the overview ask of incidents, besides `RegisterLookup`. */
export type IncidentsInternal = RegisterLookup & { summary(): RegisterSummary };

/** A duty-rules stand-in carries this mark, so any of the registers' test routes may replace it. */
const STAND_IN = Symbol.for("hq.duties.duty-rules.stand-in");

/** The body's `stored`, read as the rule book would hold it; anything else is left out. */
export function storedOf(raw: unknown): Partial<Record<DutyRuleKey, DutyStored>> {
  const stored: Partial<Record<DutyRuleKey, DutyStored>> = {};
  if (!raw || typeof raw !== "object") return stored;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isDutyRuleKey(key) || !value || typeof value !== "object") continue;
    const record = value as Record<string, unknown>;
    const item: DutyStored = {};
    if (typeof record.amount === "number" && Number.isFinite(record.amount))
      item.amount = record.amount;
    if (typeof record.reading === "number" && Number.isInteger(record.reading))
      item.reading = record.reading;
    const confirmed = record.confirmed as Record<string, unknown> | undefined;
    if (confirmed && typeof confirmed.name === "string" && typeof confirmed.on === "string")
      item.confirmed = { name: confirmed.name, on: confirmed.on };
    stored[key] = item;
  }
  return stored;
}

/**
 * `POST /data/_test/<module>/duty-rules` (spec §3.3): installs `standInDutyRules` only while
 * no real rule book answers; `{ on: false }` removes a stand-in. Shared in shape by the three
 * registers, so the walk may install it from any of them.
 */
export function dutyRulesStandIn(core: DataCore, body: Record<string, unknown>) {
  const current = core.need<DutyRulesService & { [STAND_IN]?: true }>(DUTIES_SERVICES.dutyRules);
  const isStandIn = current !== null && current[STAND_IN] === true;
  if (body.on === false) {
    if (isStandIn) core.provide(DUTIES_SERVICES.dutyRules, null);
    return { installed: false };
  }
  if (current && !isStandIn) return { installed: false, real: true };
  const fake = Object.assign(
    standInDutyRules(() => core.day(), storedOf(body.stored)),
    {
      [STAND_IN]: true as const,
    },
  );
  core.provide(DUTIES_SERVICES.dutyRules, fake);
  return { installed: true };
}

export async function register(core: DataCore): Promise<void> {
  const book = new IncidentsBook(core);

  /** The module's clock: pinned under a test route so walks read fixed words; else now. */
  let pinnedNow: string | null = null;
  const now = (): string => pinnedNow ?? core.now();
  const today = (): string => (pinnedNow ? istParts(pinnedNow).day : core.day());

  function safely<T>(ask: () => T): T | null {
    try {
      return ask();
    } catch (error) {
      core.log(`incidents: a lookup failed: ${error instanceof Error ? error.name : "error"}`);
      return null;
    }
  }

  const rules = () => core.need<DutyRulesService>(DUTIES_SERVICES.dutyRules);
  const certInState = (): DutyRuleState | null =>
    safely(() => rules()?.state("cert-in-report", today()) ?? null);
  /** The Board's rule on the day the incident was noticed, in IST. */
  const boardState = (incident: Incident): DutyRuleState | null =>
    safely(() => rules()?.state("dpdp-board-report", istParts(incident.aware_at).day) ?? null);
  const hoursOf = (state: DutyRuleState | null): number | null =>
    state && state.usable && state.unit === "hours" ? state.amount : null;

  const env = (): Env => ({ now: now(), today: today(), certInHours: hoursOf(certInState()) });

  const clockFor = (incident: Incident, certIn = certInState()) =>
    clockOf(
      incident,
      { certIn, board: boardState(incident), boardStartsOn: BOARD_STARTS_ON },
      now(),
    );

  const detailOf = (incident: Incident) => ({
    ...incident,
    kind_label: kindLabel(incident.kind),
    listed: isListed(incident.kind),
    clock: clockFor(incident),
  });

  const rowOf = (incident: Incident, certIn: DutyRuleState | null) => {
    const clock = clockFor(incident, certIn);
    return {
      incident_id: incident.incident_id,
      reference: incident.reference,
      title: incident.title,
      kind: incident.kind,
      kind_label: kindLabel(incident.kind),
      severity: incident.severity,
      status: incident.status,
      personal_data: incident.personal_data,
      aware_at: incident.aware_at,
      aware_words: istWords(incident.aware_at),
      reported_at: incident.cert_in.report?.sent_at ?? null,
      cert_in: clock.cert_in,
    };
  };

  const contact = () => {
    const company = core.need<CompanyInternal>("company");
    const record = company ? safely(() => company.record().cert_in) : null;
    return record && record.name
      ? { name: record.name, designation: record.designation, sent_on: record.sent_on }
      : null;
  };

  const waitlist = (): { entry_id: string; firm: string }[] => {
    const feed = core.need<WaitlistFeed>(RAISE_SERVICES.waitlistFeed);
    if (!feed) return [];
    return (
      safely(() =>
        feed
          .entries()
          .map((entry) => ({ entry_id: entry.entry_id, firm: entry.firm }))
          .sort((a, b) => a.firm.localeCompare(b.firm)),
      ) ?? []
    );
  };

  /** A waitlist firm's name; null when that entry is not there; undefined without the waitlist. */
  const firmOf = (entryId: string): string | null | undefined => {
    const feed = core.need<WaitlistFeed>(RAISE_SERVICES.waitlistFeed);
    if (!feed) return undefined;
    return safely(() => feed.entries().find((entry) => entry.entry_id === entryId)?.firm) ?? null;
  };

  const isOpen = (incident: Incident) => incident.status !== "closed";
  const reportDue = (incident: Incident, certIn: DutyRuleState | null) => {
    if (!isOpen(incident)) return false;
    const state = clockFor(incident, certIn).cert_in.state;
    return state === "due" || state === "overdue";
  };

  // ---------------------------------------------------------------- Due

  const dueItems = (): DueItem[] => {
    const certIn = certInState();
    const items: DueItem[] = [];
    for (const incident of book.incidents) {
      if (!isOpen(incident)) continue;
      const clock = clockFor(incident, certIn);
      const href = incidentHref(incident.incident_id);
      const noticed = istWords(incident.aware_at);
      const sub = `${kindLabel(incident.kind)} · noticed ${noticed}`;
      if (clock.cert_in.state === "due" || clock.cert_in.state === "overdue")
        items.push({
          key: `incident:${incident.incident_id}:cert-in`,
          kind: "incident",
          title: `Report ${incident.reference} to CERT-In by ${istParts(clock.cert_in.report_by).time} IST`,
          sub,
          due_on: istParts(clock.cert_in.report_by).day,
          href,
        });
      if (clock.board.state === "due" || clock.board.state === "overdue")
        items.push({
          key: `incident:${incident.incident_id}:board`,
          kind: "incident",
          title: `Report ${incident.reference} to the Data Protection Board by ${istParts(clock.board.report_by).time} IST`,
          sub,
          due_on: istParts(clock.board.report_by).day,
          href,
        });
      for (const customer of clock.customers) {
        if (customer.state === "told") continue;
        const row = incident.customers.find((item) => item.row_id === customer.row_id);
        items.push({
          key: `incident:${incident.incident_id}:customer:${customer.row_id}`,
          kind: "incident",
          title: `Tell ${row?.name ?? "the customer"} about ${incident.reference} by ${istParts(customer.tell_by).time} IST`,
          sub,
          due_on: istParts(customer.tell_by).day,
          href,
        });
      }
    }
    return items;
  };
  core.provideDue(dueItems);

  // ---------------------------------------------------------------- search

  const textOf = (incident: Incident): string[] => [
    incident.reference,
    incident.title,
    kindLabel(incident.kind),
    incident.summary,
  ];
  const search: SearchSource = {
    search: ({ terms, kind, limit }) => {
      if (terms.length === 0 || (kind !== null && kind !== "incident")) return [];
      const found = book.incidents
        .filter((incident) => matchesTerms(textOf(incident), terms))
        .sort((a, b) => b.aware_at.localeCompare(a.aware_at));
      if (found.length === 0) return [];
      return [
        {
          kind: "incident",
          count: found.length,
          hits: found.slice(0, Math.max(0, limit)).map((incident) => ({
            kind: "incident" as const,
            id: incident.incident_id,
            title: `${incident.reference} ${incident.title}`,
            subtitle: `${kindLabel(incident.kind)} · ${INCIDENT_STATUSES[incident.status].label}`,
            snippet: snippetOf(incident.summary, terms),
            href: incidentHref(incident.incident_id),
          })),
        },
      ];
    },
  };
  core.provide(searchService("incidents"), search);

  // ---------------------------------------------------------------- the service

  const service: IncidentsInternal = {
    usedFor: (fileId) => {
      const lines: { label: string; href: string }[] = [];
      for (const incident of book.incidents) {
        if (incident.cert_in.report?.file_id === fileId)
          lines.push({
            label: `Report to CERT-In for ${incident.reference}, in Incidents`,
            href: incidentHref(incident.incident_id),
          });
        if (incident.board.report?.file_id === fileId)
          lines.push({
            label: `Report to the Data Protection Board for ${incident.reference}, in Incidents`,
            href: incidentHref(incident.incident_id),
          });
      }
      for (const kind of KINDS)
        if (book.runbooks[kind] === fileId)
          lines.push({
            label: `Runbook for “${kindLabel(kind)}”, in Incidents`,
            href: "/data/registers/incidents?runbooks=1",
          });
      return lines;
    },
    count: () => book.incidents.filter(isOpen).length,
    summary: () => {
      const certIn = certInState();
      const open = book.incidents.filter(isOpen);
      const next = dueItems().sort(
        (a, b) => a.due_on.localeCompare(b.due_on) || a.title.localeCompare(b.title),
      )[0];
      return {
        records: book.incidents.length,
        open: open.length,
        report_due: open.filter((incident) => reportDue(incident, certIn)).length,
        next: next ? { title: next.title, on: next.due_on } : null,
      };
    },
  };
  core.provide(DUTIES_SERVICES.incidents, service);

  // ---------------------------------------------------------------- routes (fixed paths first)

  core.route("GET", "/data/incidents", (ctx) => {
    const view = ctx.query.get("view") === "all" ? "all" : "open";
    const certIn = certInState();
    const shown = book.incidents
      .filter((incident) => view === "all" || isOpen(incident))
      .sort((a, b) => b.aware_at.localeCompare(a.aware_at));
    return {
      view,
      incidents: shown.map((incident) => rowOf(incident, certIn)),
      counts: {
        open: book.incidents.filter(isOpen).length,
        all: book.incidents.length,
        report_due: book.incidents.filter((incident) => reportDue(incident, certIn)).length,
      },
      contact: contact(),
      rule: certIn ? ruleLineOf(certIn) : null,
      kinds: KINDS.map((kind) => ({ kind, label: kindLabel(kind), listed: isListed(kind) })),
      today: today(),
      now: now(),
    };
  });

  core.route("POST", "/data/incidents", (ctx) => {
    const by = ctx.staff();
    return { incident: detailOf(book.add(ctx.body, by, env())) };
  });

  const runbooksAnswer = () => ({
    runbooks: KINDS.map((kind) => ({
      kind,
      label: kindLabel(kind),
      file: fileLink(core, book.runbooks[kind] ?? null),
    })),
    files: fileChoices(core),
    files_here: core.need("files") !== null,
  });

  core.route("GET", "/data/incidents/runbooks", () => runbooksAnswer());

  core.route("POST", "/data/incidents/runbooks", (ctx) => {
    ctx.staff();
    const fileId = clean(ctx.body.file_id, 64) || null;
    if (fileId) {
      if (!core.need("files")) throw new Refused(409, "files_missing", SAY.filesMissing);
      if (!fileLink(core, fileId)) throw new Refused(404, "not_found", SAY.file);
    }
    book.setRunbook(ctx.body.kind, fileId);
    return runbooksAnswer();
  });

  core.route("GET", "/data/incidents/:id", (ctx) => {
    const incident = book.get(ctx.params[0]);
    const runbook = fileLink(core, book.runbooks[incident.kind] ?? null);
    return {
      incident: detailOf(incident),
      events: book.eventsOf(incident.incident_id),
      runbook,
      contact: contact(),
      report_file: fileLink(core, incident.cert_in.report?.file_id ?? null),
      board_file: fileLink(core, incident.board.report?.file_id ?? null),
      files: fileChoices(core),
      files_here: core.need("files") !== null,
      waitlist: waitlist(),
      today: today(),
      now: now(),
    };
  });

  core.route("POST", "/data/incidents/:id/update", (ctx) => {
    const by = ctx.staff();
    return { incident: detailOf(book.update(book.get(ctx.params[0]), ctx.body, by, env())) };
  });

  core.route("POST", "/data/incidents/:id/status", (ctx) => {
    const by = ctx.staff();
    return { incident: detailOf(book.status(book.get(ctx.params[0]), ctx.body, by, env())) };
  });

  /** A copy of a report kept in Security › Incidents, after every field has passed. */
  async function copyOf(
    incident: Incident,
    body: Record<string, unknown>,
    title: string,
    by: Staff,
  ): Promise<string | null> {
    if (!copyGiven(body)) return null;
    checkCopy(core, body);
    const file = await keepCopy(
      core,
      body,
      { folder: REPORT_FOLDER, title, note: `${title}, as sent` },
      by,
    );
    return file.file_id;
  }

  core.route("POST", "/data/incidents/:id/cert-in/report", async (ctx) => {
    const by = ctx.staff();
    const incident = book.get(ctx.params[0]);
    const asked = env();
    book.checkReport(incident, ctx.body, asked);
    const fileId = await copyOf(incident, ctx.body, `${incident.reference} report to CERT-In`, by);
    return { incident: detailOf(book.report(incident, ctx.body, fileId, by, asked)) };
  });

  core.route("POST", "/data/incidents/:id/cert-in/not-reportable", (ctx) => {
    const by = ctx.staff();
    return {
      incident: detailOf(book.notReportable(book.get(ctx.params[0]), ctx.body, by, env())),
    };
  });

  core.route("POST", "/data/incidents/:id/board/report", async (ctx) => {
    const by = ctx.staff();
    const incident = book.get(ctx.params[0]);
    const asked = env();
    book.checkBoard(incident, ctx.body, asked);
    const fileId = await copyOf(
      incident,
      ctx.body,
      `${incident.reference} report to the Data Protection Board`,
      by,
    );
    return { incident: detailOf(book.boardReport(incident, ctx.body, fileId, by, asked)) };
  });

  core.route("POST", "/data/incidents/:id/customers", (ctx) => {
    const by = ctx.staff();
    return { incident: detailOf(book.addCustomer(book.get(ctx.params[0]), ctx.body, by, firmOf)) };
  });

  core.route("POST", "/data/incidents/:id/customers/:rowId/told", (ctx) => {
    const by = ctx.staff();
    const incident = book.get(ctx.params[0]);
    return { incident: detailOf(book.told(incident, ctx.params[1], ctx.body, by, env())) };
  });

  core.route("POST", "/data/incidents/:id/customers/:rowId/withdraw", (ctx) => {
    const by = ctx.staff();
    const incident = book.get(ctx.params[0]);
    return { incident: detailOf(book.withdraw(incident, ctx.params[1], by)) };
  });

  // ---------------------------------------------------------------- the register as a CSV

  /** One row per incident. What is affected and what was done stay out: a CSV travels. */
  core.builds.provide("incidents_csv", async (handle, input) => {
    const certIn = certInState();
    const rows = [...book.incidents].sort((a, b) => a.aware_at.localeCompare(b.aware_at));
    handle.setProgress(0, rows.length);
    await core.yield();
    const lines = rows.map((incident) => {
      const clock = clockFor(incident, certIn);
      const report = incident.cert_in.report;
      return [
        incident.reference,
        incident.title,
        kindLabel(incident.kind),
        isListed(incident.kind) ? "yes" : "no",
        INCIDENT_SEVERITIES[incident.severity],
        INCIDENT_STATUSES[incident.status].label,
        incident.personal_data ? "yes" : "no",
        incident.occurred_at ?? "",
        incident.aware_at,
        incident.contained_at ?? "",
        incident.resolved_at ?? "",
        incident.closed_at ?? "",
        certInReportBy(incident, certIn) ?? "",
        clock.cert_in.state,
        report?.sent_at ?? "",
        report ? REPORT_CHANNELS[report.channel] : "",
        report?.reference ?? "",
        report?.late_reason ?? "",
        incident.cert_in.not_reportable?.why ?? "",
        incident.board.report?.sent_at ?? "",
        incident.customers.filter((row) => !row.withdrawn).length,
        incident.summary,
      ];
    });
    const text =
      BOM +
      toCsv(
        [
          "reference",
          "title",
          "kind",
          "on_cert_in_list",
          "severity",
          "status",
          "personal_data",
          "occurred_at",
          "noticed_at",
          "contained_at",
          "resolved_at",
          "closed_at",
          "cert_in_report_by",
          "cert_in_state",
          "cert_in_sent_at",
          "cert_in_channel",
          "cert_in_reference",
          "late_reason",
          "not_reportable_why",
          "board_sent_at",
          "customers",
          "summary",
        ],
        lines,
      );
    writeFileSync(handle.path, text, { mode: 0o600 });
    handle.setProgress(rows.length, rows.length);
    core.store.appendLine("incidents/exports.jsonl", {
      at: core.now(),
      by: input.by,
      kind: "incidents",
      rows: rows.length,
    });
    return { name: `Incidents ${core.day()}.csv`, type: "text/csv; charset=utf-8" };
  });

  // ---------------------------------------------------------------- test routes

  if (core.testRoutes) {
    core.route("POST", "/data/_test/incidents/now", (ctx) => {
      ctx.staff();
      const at = ctx.body.at;
      if (at === null || at === undefined || at === "") pinnedNow = null;
      else if (typeof at === "string" && !Number.isNaN(Date.parse(at)))
        pinnedNow = new Date(at).toISOString();
      else throw new Refused(400, "invalid", "Give an instant, or null.");
      return { now: now(), today: today(), pinned: pinnedNow !== null };
    });

    core.route("POST", "/data/_test/incidents/duty-rules", (ctx) => {
      ctx.staff();
      return dutyRulesStandIn(core, ctx.body);
    });

    /**
     * The walk's stand-ins: the module's clock pinned at 23:00 IST, 13 Nov 2026, the rule
     * book's own amounts, and `walk-incident` for the next incident logged. Safe twice.
     */
    core.route("POST", "/data/_test/incidents/seed", (ctx) => {
      ctx.staff();
      pinnedNow = WALK_NOW;
      const exists = book.incidents.some((item) => item.incident_id === WALK_INCIDENT_ID);
      book.pinned = exists ? null : WALK_INCIDENT_ID;
      return { now: now(), pinned: book.pinned, exists, rules: dutyRulesStandIn(core, {}) };
    });

    core.route("GET", "/data/_test/incidents/search", (ctx) => {
      const query = clean(ctx.query.get("q"), LIMIT.search);
      return {
        groups:
          core.need<SearchSource>(searchService("incidents"))?.search({
            query,
            terms: findTerms(query),
            kind: null,
            limit: 5,
          }) ?? [],
      };
    });
  }
}
