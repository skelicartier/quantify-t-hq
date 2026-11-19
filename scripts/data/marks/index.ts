/**
 * Trademarks (ws-notes/duties/spec.md §6.4): one record per mark and class with the
 * Registry's status words; its steps (deficiency, examination report and reply, hearing,
 * Journal, opposition and counter-statement, registration); the clocks of §5.2 worked out
 * from the rule book; renewals that restart the last four; the agent's watch hits; and the
 * papers in Files. The startup fee is compared only once a reading is confirmed.
 *
 * Due rows of kind "mark" from 30 days before each open clock but the opposition window
 * (the renewal from the day its window opens); the calendar's `agenda:marks` (every open
 * clock); search (`search:marks`); the `marks` service (`RegisterLookup`). Your trademark
 * agent files; HQ keeps the dates. A record and a reminder, not legal advice.
 */

import { writeFileSync } from "node:fs";

import { Refused } from "../../mail-merge/engine";
import type { DataCore, DueItem } from "../core";
import { addDays } from "../days";
import {
  DUTIES_SERVICES,
  dutyDue,
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
import {
  agendaService,
  searchService,
  type AgendaItem,
  type AgendaSource,
  type SearchSource,
} from "../raise-contracts";
import { toCsv } from "../text";
import type { RegisterSummary } from "../domains/types";
import { findTerms, matchesTerms } from "../../../src/lib/merge/find";
import { dayWords } from "../../../src/lib/data/labels-company";
import { MARK_CLOCKS, MARK_KINDS, MARK_STATUSES } from "../../../src/lib/data/labels-security";
import { MarksBook } from "./book";
import { clocksOf, currentExpiry, feeCheck, isDead, nextClock } from "./clocks";
import { LIMIT, SAY } from "./limits";
import type { Mark, MarkClock } from "./types";
import { WALK_MARK_ID } from "./walk-seed";

const BOM = "﻿";
const COPY_FOLDER = ["Company", "Trademarks"];

export const markHref = (id: string): string => `/data/registers/marks/${id}`;

/** A duty-rules stand-in carries this mark, so any of the registers' test routes may replace it. */
const STAND_IN = Symbol.for("hq.duties.duty-rules.stand-in");

function storedOf(raw: unknown): Partial<Record<DutyRuleKey, DutyStored>> {
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

export async function register(core: DataCore): Promise<void> {
  const book = new MarksBook(core);

  function safely<T>(ask: () => T): T | null {
    try {
      return ask();
    } catch (error) {
      core.log(`marks: a lookup failed: ${error instanceof Error ? error.name : "error"}`);
      return null;
    }
  }

  const today = () => core.day();
  const rules = () => core.need<DutyRulesService>(DUTIES_SERVICES.dutyRules);
  const stateOf = (key: DutyRuleKey): DutyRuleState | null =>
    safely(() => rules()?.state(key) ?? null);

  const clocksFor = (mark: Mark): MarkClock[] => clocksOf(mark, stateOf, today());
  const label = (mark: Mark) => `${mark.name}, class ${mark.class_number}`;

  const rowOf = (mark: Mark) => {
    const clocks = clocksFor(mark);
    const next = nextClock(clocks);
    return {
      ...mark,
      status_label: MARK_STATUSES[mark.status],
      expires_on_now: currentExpiry(mark, stateOf("tm-term")).on,
      next: next?.due_on
        ? {
            key: next.key,
            on: next.due_on,
            words: `${MARK_CLOCKS[next.key].next} ${dayWords(next.due_on)}`,
          }
        : null,
    };
  };

  // ---------------------------------------------------------------- Due and the agenda

  type Item = { key: string; title: string; on: string; from: string };

  /** The open clocks as Due wants them: from 30 days before, the renewal from its window. */
  const dueOf = (mark: Mark): Item[] => {
    const clocks = clocksFor(mark);
    const items: Item[] = [];
    const expiry = clocks.find((clock) => clock.key === "expiry")?.due_on ?? null;
    for (const clock of clocks) {
      if (!clock.open || !clock.due_on) continue;
      if (clock.key === "opposition" || clock.key === "expiry") continue;
      if (clock.key === "renewal_opens") {
        if (!expiry) continue;
        items.push({
          key: `mark:${mark.mark_id}:renewal`,
          title: `Renew ${label(mark)}`,
          on: expiry,
          from: clock.due_on,
        });
        continue;
      }
      items.push({
        key: `mark:${mark.mark_id}:${clock.key}`,
        title: `${clock.title}: ${label(mark)}`,
        on: clock.due_on,
        from: addDays(clock.due_on, -LIMIT.due_ahead),
      });
    }
    return items;
  };

  const subOf = (mark: Mark) =>
    [mark.application_number || "No application number", mark.agent || "No agent recorded"].join(
      " · ",
    );

  const dueItems = (): DueItem[] => {
    const on = today();
    return book.marks.flatMap((mark) =>
      dueOf(mark)
        .filter((item) => on >= item.from)
        .map((item) => ({
          key: item.key,
          kind: "mark" as const,
          title: item.title,
          sub: subOf(mark),
          due_on: item.on,
          href: markHref(mark.mark_id),
        })),
    );
  };
  core.provideDue(dueItems);

  const agenda: AgendaSource = {
    agenda: () =>
      book.marks
        .flatMap((mark) =>
          clocksFor(mark)
            .filter((clock) => clock.open && clock.due_on)
            .map((clock): AgendaItem => ({
              key: `mark:${mark.mark_id}:${clock.key}`,
              kind: "mark",
              title: `${clock.title}: ${label(mark)}`,
              plain: "Trademark deadline",
              sub: subOf(mark),
              on: clock.due_on!,
              remind_days: [14, 7],
              href: markHref(mark.mark_id),
            })),
        )
        .sort((a, b) => a.on.localeCompare(b.on) || a.title.localeCompare(b.title)),
  };
  core.provide(agendaService("marks"), agenda);

  // ---------------------------------------------------------------- search

  const textOf = (mark: Mark) => [mark.name, mark.application_number, mark.goods, mark.agent];
  const search: SearchSource = {
    search: ({ terms, kind, limit }) => {
      if (terms.length === 0 || (kind !== null && kind !== "mark")) return [];
      const found = book.marks
        .filter((mark) => matchesTerms(textOf(mark), terms))
        .sort((a, b) => a.name.localeCompare(b.name) || a.class_number - b.class_number);
      if (found.length === 0) return [];
      return [
        {
          kind: "mark",
          count: found.length,
          hits: found.slice(0, Math.max(0, limit)).map((mark) => ({
            kind: "mark" as const,
            id: mark.mark_id,
            title: mark.name,
            subtitle: `Class ${mark.class_number} · ${MARK_STATUSES[mark.status]}`,
            snippet: snippetOf(mark.goods, terms),
            href: markHref(mark.mark_id),
          })),
        },
      ];
    },
  };
  core.provide(searchService("marks"), search);

  // ---------------------------------------------------------------- the service

  const service: RegisterLookup & { summary(): RegisterSummary } = {
    usedFor: (fileId) =>
      book.marks
        .filter((mark) => mark.file_ids.includes(fileId))
        .map((mark) => ({
          label: `${mark.name}, class ${mark.class_number}, in Trademarks`,
          href: markHref(mark.mark_id),
        })),
    count: () => book.marks.filter((mark) => !isDead(mark)).length,
    summary: () => {
      const items = book.marks
        .flatMap((mark) => dueOf(mark))
        .sort((a, b) => a.on.localeCompare(b.on) || a.title.localeCompare(b.title));
      const live = book.marks.filter((mark) => !isDead(mark)).length;
      return {
        records: book.marks.length,
        open: live,
        report_due: 0,
        next: items[0] ? { title: items[0].title, on: items[0].on } : null,
      };
    },
  };
  core.provide(DUTIES_SERVICES.marks, service);

  // ---------------------------------------------------------------- routes (fixed paths first)

  const feeRule = () => {
    const state = stateOf("tm-fee-startup");
    return {
      rule: state ? ruleLineOf(state) : null,
      readings: dutyRuleOf("tm-fee-startup").readings,
    };
  };

  core.route("GET", "/data/marks", () => {
    const marks = [...book.marks].sort(
      (a, b) =>
        Number(isDead(a)) - Number(isDead(b)) ||
        a.name.localeCompare(b.name) ||
        a.class_number - b.class_number,
    );
    return {
      marks: marks.map(rowOf),
      counts: {
        all: book.marks.length,
        live: book.marks.filter((mark) => !isDead(mark)).length,
      },
      fee: feeRule(),
      rules_here: rules() !== null,
      today: today(),
    };
  });

  core.route("POST", "/data/marks", (ctx) => {
    const by = ctx.staff();
    return { mark: rowOf(book.add(ctx.body, by)) };
  });

  const detailOf = (mark: Mark) => {
    const term = stateOf("tm-term");
    const expiry = currentExpiry(mark, term);
    const fee = feeCheck(mark, stateOf("tm-fee-startup"));
    return {
      mark: rowOf(mark),
      clocks: clocksFor(mark),
      fee_check: fee ? { words: fee.words, rule: feeRule().rule } : null,
      fee: feeRule(),
      /** The renewal form's pre-filled day: the expiry now plus the term. */
      renewal_expires_on: expiry.on && term ? dutyDue(term, expiry.on) : null,
      events: book.eventsOf(mark.mark_id),
      files: mark.file_ids.map((id) => ({ file_id: id, file: fileLink(core, id) })),
      file_choices: fileChoices(core),
      files_here: core.need("files") !== null,
      rules_here: rules() !== null,
      today: today(),
    };
  };

  core.route("GET", "/data/marks/:id", (ctx) => detailOf(book.get(ctx.params[0])));

  core.route("POST", "/data/marks/:id/update", (ctx) => {
    const by = ctx.staff();
    return { mark: rowOf(book.update(book.get(ctx.params[0]), ctx.body, by)) };
  });

  core.route("POST", "/data/marks/:id/step", (ctx) => {
    const by = ctx.staff();
    return { mark: rowOf(book.step(book.get(ctx.params[0]), ctx.body, by)) };
  });

  core.route("POST", "/data/marks/:id/status", (ctx) => {
    const by = ctx.staff();
    return { mark: rowOf(book.setStatus(book.get(ctx.params[0]), ctx.body, by)) };
  });

  core.route("POST", "/data/marks/:id/renewed", (ctx) => {
    const by = ctx.staff();
    const mark = book.get(ctx.params[0]);
    const now = currentExpiry(mark, stateOf("tm-term")).on;
    return { mark: rowOf(book.renewed(mark, ctx.body, now, by)) };
  });

  core.route("POST", "/data/marks/:id/watch", (ctx) => {
    const by = ctx.staff();
    return { mark: rowOf(book.watch(book.get(ctx.params[0]), ctx.body, by)) };
  });

  /** Attach a file from Files, or the bytes put into Company › Trademarks; or detach one. */
  core.route("POST", "/data/marks/:id/files", async (ctx) => {
    const by = ctx.staff();
    const mark = book.get(ctx.params[0]);
    const fileId = clean(ctx.body.file_id, 64);
    if (ctx.body.detach === true || ctx.body.detach === "true") {
      book.detach(mark, fileId, by);
      return detailOf(mark);
    }
    if (!copyGiven(ctx.body)) throw new Refused(400, "invalid", SAY.file);
    checkCopy(core, ctx.body);
    const file = await keepCopy(
      core,
      ctx.body,
      {
        folder: COPY_FOLDER,
        title: `${mark.name}, class ${mark.class_number}`,
        note: "A trademark paper",
      },
      by,
    );
    book.attach(mark, file.file_id, by);
    return detailOf(mark);
  });

  // ---------------------------------------------------------------- the register as a CSV

  core.builds.provide("marks_csv", async (handle, input) => {
    const marks = [...book.marks].sort(
      (a, b) => a.name.localeCompare(b.name) || a.class_number - b.class_number,
    );
    handle.setProgress(0, marks.length);
    await core.yield();
    const day = (clocks: MarkClock[], key: MarkClock["key"]) =>
      clocks.find((clock) => clock.key === key)?.due_on ?? "";
    const rows = marks.map((mark) => {
      const clocks = clocksFor(mark);
      return [
        mark.name,
        MARK_KINDS[mark.kind],
        mark.class_number,
        mark.application_number,
        mark.applied_on ?? "",
        mark.applicant,
        mark.agent,
        MARK_STATUSES[mark.status],
        mark.status_on ?? "",
        mark.steps.journal_number,
        mark.steps.certificate_number,
        day(clocks, "deficiency"),
        day(clocks, "exam_reply"),
        day(clocks, "hearing"),
        day(clocks, "opposition"),
        day(clocks, "counter_statement"),
        day(clocks, "expiry"),
        day(clocks, "renewal_opens"),
        day(clocks, "late_renewal_ends"),
        mark.fee_paid ?? "",
        mark.goods,
      ];
    });
    const text =
      BOM +
      toCsv(
        [
          "mark",
          "kind",
          "class",
          "application_number",
          "applied_on",
          "applicant",
          "agent",
          "status",
          "status_on",
          "journal_number",
          "certificate_number",
          "remedy_deficiency_by",
          "reply_by",
          "hearing_on",
          "opposition_closes",
          "counter_statement_by",
          "expires_on",
          "renewal_opens",
          "late_renewal_ends",
          "fee_paid_rupees",
          "goods",
        ],
        rows,
      );
    writeFileSync(handle.path, text, { mode: 0o600 });
    handle.setProgress(marks.length, marks.length);
    core.store.appendLine("marks/exports.jsonl", {
      at: core.now(),
      by: input.by,
      kind: "marks",
      rows: rows.length,
    });
    return { name: `Trademarks ${today()}.csv`, type: "text/csv; charset=utf-8" };
  });

  // ---------------------------------------------------------------- test routes

  if (core.testRoutes) {
    const installRules = (body: Record<string, unknown>) => {
      const current = core.need<DutyRulesService & { [STAND_IN]?: true }>(
        DUTIES_SERVICES.dutyRules,
      );
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
    };

    core.route("POST", "/data/_test/marks/duty-rules", (ctx) => {
      ctx.staff();
      return installRules(ctx.body);
    });

    /** The walk's stand-ins: the rule book's own amounts, and `walk-mark` for the next mark. */
    core.route("POST", "/data/_test/marks/seed", (ctx) => {
      ctx.staff();
      const exists = book.marks.some((mark) => mark.mark_id === WALK_MARK_ID);
      book.pinned = exists ? null : WALK_MARK_ID;
      return { pinned: book.pinned, exists, rules: installRules({}) };
    });

    core.route("GET", "/data/_test/marks/agenda", () => ({
      items: core.need<AgendaSource>(agendaService("marks"))?.agenda(today()) ?? [],
      today: today(),
    }));

    core.route("GET", "/data/_test/marks/search", (ctx) => {
      const query = clean(ctx.query.get("q"), LIMIT.search);
      return {
        groups:
          core.need<SearchSource>(searchService("marks"))?.search({
            query,
            terms: findTerms(query),
            kind: null,
            limit: 5,
          }) ?? [],
      };
    });
  }
}
