/**
 * Backups (ws-notes/security/spec.md §7): the backup inventory (what each holds, how often,
 * where, whether a copy is kept away from the system and whether one cannot be changed), each
 * restore test with how long it took and what came back, and Data's own row, which reads when
 * Data's backup zip was last downloaded from `backup-last`. No target anywhere: a restore test
 * records what happened.
 *
 * Due rows of kind `backup`; the calendar's `agenda:recovery` (restore tests only); no search.
 * Provides `recovery` (`RecoveryLookup`). Nothing here restores, copies or reads a backup.
 */

import type { Answer, Ctx, DataCore, DueItem } from "../core";
import type { FilesService } from "../files/index";
import { clean } from "../guard";
import { checkCopy, copyGiven, fileChoices, keepCopy } from "../meetings/copy";
import { agendaService, type AgendaItem, type AgendaSource } from "../raise-contracts";
import {
  SECURITY_SERVICES,
  standInTools,
  type BackupLast,
  type EvidenceOption,
  type RecoveryLookup,
  type SummaryLine,
  type ToolView,
  type ToolsLookup,
} from "../security-contracts";
import { toCsv } from "../text";
import { dayWords } from "../../../src/lib/data/labels-company";
import { countWords } from "../../../src/lib/data/labels-controls";
import { BACKUP_KINDS, HOW_OFTEN, OUTCOMES } from "../../../src/lib/data/labels-devices";
import { RecoveryBook } from "./book";
import {
  backupLines,
  dataBackupWords,
  latestTest,
  minutesWords,
  nextTestOf,
  restoreWords,
  testInDue,
} from "./due";
import { FILES_FOLDER, TEST_REMIND_DAYS } from "./limits";
import type { Backup, RestoreTest } from "./types";
import { WALK_BACKUP_ID, WALK_TOOLS } from "./walk-seed";

const BOM = "﻿";
const PAGE = "/data/systems/backups";
const FLAG_WORDS = { yes: "Yes", no: "No", "": "Not known" } as const;

const STAND_IN = Symbol.for("hq.security.stand-in");
type Marked = { [STAND_IN]?: true };

