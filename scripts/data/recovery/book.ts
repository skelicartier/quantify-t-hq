/**
 * The backups book (ws-notes/security/spec.md §7.2, §7.3): `recovery/backups.json` (every
 * backup with its restore tests) and `recovery/events.jsonl` (one line per change: field names,
 * never their values). Nothing is deleted: a backup is retired and stays listed.
 */

import { randomUUID } from "node:crypto";

import { Refused } from "../../mail-merge/engine";
import type { Flag } from "../company-contracts";
import type { DataCore } from "../core";
import { clean, cleanText, isDay } from "../guard";
import type { Staff } from "../protocol";
import type { ToolView } from "../security-contracts";
import { PRACTICES } from "../../../src/lib/data/labels-controls";
import {
  BACKUP_KINDS,
  DATA_BACKUP,
  HOW_OFTEN,
  OUTCOMES,
  type BackupKind,
  type HowOften,
  type Outcome,
} from "../../../src/lib/data/labels-devices";
import { LIMIT, SAY, tooMany } from "./limits";
import type { Backup, RecoveryEvent, RestoreTest } from "./types";

const BACKUPS = "recovery/backups.json";
const EVENTS = "recovery/events.jsonl";

type Input = Record<string, unknown>;
const has = (input: Input, name: string) => Object.prototype.hasOwnProperty.call(input, name);
const FLAGS = new Set<string>(["yes", "no", ""]);

const WORDS: Record<string, string> = {
  tool_id: "Tool",
  name: "Name",
  what: "What",
  how_often: "How often",
  where: "Where",
  off_system: "Away from the system",
  cannot_be_changed: "Cannot be changed",
  owner: "Who looks after it",
  every_months: "Restore tests every",
  notes: "Notes",
};

function changed(before: object, after: object): string {
  const a = before as Record<string, unknown>;
  const b = after as Record<string, unknown>;
  const keys = Object.keys(WORDS).filter(
    (key) => key in b && JSON.stringify(a[key]) !== JSON.stringify(b[key]),
  );
  return keys.length ? keys.map((key) => WORDS[key] ?? key).join(", ") : "Nothing";
}

export type TestFields = Omit<RestoreTest, "test_id" | "file_id" | "at" | "by">;

export class RecoveryBook {
  readonly #core: DataCore;
  backups: Backup[];
  version = 0;
  /** Test routes only: the id the next system backup added takes (`walk-backup`), for the harness. */
  pinned: string | null = null;

  constructor(core: DataCore) {
    this.#core = core;
    core.store.ensureDir("recovery");
    const stored = core.store.readJson<Record<string, unknown>>(BACKUPS, {});
    this.backups = Array.isArray(stored.backups)
      ? (stored.backups as Backup[]).filter(
          (item) => item && typeof item.backup_id === "string" && Array.isArray(item.tests),
        )
      : [];
  }

