/**
 * Logs and time (ws-notes/security/spec.md §7): one record per system that keeps logs, a tool
 * from Systems or a name he types; what it logs, where they go, for how long, whether they are
 * kept in India, the clock it keeps time by, and the quarterly look. Beside it, what CERT-In
 * asks: the duties rule book's `cert-in-logs` and `cert-in-time` lines, the NIC and NPL time
 * servers CERT-In's FAQ names, and both readings of where logs may be kept (direction (iv) and
 * FAQ 35 disagree, so both are printed and nothing is judged).
 *
 * Due rows of kind `log`; no calendar item and no search. Provides `logs` (`LogsLookup`). Nothing
 * here reads a log, asks a time server or opens a socket.
 */

import type { Answer, Ctx, DataCore, DueItem } from "../core";
import {
  DUTIES_SERVICES,
  ruleLineOf,
  type DutyRuleKey,
  type DutyRulesService,
  type RuleLine,
} from "../duties-contracts";
import type { FilesService } from "../files/index";
import { clean } from "../guard";
import { checkCopy, copyGiven, fileChoices, keepCopy } from "../meetings/copy";
import {
  SECURITY_SERVICES,
  standInTools,
  type EvidenceOption,
  type LogsLookup,
  type SummaryLine,
  type ToolView,
  type ToolsLookup,
} from "../security-contracts";
import { toCsv } from "../text";
import { dayWords } from "../../../src/lib/data/labels-company";
import {
  LOG_KINDS,
  LOG_PLACE_READINGS,
  NIC_TIME_SERVERS,
  NPL_TIME_SERVERS,
  countWords,
  everyWords,
  ofWords,
} from "../../../src/lib/data/labels-controls";
import { LOG_PLACES, TIME_SOURCES } from "../../../src/lib/data/labels-devices";
import { LogsBook } from "./book";
import {
  keepsLongEnough,
  latestLook,
  logLines,
  lookInDue,
  lookMonthsOf,
  nextLookOf,
  timeKnown,
} from "./checks";
import { FILES_FOLDER } from "./limits";
import type { LogSystem } from "./types";
import { WALK_LOG_ID, WALK_TOOLS } from "./walk-seed";

const BOM = "﻿";
const PAGE = "/data/systems/logs";
const FLAG_WORDS = { yes: "Yes", no: "No", "": "Not known" } as const;

const STAND_IN = Symbol.for("hq.security.stand-in");
type Marked = { [STAND_IN]?: true };