export async function register(core: DataCore): Promise<void> {
  const book = new RecoveryBook(core);

  function safely<T>(ask: () => T): T | null {
    try {
      return ask();
    } catch (error) {
      core.log(`recovery: a lookup failed: ${error instanceof Error ? error.name : "error"}`);
      return null;
    }
  }

  const today = () => core.day();
  const files = () => core.need<FilesService>("files");
  const toolsLookup = () => core.need<ToolsLookup>(SECURITY_SERVICES.tools);
  const tools = (): ToolView[] | null => {
    const lookup = toolsLookup();
    if (!lookup) return null;
    return (safely(() => lookup.tools()) ?? []).filter((tool) => !tool.retired);
  };
  /** When Data's own zip was last downloaded; null when the backup module is absent. */
  const dataBackup = (): { last_at: string | null; words: string } | null => {
    const last = core.need<BackupLast>(SECURITY_SERVICES.backupLast);
    if (!last) return null;
    const at = safely(() => last.last())?.at ?? null;
    return { last_at: at, words: dataBackupWords(at) };
  };
  const addedOn = (backup: Backup) => core.day(backup.created_at);
  const href = (backup: Backup) => `${PAGE}/${backup.backup_id}`;

  // ---------------------------------------------------------------- rows

  const rowOf = (backup: Backup, on: string, data: { last_at: string | null } | null) => {
    const last = latestTest(backup.tests);
    const next = nextTestOf(last?.on ?? null, addedOn(backup), backup.every_months);
    const tool = backup.tool_id
      ? (tools()?.find((item) => item.tool_id === backup.tool_id) ?? null)
      : null;
    return {
      backup_id: backup.backup_id,
      kind: backup.kind,
      tool_id: backup.tool_id,
      name: backup.name,
      what: backup.what,
      how_often: backup.how_often,
      where: backup.where,
      off_system: backup.off_system,
      cannot_be_changed: backup.cannot_be_changed,
      owner: backup.owner,
      every_months: backup.every_months,
      retired: backup.retired,
      notes: backup.notes,
      created_at: backup.created_at,
      created_by: backup.created_by,
      updated_at: backup.updated_at,
      updated_by: backup.updated_by,
      tool: tool ? { tool_id: tool.tool_id, name: tool.name, href: tool.href } : null,
      added_on: addedOn(backup),
      last_test: last,
      last_minutes: minutesWords(last?.minutes ?? null),
      tests_count: backup.tests.length,
      next_test: backup.retired ? null : next,
      tested_in_time: !backup.retired && last !== null && next >= on,
      never_tested: !backup.retired && last === null,
      due: !backup.retired && testInDue(next, on),
      words: backup.retired
        ? `Retired ${dayWords(backup.retired.on)}`
        : restoreWords(last?.on ?? null, next, on),
      lines: backupLines(backup, last, next, on),
      /** Data's own row only: when the zip was last downloaded, in words. */
      downloaded: backup.kind === "hq_data" && data ? dataBackupWords(data.last_at) : null,
      href: href(backup),
    };
  };
  type Row = ReturnType<typeof rowOf>;

  const countsOf = (rows: readonly Row[]) => {
    const live = rows.filter((row) => !row.retired);
    return {
      backups: live.length,
      tested_in_time: live.filter((row) => row.tested_in_time).length,
      never_tested: live.filter((row) => row.never_tested).length,
    };
  };

  /** Data's own row first, then the rest by name; retired ones last. */
  const sortRows = (a: Row, b: Row) =>
    Number(a.retired !== null) - Number(b.retired !== null) ||
    Number(a.kind !== "hq_data") - Number(b.kind !== "hq_data") ||
    a.name.localeCompare(b.name, "en-GB");

  // ---------------------------------------------------------------- Due and the calendar

  const subOf = (backup: Backup, last: RestoreTest | null) =>
    last
      ? `${backup.every_months === 1 ? "Every month" : `Every ${backup.every_months} months`} · last ${dayWords(last.on)}`
      : "Never tested";

  core.provideDue(() => {
    const on = today();
    const items: DueItem[] = [];
    for (const backup of book.backups) {
      const row = rowOf(backup, on, null);
      if (!row.due || !row.next_test) continue;
      items.push({
        key: `backup:${backup.backup_id}`,
        kind: "backup",
        title: `Restore test: ${backup.name}`,
        sub: subOf(backup, row.last_test),
        due_on: row.next_test,
        href: row.href,
      });
    }
    return items;
  });

  const agenda: AgendaSource = {
    agenda: (on) =>
      book.backups
        .map((backup) => rowOf(backup, on, null))
        .filter((row): row is Row & { next_test: string } => row.next_test !== null)
        .map((row): AgendaItem => ({
          key: `backup:${row.backup_id}`,
          kind: "backup",
          title: `Restore test: ${row.name}`,
          plain: "Restore test",
          sub: row.last_test ? `Last restored ${dayWords(row.last_test.on)}` : "Never tested",
          on: row.next_test,
          remind_days: [...TEST_REMIND_DAYS],
          href: row.href,
        }))
        .sort((a, b) => a.on.localeCompare(b.on) || a.title.localeCompare(b.title)),
  };
  core.provide(agendaService("recovery"), agenda);

  // ---------------------------------------------------------------- what other modules get

  let usedIndex: { version: number; map: Map<string, { label: string; href: string }[]> } | null =
    null;
  const usedFor = (fileId: string) => {
    if (!usedIndex || usedIndex.version !== book.version) {
      const map = new Map<string, { label: string; href: string }[]>();
      for (const backup of book.backups)
        for (const test of backup.tests)
          if (test.file_id)
            map.set(test.file_id, [
              ...(map.get(test.file_id) ?? []),
              { label: `Restore test of ${backup.name}, ${dayWords(test.on)}`, href: href(backup) },
            ]);
      usedIndex = { version: book.version, map };
    }
    return (usedIndex.map.get(fileId) ?? []).map((line) => ({ ...line }));
  };

  const summary = (on: string): SummaryLine[] => {
    const data = dataBackup();
    const rows = book.backups
      .map((backup) => rowOf(backup, on, data))
      .filter((row) => !row.retired);
    const counts = countsOf(rows);
    const line = (
      key: string,
      title: string,
      words: string,
      attention: boolean,
      to = PAGE,
    ): SummaryLine => ({ key, area: "systems", title, words, attention, href: to });
    const lines: SummaryLine[] = [];
    if (rows.length === 0)
      lines.push(
        line(
          "backups",
          "Backups",
          "No backups recorded. Add each one, then record a restore: a backup is only proven by restoring it.",
          true,
        ),
      );
    else {
      const latest = latestTest(rows.flatMap((row) => (row.last_test ? [row.last_test] : [])));
      const tested = rows.some((row) => row.last_test);
      const took =
        latest?.minutes !== null && latest ? `; the last took ${minutesWords(latest.minutes)}` : "";
      lines.push(
        line(
          "backups",
          "Backups",
          tested
            ? `${countWords(rows.length, "backup")}; ${counts.tested_in_time} restore-tested on time${took}.`
            : `${countWords(rows.length, "backup")}; none restore-tested yet.`,
          counts.tested_in_time < rows.length,
        ),
      );
    }
    if (data)
      lines.push(
        line(
          "data-backup",
          "Data's own backup",
          data.last_at
            ? `Data's own backup was last downloaded ${dayWords(core.day(data.last_at))}.`
            : "No backup of Data has been downloaded yet.",
          data.last_at === null,
          "/data#data-backup",
        ),
      );
    return lines;
  };

  const evidence = (on: string): EvidenceOption[] => {
    const rows = book.backups
      .map((backup) => rowOf(backup, on, null))
      .filter((row) => !row.retired);
    const counts = countsOf(rows);
    const options: EvidenceOption[] = [
      {
        ref: "recovery:register",
        label: `Backup inventory: ${countWords(rows.length, "backup")}, restore-tested`,
        href: PAGE,
        current: rows.length > 0 && counts.tested_in_time === rows.length,
        why:
          rows.length === 0
            ? "No backups recorded."
            : counts.tested_in_time === rows.length
              ? ""
              : `${countWords(rows.length - counts.tested_in_time, "backup")} not restore-tested on time.`,
      },
    ];
    for (const row of rows) {
      const test = row.last_test;
      if (!test) {
        options.push({
          ref: `recovery:backup:${row.backup_id}`,
          label: `${row.name}: not restore-tested yet`,
          href: row.href,
          current: false,
          why: "Never restore-tested.",
        });
        continue;
      }
      const how = minutesWords(test.minutes);
      const label =
        test.outcome === "complete"
          ? `${row.name}: restored${how ? ` in ${how}` : ""} on ${dayWords(test.on)}`
          : test.outcome === "partial"
            ? `${row.name}: partly restored on ${dayWords(test.on)}`
            : `${row.name}: the restore failed on ${dayWords(test.on)}`;
      const why =
        test.outcome === "failed"
          ? "The last restore failed."
          : test.outcome === "partial"
            ? "The last restore was partial."
            : row.tested_in_time
              ? ""
              : `No restore test since ${dayWords(test.on)}.`;
      options.push({
        ref: `recovery:backup:${row.backup_id}`,
        label,
        href: row.href,
        current: why === "",
        why,
      });
    }
    return options;
  };

  const service: RecoveryLookup = {
    usedFor,
    // Nothing here comes from the people ledger, so the Owner flag changes nothing.
    summary: (on) => summary(on),
    evidence: (on) => evidence(on),
  };
  core.provide(SECURITY_SERVICES.recovery, service);

  core.provideOverview("recovery", () => {
    const rows = book.backups.map((backup) => rowOf(backup, today(), null));
    const next = rows
      .filter((row) => row.next_test !== null)
      .map((row) => ({ title: `Restore test: ${row.name}`, on: row.next_test! }))
      .sort((a, b) => a.on.localeCompare(b.on))[0];
    return { ...countsOf(rows), next: next ?? null };
  });

  // ---------------------------------------------------------------- the inventory as a CSV

  const csvOf = () => {
    const on = today();
    const data = dataBackup();
    const rows = book.backups.map((backup) => rowOf(backup, on, data)).sort(sortRows);
    return {
      name: `Backups ${on}.csv`,
      csv:
        BOM +
        toCsv(
          [
            "backup",
            "kind",
            "tool",
            "what",
            "how_often",
            "where",
            "away_from_the_system",
            "cannot_be_changed",
            "looked_after_by",
            "restore_tests_every_months",
            "last_restore_test",
            "how_long_minutes",
            "outcome",
            "next_test",
            "last_downloaded",
            "retired_on",
            "checks",
          ],
          rows.map((row) => [
            row.name,
            BACKUP_KINDS[row.kind],
            row.tool?.name ?? "",
            row.what,
            HOW_OFTEN[row.how_often],
            row.where,
            FLAG_WORDS[row.off_system],
            FLAG_WORDS[row.cannot_be_changed],
            row.owner,
            row.every_months,
            row.last_test?.on ?? "",
            row.last_test?.minutes ?? "",
            row.last_test ? OUTCOMES[row.last_test.outcome] : "",
            row.next_test ?? "",
            row.kind === "hq_data" && data?.last_at ? core.day(data.last_at) : "",
            row.retired?.on ?? "",
            row.lines.join(" "),
          ]),
        ),
    };
  };

  // ---------------------------------------------------------------- routes (fixed paths first)

  core.route("GET", "/data/recovery", () => {
    const on = today();
    const data = dataBackup();
    const rows = book.backups.map((backup) => rowOf(backup, on, data));
    return {
      backups: [...rows].sort(sortRows),
      counts: countsOf(rows),
      data_backup: data,
      data_listed: book.dataRow() !== null,
      tools_loaded: toolsLookup() !== null,
      tools: tools() ?? [],
      files_here: files() !== null,
      today: on,
    };
  });

  core.route("GET", "/data/recovery/export", () => csvOf());

  core.route("POST", "/data/recovery", (ctx) => {
    const by = ctx.staff();
    return { backup: rowOf(book.add(ctx.body, tools(), by), today(), dataBackup()) };
  });

  core.route("GET", "/data/recovery/:id", (ctx) => {
    const on = today();
    const backup = book.backup(ctx.params[0]);
    const service = files();
    const answer: Answer = {
      backup: {
        ...rowOf(backup, on, dataBackup()),
        tests: [...backup.tests]
          .sort((a, b) => b.on.localeCompare(a.on) || b.at.localeCompare(a.at))
          .map((test) => {
            const row = test.file_id ? safely(() => service?.fileRow(test.file_id!) ?? null) : null;
            return {
              ...test,
              how_long: minutesWords(test.minutes),
              file: row && !row.trashed_at ? { file_id: row.file_id, title: row.title } : null,
            };
          }),
      },
      events: book.eventsOf(backup.backup_id),
      data_backup: dataBackup(),
      tools_loaded: toolsLookup() !== null,
      tools: tools() ?? [],
      files_here: service !== null,
      files: fileChoices(core),
      today: on,
    };
    return answer;
  });

  core.route("POST", "/data/recovery/:id/update", (ctx) => {
    const by = ctx.staff();
    const backup = book.update(book.backup(ctx.params[0]), ctx.body, tools(), by);
    return { backup: rowOf(backup, today(), dataBackup()) };
  });

  core.route("POST", "/data/recovery/:id/tests", async (ctx) => {
    const by = ctx.staff();
    const backup = book.backup(ctx.params[0]);
    const fields = book.testFields(backup, ctx.body);
    if (copyGiven(ctx.body)) checkCopy(core, ctx.body);
    const file = copyGiven(ctx.body)
      ? await keepCopy(
          core,
          ctx.body,
          {
            folder: FILES_FOLDER,
            title: `Restore test of ${backup.name}, ${dayWords(fields.on)}`,
            note: `What came back when ${backup.name} was restored`,
          },
          by,
        )
      : null;
    book.addTest(backup, fields, file?.file_id ?? null, by);
    return { backup: rowOf(backup, today(), dataBackup()) };
  });

  core.route("POST", "/data/recovery/:id/retire", (ctx) => {
    const by = ctx.staff();
    return {
      backup: rowOf(book.retire(book.backup(ctx.params[0]), ctx.body, by), today(), dataBackup()),
    };
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
    core.route("GET", "/data/_test/recovery/service", (ctx) => ({
      summary: service.summary(today(), ctx.query.get("owner") === "1"),
      evidence: service.evidence(today()),
      used_for: service.usedFor(clean(ctx.query.get("file"), 64)),
    }));

    core.route("POST", "/data/_test/recovery/tools", (ctx: Ctx) => {
      ctx.staff();
      return installTools(ctx.body, toolsOf(ctx.body.tools));
    });

    /** The walk's stand-in: "Walk Cloud" while Tools is absent. Safe to run twice. */
    core.route("POST", "/data/_test/recovery/seed", (ctx) => {
      ctx.staff();
      if (!book.backups.some((item) => item.backup_id === WALK_BACKUP_ID))
        book.pinned = WALK_BACKUP_ID;
      // Another seed's stand-in (or the real Tools) is left as it is.
      const current = core.need<object & Marked>(SECURITY_SERVICES.tools);
      if (current) return { tools: { installed: false, real: current[STAND_IN] !== true } };
      return { tools: installTools({}, WALK_TOOLS) };
    });

    core.route("GET", "/data/_test/recovery/agenda", () => ({
      items: agenda.agenda(today()),
      today: today(),
    }));
  }
}