  #save(): void {
    this.version += 1;
    this.#core.store.writeJson(BACKUPS, { format: 1, backups: this.backups });
  }

  log(backupId: string, verb: string, detail: string, by: Staff): void {
    const line: RecoveryEvent = {
      event_id: randomUUID(),
      backup_id: backupId,
      verb,
      detail,
      by,
      at: this.#core.now(),
    };
    this.#core.store.appendLine(EVENTS, line);
  }

  eventsOf(backupId: string, limit = 100): RecoveryEvent[] {
    return this.#core.store
      .readLines<RecoveryEvent>(EVENTS)
      .filter((event) => event?.backup_id === backupId)
      .reverse()
      .slice(0, limit);
  }

  #touch(backup: Backup, by: Staff): void {
    backup.updated_at = this.#core.now();
    backup.updated_by = by;
    this.#save();
  }

  day(value: unknown): string {
    const day = clean(value, 10);
    if (!day) return this.#core.day();
    if (!isDay(day)) throw new Refused(400, "invalid", SAY.notADay);
    if (day > this.#core.day()) throw new Refused(400, "invalid", SAY.future);
    return day;
  }

  backup(id: string | undefined): Backup {
    const found = id ? this.backups.find((item) => item.backup_id === id) : undefined;
    if (!found) throw new Refused(404, "not_found", SAY.backup);
    return found;
  }

  /** Data's own row in use, when there is one. */
  dataRow(): Backup | null {
    return this.backups.find((item) => item.kind === "hq_data" && !item.retired) ?? null;
  }

  #flag(value: unknown): Flag {
    const text = clean(value, 4);
    if (!FLAGS.has(text)) throw new Refused(400, "invalid", SAY.flag);
    return text as Flag;
  }

  #fields(input: Input, base: Backup | null, tools: readonly ToolView[] | null) {
    const kind = base
      ? base.kind
      : ((): BackupKind => {
          const text = clean(input.kind, 12) || "system";
          if (!(text in BACKUP_KINDS)) throw new Refused(400, "invalid", SAY.kind);
          return text as BackupKind;
        })();
    if (kind === "hq_data" && !base && this.dataRow())
      throw new Refused(409, "hq_data_taken", SAY.hqData);
    let toolId = base?.tool_id ?? null;
    let name = base?.name ?? "";
    if (kind === "system" && has(input, "tool_id")) {
      const chosen = clean(input.tool_id, 64);
      if (chosen) {
        if (!tools) throw new Refused(409, "tools_missing", SAY.toolsMissing);
        const tool = tools.find((item) => item.tool_id === chosen);
        if (!tool) throw new Refused(404, "not_found", SAY.tool);
        toolId = tool.tool_id;
        if (!clean(input.name, LIMIT.name)) name = tool.name;
      } else toolId = null;
    }
    if (has(input, "name") && clean(input.name, LIMIT.name))
      name = cleanText(input.name, LIMIT.name);
    if (!name && kind === "hq_data") name = DATA_BACKUP.name;
    if (!name) throw new Refused(400, "invalid", SAY.name);
    const pick = <K extends keyof Backup>(key: K, read: (value: unknown) => Backup[K]) =>
      has(input, key) ? read(input[key]) : base ? base[key] : read(undefined);
    // Data's own zip reads "the backup zip, by hand" until he says otherwise.
    const own = kind === "hq_data" && !base;
    return {
      kind,
      tool_id: toolId,
      name,
      what: pick("what", (value) => cleanText(value, LIMIT.text)) || (own ? DATA_BACKUP.what : ""),
      how_often:
        pick("how_often", (value) => {
          const text = clean(value, 12);
          if (!(text in HOW_OFTEN)) throw new Refused(400, "invalid", SAY.howOften);
          return text as HowOften;
        }) || (own ? ("by_hand" as const) : ("" as const)),
      where: pick("where", (value) => cleanText(value, LIMIT.text)),
      off_system: pick("off_system", (value) => this.#flag(value)),
      cannot_be_changed: pick("cannot_be_changed", (value) => this.#flag(value)),
      owner: pick("owner", (value) => cleanText(value, LIMIT.text)),
      every_months: pick("every_months", (value) => {
        const text = clean(value, 4);
        if (!text) return PRACTICES.restore_test.amount;
        const months = /^\d+$/.test(text) ? Number(text) : NaN;
        if (!Number.isInteger(months) || months < LIMIT.months_min || months > LIMIT.months_max)
          throw new Refused(400, "invalid", SAY.months);
        return months;
      }),
      notes: pick("notes", (value) => cleanText(value, LIMIT.notes)),
    };
  }

  add(input: Input, tools: readonly ToolView[] | null, by: Staff): Backup {
    if (this.backups.length >= LIMIT.backups)
      throw new Refused(409, "too_many", tooMany(LIMIT.backups));
    const now = this.#core.now();
    const fields = this.#fields(input, null, tools);
    const pinned = fields.kind === "system" ? this.pinned : null;
    const backup: Backup = {
      backup_id: pinned ?? randomUUID(),
      ...fields,
      tests: [],
      retired: null,
      created_at: now,
      created_by: by,
      updated_at: now,
      updated_by: by,
    };
    if (pinned) this.pinned = null;
    this.backups.push(backup);
    this.#save();
    this.log(backup.backup_id, "added", "", by);
    return backup;
  }

  update(backup: Backup, input: Input, tools: readonly ToolView[] | null, by: Staff): Backup {
    const fields = this.#fields(input, backup, tools);
    const detail = changed(backup, fields);
    Object.assign(backup, fields);
    this.#touch(backup, by);
    this.log(backup.backup_id, "changed", detail, by);
    return backup;
  }

  testFields(backup: Backup, input: Input): TestFields {
    if (backup.retired) throw new Refused(409, "invalid", SAY.retired);
    if (backup.tests.length >= LIMIT.tests)
      throw new Refused(409, "too_many", tooMany(LIMIT.tests));
    const byName = cleanText(input.by_name, LIMIT.by_name);
    if (!byName) throw new Refused(400, "invalid", SAY.byName);
    const outcome = clean(input.outcome, 12);
    if (!(outcome in OUTCOMES)) throw new Refused(400, "invalid", SAY.outcome);
    let minutes: number | null = null;
    const typed = clean(input.minutes, 8);
    if (typed) {
      minutes = /^\d+$/.test(typed) ? Number(typed) : NaN;
      if (!Number.isInteger(minutes) || minutes > LIMIT.minutes_max)
        throw new Refused(400, "invalid", SAY.minutes);
    }
    return {
      on: this.day(input.on),
      by_name: byName,
      minutes,
      outcome: outcome as Outcome,
      what_restored: cleanText(input.what_restored, LIMIT.what_restored),
      note: cleanText(input.note, LIMIT.note),
    };
  }

  addTest(backup: Backup, fields: TestFields, fileId: string | null, by: Staff): RestoreTest {
    const test: RestoreTest = {
      test_id: randomUUID(),
      ...fields,
      file_id: fileId,
      at: this.#core.now(),
      by,
    };
    backup.tests.push(test);
    this.#touch(backup, by);
    this.log(backup.backup_id, "restore test recorded", OUTCOMES[fields.outcome], by);
    return test;
  }

  retire(backup: Backup, input: Input, by: Staff): Backup {
    if (backup.retired) throw new Refused(409, "invalid", SAY.retired);
    const why = cleanText(input.why, LIMIT.why);
    if (why.length < 2) throw new Refused(400, "invalid", SAY.why);
    backup.retired = { on: this.day(input.on), why };
    this.#touch(backup, by);
    this.log(backup.backup_id, "retired", "", by);
    return backup;
  }
}