export async function register(core: DataCore): Promise<void> {
  const book = new LogsBook(core);

  function safely<T>(ask: () => T): T | null {
    try {
      return ask();
    } catch (error) {
      core.log(`logs: a lookup failed: ${error instanceof Error ? error.name : "error"}`);
      return null;
    }
  }

  const today = () => core.day();
  const files = () => core.need<FilesService>("files");
  const toolsLookup = () => core.need<ToolsLookup>(SECURITY_SERVICES.tools);
  /** Every tool not retired, for the picker; null when Tools is not loaded here. */
  const tools = (): ToolView[] | null => {
    const lookup = toolsLookup();
    if (!lookup) return null;
    return (safely(() => lookup.tools()) ?? []).filter((tool) => !tool.retired);
  };
  const lineOf = (key: DutyRuleKey): RuleLine | null => {
    const rules = core.need<DutyRulesService>(DUTIES_SERVICES.dutyRules);
    const state = rules ? safely(() => rules.state(key)) : null;
    return state ? ruleLineOf(state) : null;
  };
  const addedOn = (system: LogSystem) => core.day(system.created_at);
  const href = (system: LogSystem) => `${PAGE}/${system.log_id}`;

  // ---------------------------------------------------------------- rows

  const rowOf = (system: LogSystem, on: string) => {
    const last = latestLook(system.checks);
    const next = nextLookOf(last?.on ?? null, addedOn(system), lookMonthsOf(book.checkMonths));
    const tool = system.tool_id
      ? (tools()?.find((item) => item.tool_id === system.tool_id) ?? null)
      : null;
    return {
      log_id: system.log_id,
      tool_id: system.tool_id,
      name: system.name,
      kinds: system.kinds,
      where: system.where,
      retention_days: system.retention_days,
      place: system.place,
      region: system.region,
      time_source: system.time_source,
      time_detail: system.time_detail,
      zone_recorded: system.zone_recorded,
      retired: system.retired,
      notes: system.notes,
      created_at: system.created_at,
      created_by: system.created_by,
      updated_at: system.updated_at,
      updated_by: system.updated_by,
      tool: tool ? { tool_id: tool.tool_id, name: tool.name, href: tool.href } : null,
      added_on: addedOn(system),
      last_look: last,
      looks: system.checks.length,
      next_look: system.retired ? null : next,
      overdue: !system.retired && next < on,
      due: !system.retired && lookInDue(next, on),
      lines: logLines(system, {
        last_on: last?.on ?? null,
        added_on: addedOn(system),
        next,
        today: on,
      }),
      href: href(system),
    };
  };
  type Row = ReturnType<typeof rowOf>;

  const countsOf = (rows: readonly Row[]) => {
    const live = rows.filter((row) => !row.retired);
    return {
      systems: live.length,
      short: live.filter((row) => row.retention_days !== null && !keepsLongEnough(row)).length,
      outside: live.filter((row) => row.place === "outside").length,
      time_unknown: live.filter((row) => row.time_source === "" || row.time_source === "not_known")
        .length,
    };
  };

  const sortRows = (a: Row, b: Row) =>
    Number(a.retired !== null) - Number(b.retired !== null) ||
    a.name.localeCompare(b.name, "en-GB");

  // ---------------------------------------------------------------- Due

  core.provideDue(() => {
    const on = today();
    const items: DueItem[] = [];
    for (const system of book.systems) {
      const row = rowOf(system, on);
      if (!row.due || !row.next_look) continue;
      items.push({
        key: `log:${system.log_id}`,
        kind: "log",
        title: `Look at the logs and clock of ${system.name}`,
        sub: row.last_look ? `Last looked at ${dayWords(row.last_look.on)}` : "Not looked at yet",
        due_on: row.next_look,
        href: row.href,
      });
    }
    return items;
  });

  // ---------------------------------------------------------------- what other modules get

  let usedIndex: { version: number; map: Map<string, { label: string; href: string }[]> } | null =
    null;
  const usedFor = (fileId: string) => {
    if (!usedIndex || usedIndex.version !== book.version) {
      const map = new Map<string, { label: string; href: string }[]>();
      for (const system of book.systems)
        for (const look of system.checks)
          if (look.file_id)
            map.set(look.file_id, [
              ...(map.get(look.file_id) ?? []),
              {
                label: `A look at the logs of ${system.name}, ${dayWords(look.on)}`,
                href: href(system),
              },
            ]);
      usedIndex = { version: book.version, map };
    }
    return (usedIndex.map.get(fileId) ?? []).map((line) => ({ ...line }));
  };

  const lookWords = () => {
    const months = lookMonthsOf(book.checkMonths);
    return months === 3 ? "looked at each quarter" : `looked at ${everyWords(months, "months")}`;
  };

  const verb = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

  const summary = (on: string): SummaryLine[] => {
    const rows = book.systems.map((system) => rowOf(system, on)).filter((row) => !row.retired);
    const counts = countsOf(rows);
    const line = (key: string, title: string, words: string, attention: boolean): SummaryLine => ({
      key,
      area: "systems",
      title,
      words,
      attention,
      href: PAGE,
    });
    if (rows.length === 0)
      return [
        line(
          "logs",
          "Logs",
          "No systems recorded. Add each system that keeps logs: the product's servers, the cloud account, the mail suite, the code host.",
          true,
        ),
      ];
    const long = rows.filter(keepsLongEnough).length;
    const known = rows.filter(timeKnown).length;
    return [
      line(
        "logs",
        "Logs",
        `${countWords(rows.length, "system")}: ${verb(long, "keeps", "keep")} logs 180 days or more${
          counts.outside > 0 ? `; ${verb(counts.outside, "keeps", "keep")} them outside India` : ""
        }.`,
        long < rows.length,
      ),
      line(
        "time",
        "Time",
        `${ofWords(known, rows.length, rows.length === 1 ? "system" : "systems")} ${rows.length === 1 ? "keeps" : "keep"} time from NIC, NPL or their cloud's own service.`,
        counts.time_unknown > 0,
      ),
    ];
  };

  const evidence = (on: string): EvidenceOption[] => {
    const rows = book.systems.map((system) => rowOf(system, on)).filter((row) => !row.retired);
    const late = rows.filter((row) => row.overdue).length;
    return [
      {
        ref: "logs:register",
        label: `Log and time register: ${countWords(rows.length, "system")}, ${lookWords()}`,
        href: PAGE,
        current: rows.length > 0 && late === 0,
        why:
          rows.length === 0
            ? "No systems recorded."
            : late === 0
              ? ""
              : `${countWords(late, "system")} not looked at in time.`,
      },
    ];
  };

  const service: LogsLookup = {
    usedFor,
    // Nothing here comes from the people ledger, so the Owner flag changes nothing.
    summary: (on) => summary(on),
    evidence: (on) => evidence(on),
  };
  core.provide(SECURITY_SERVICES.logs, service);

  core.provideOverview("logs", () => {
    const rows = book.systems.map((system) => rowOf(system, today()));
    const next = rows
      .filter((row) => row.next_look !== null)
      .map((row) => ({ title: `Look at the logs and clock of ${row.name}`, on: row.next_look! }))
      .sort((a, b) => a.on.localeCompare(b.on))[0];
    return { ...countsOf(rows), next: next ?? null };
  });

  // ---------------------------------------------------------------- the page's fixed parts

  const fixed = () => ({
    rules: { logs: lineOf("cert-in-logs"), time: lineOf("cert-in-time") },
    servers: { nic: [...NIC_TIME_SERVERS], npl: [...NPL_TIME_SERVERS] },
    readings: LOG_PLACE_READINGS,
    tools_loaded: toolsLookup() !== null,
    tools: tools() ?? [],
    setup: { check_months: book.checkMonths },
  });

  const csvOf = () => {
    const on = today();
    const rows = book.systems.map((system) => rowOf(system, on)).sort(sortRows);
    const words = (row: Row) =>
      row.lines
        .flatMap((line) =>
          line.key === "place_outside"
            ? [
                ...LOG_PLACE_READINGS.map((reading) => `${reading.label}: ${reading.words}`),
                line.words,
              ]
            : [line.words],
        )
        .join(" ");
    return {
      name: `Logs and time ${on}.csv`,
      csv:
        BOM +
        toCsv(
          [
            "system",
            "tool",
            "what_it_logs",
            "where",
            "kept_days",
            "in_india",
            "region",
            "time_source",
            "server_or_service",
            "time_zone_kept",
            "last_looked_at",
            "next_look",
            "retired_on",
            "checks",
          ],
          rows.map((row) => [
            row.name,
            row.tool?.name ?? "",
            row.kinds.map((kind) => LOG_KINDS[kind]).join(", "),
            row.where,
            row.retention_days ?? "",
            LOG_PLACES[row.place],
            row.region,
            TIME_SOURCES[row.time_source],
            row.time_detail,
            FLAG_WORDS[row.zone_recorded],
            row.last_look?.on ?? "",
            row.next_look ?? "",
            row.retired?.on ?? "",
            words(row),
          ]),
        ),
    };
  };

  // ---------------------------------------------------------------- routes (fixed paths first)

  core.route("GET", "/data/logs", () => {
    const on = today();
    const rows = book.systems.map((system) => rowOf(system, on));
    return {
      systems: [...rows].sort(sortRows),
      counts: countsOf(rows),
      ...fixed(),
      files_here: files() !== null,
      today: on,
    };
  });

  core.route("GET", "/data/logs/export", () => csvOf());

  core.route("POST", "/data/logs", (ctx) => {
    const by = ctx.staff();
    return { system: rowOf(book.add(ctx.body, tools(), by), today()) };
  });

  core.route("POST", "/data/logs/setup", (ctx) => {
    ctx.staff();
    return { setup: { check_months: book.saveMonths(ctx.body) } };
  });

  core.route("GET", "/data/logs/:id", (ctx) => {
    const on = today();
    const system = book.system(ctx.params[0]);
    const service = files();
    const answer: Answer = {
      system: {
        ...rowOf(system, on),
        checks: [...system.checks]
          .sort((a, b) => b.on.localeCompare(a.on) || b.at.localeCompare(a.at))
          .map((look) => {
            const row = look.file_id ? safely(() => service?.fileRow(look.file_id!) ?? null) : null;
            return {
              ...look,
              file: row && !row.trashed_at ? { file_id: row.file_id, title: row.title } : null,
            };
          }),
      },
      events: book.eventsOf(system.log_id),
      ...fixed(),
      files_here: service !== null,
      files: fileChoices(core),
      today: on,
    };
    return answer;
  });

  core.route("POST", "/data/logs/:id/update", (ctx) => {
    const by = ctx.staff();
    const system = book.update(book.system(ctx.params[0]), ctx.body, tools(), by);
    return { system: rowOf(system, today()) };
  });

  core.route("POST", "/data/logs/:id/checks", async (ctx) => {
    const by = ctx.staff();
    const system = book.system(ctx.params[0]);
    const fields = book.lookFields(system, ctx.body);
    if (copyGiven(ctx.body)) checkCopy(core, ctx.body);
    const file = copyGiven(ctx.body)
      ? await keepCopy(
          core,
          ctx.body,
          {
            folder: FILES_FOLDER,
            title: `A look at the logs of ${system.name}, ${dayWords(fields.on)}`,
            note: `What was looked at in ${system.name}'s logs and clock`,
          },
          by,
        )
      : null;
    book.addLook(system, fields, file?.file_id ?? null, by);
    return { system: rowOf(system, today()) };
  });

  core.route("POST", "/data/logs/:id/retire", (ctx) => {
    const by = ctx.staff();
    return { system: rowOf(book.retire(book.system(ctx.params[0]), ctx.body, by), today()) };
  });

  // ---------------------------------------------------------------- test routes

  if (core.testRoutes) {
    const toolsOf = (raw: unknown): ToolView[] =>
      (Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [])
        .filter((item) => item && typeof item.tool_id === "string")
        .map((item) => ({
          tool_id: clean(item.tool_id, 64),
          name: clean(item.name, 120) || "Walk tool",
          critical: item.critical === true,
          holds: [],
          subprocessor: item.subprocessor === true,
          retired: item.retired === true,
          href: `/data/systems/tools/${clean(item.tool_id, 64)}`,
        }));

    /** Only while no real Tools is loaded; `{ on: false }` removes only a stand-in. */
    const installTools = (body: Record<string, unknown>, list: ToolView[]) => {
      const current = core.need<object & Marked>(SECURITY_SERVICES.tools);
      const real = current !== null && current[STAND_IN] !== true;
      if (body.on === false) {
        if (current && !real) core.provide(SECURITY_SERVICES.tools, null);
        return { installed: false, real };
      }
      if (real) return { installed: false, real: true };
      core.provide(
        SECURITY_SERVICES.tools,
        Object.assign(standInTools(list), { [STAND_IN]: true as const }),
      );
      return { installed: true, real: false };
    };

    /** The service as another module sees it: the Summary's lines, the evidence, "Used for". */
    core.route("GET", "/data/_test/logs/service", (ctx) => ({
      summary: service.summary(today(), ctx.query.get("owner") === "1"),
      evidence: service.evidence(today()),
      used_for: service.usedFor(clean(ctx.query.get("file"), 64)),
    }));

    core.route("POST", "/data/_test/logs/tools", (ctx: Ctx) => {
      ctx.staff();
      return installTools(ctx.body, toolsOf(ctx.body.tools));
    });

    /** The walk's stand-in: "Walk Cloud" and "Walk Code" while Tools is absent. Safe to run twice. */
    core.route("POST", "/data/_test/logs/seed", (ctx) => {
      ctx.staff();
      if (!book.systems.some((item) => item.log_id === WALK_LOG_ID)) book.pinned = WALK_LOG_ID;
      // Another seed's stand-in (or the real Tools) is left as it is.
      const current = core.need<object & Marked>(SECURITY_SERVICES.tools);
      if (current) return { tools: { installed: false, real: current[STAND_IN] !== true } };
      return { tools: installTools({}, WALK_TOOLS) };
    });
  }
}
