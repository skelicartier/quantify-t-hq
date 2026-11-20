/**
 * The logs book (ws-notes/security/spec.md §7.2, §7.3): `logs/logs.json` (every system with
 * its looks, and his months between looks) and `logs/events.jsonl` (one line per change: field
 * names, never their values). Nothing is deleted: a system is retired and stays listed.
 */

import { randomUUID } from "node:crypto";

import { Refused } from "../../mail-merge/engine";
import type { Flag } from "../company-contracts";
import type { DataCore } from "../core";
import { clean, cleanText, isDay } from "../guard";
import type { Staff } from "../protocol";
import type { ToolView } from "../security-contracts";
import { LOG_KINDS, type LogKind } from "../../../src/lib/data/labels-controls";
import {
  LOG_PLACES,
  TIME_SOURCES,
  type LogPlace,
  type TimeSource,
} from "../../../src/lib/data/labels-devices";
import { LIMIT, SAY, tooMany } from "./limits";
import type { LogLook, LogSystem, LogsEvent } from "./types";

const LOGS = "logs/logs.json";
const EVENTS = "logs/events.jsonl";

type Input = Record<string, unknown>;
const has = (input: Input, name: string) => Object.prototype.hasOwnProperty.call(input, name);
const FLAGS = new Set<string>(["yes", "no", ""]);

const WORDS: Record<string, string> = {
  tool_id: "Tool",
  name: "Name",
  kinds: "What it logs",
  where: "Where they go",
  retention_days: "Kept for",
  place: "Kept in India",
  region: "Region",
  time_source: "Time source",
  time_detail: "Server or service",
  zone_recorded: "Time zone kept",
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

export type LookFields = { on: string; by_name: string; note: string };

export class LogsBook {
  readonly #core: DataCore;
  systems: LogSystem[];
  /** His months between looks; null for HQ's default. */
  checkMonths: number | null;
  version = 0;
  /** Test routes only: the id the next system added takes (`walk-log`), so the harness can open it. */
  pinned: string | null = null;

  constructor(core: DataCore) {
    this.#core = core;
    core.store.ensureDir("logs");
    const stored = core.store.readJson<Record<string, unknown>>(LOGS, {});
    this.systems = Array.isArray(stored.systems)
      ? (stored.systems as LogSystem[]).filter(
          (item) => item && typeof item.log_id === "string" && Array.isArray(item.checks),
        )
      : [];
    const months = stored.check_months;
    this.checkMonths =
      typeof months === "number" &&
      Number.isInteger(months) &&
      months >= LIMIT.months_min &&
      months <= LIMIT.months_max
        ? months
        : null;
  }

  #save(): void {
    this.version += 1;
    this.#core.store.writeJson(LOGS, {
      format: 1,
      systems: this.systems,
      check_months: this.checkMonths,
    });
  }

  log(logId: string, verb: string, detail: string, by: Staff): void {
    const line: LogsEvent = {
      event_id: randomUUID(),
      log_id: logId,
      verb,
      detail,
      by,
      at: this.#core.now(),
    };
    this.#core.store.appendLine(EVENTS, line);
  }

  eventsOf(logId: string, limit = 100): LogsEvent[] {
    return this.#core.store
      .readLines<LogsEvent>(EVENTS)
      .filter((event) => event?.log_id === logId)
      .reverse()
      .slice(0, limit);
  }

  #touch(system: LogSystem, by: Staff): void {
    system.updated_at = this.#core.now();
    system.updated_by = by;
    this.#save();
  }

  day(value: unknown): string {
    const day = clean(value, 10);
    if (!day) return this.#core.day();
    if (!isDay(day)) throw new Refused(400, "invalid", SAY.notADay);
    if (day > this.#core.day()) throw new Refused(400, "invalid", SAY.future);
    return day;
  }

  system(id: string | undefined): LogSystem {
    const found = id ? this.systems.find((item) => item.log_id === id) : undefined;
    if (!found) throw new Refused(404, "not_found", SAY.system);
    return found;
  }

  /** Every field read and checked; a tool chosen gives the system its name. */
  #fields(input: Input, base: LogSystem | null, tools: readonly ToolView[] | null) {
    let toolId = base?.tool_id ?? null;
    let name = base?.name ?? "";
    if (has(input, "tool_id")) {
      const chosen = clean(input.tool_id, 64);
      if (chosen) {
        if (!tools) throw new Refused(409, "tools_missing", SAY.toolsMissing);
        const tool = tools.find((item) => item.tool_id === chosen);
        if (!tool) throw new Refused(404, "not_found", SAY.tool);
        toolId = tool.tool_id;
        name = tool.name;
      } else toolId = null;
    }
    if (toolId === null && (has(input, "name") || !base)) name = cleanText(input.name, LIMIT.name);
    if (!name) throw new Refused(400, "invalid", SAY.name);
    const key = name.toLocaleLowerCase("en-GB");
    if (
      this.systems.some(
        (item) =>
          !item.retired &&
          item.log_id !== base?.log_id &&
          item.name.toLocaleLowerCase("en-GB") === key,
      )
    )
      throw new Refused(409, "name_taken", SAY.nameTaken);
    const pick = <K extends keyof LogSystem>(key: K, read: (value: unknown) => LogSystem[K]) =>
      has(input, key) ? read(input[key]) : base ? base[key] : read(undefined);
    return {
      tool_id: toolId,
      name,
      kinds: pick("kinds", (value) => {
        const given = (Array.isArray(value) ? value : String(value ?? "").split(","))
          .map((item) => clean(item, 20))
          .filter(Boolean);
        if (given.some((item) => !(item in LOG_KINDS)))
          throw new Refused(400, "invalid", SAY.kinds);
        return [...new Set(given)] as LogKind[];
      }),
      where: pick("where", (value) => cleanText(value, LIMIT.where)),
      retention_days: pick("retention_days", (value) => {
        const text = clean(value, 8);
        if (!text) return null;
        const days = /^\d+$/.test(text) ? Number(text) : NaN;
        if (!Number.isInteger(days) || days > LIMIT.retention_max)
          throw new Refused(400, "invalid", SAY.retention);
        return days;
      }),
      place: pick("place", (value) => {
        const text = clean(value, 12);
        if (!(text in LOG_PLACES)) throw new Refused(400, "invalid", SAY.place);
        return text as LogPlace;
      }),
      region: pick("region", (value) => cleanText(value, LIMIT.region)),
      time_source: pick("time_source", (value) => {
        const text = clean(value, 12);
        if (!(text in TIME_SOURCES)) throw new Refused(400, "invalid", SAY.timeSource);
        return text as TimeSource;
      }),
      // Stored with `clean`: a server's name is not a secret, and the guard could refuse one.
      time_detail: pick("time_detail", (value) => clean(value, LIMIT.time_detail)),
      zone_recorded: pick("zone_recorded", (value) => {
        const text = clean(value, 4);
        if (!FLAGS.has(text)) throw new Refused(400, "invalid", SAY.flag);
        return text as Flag;
      }),
      notes: pick("notes", (value) => cleanText(value, LIMIT.notes)),
    };
  }

  add(input: Input, tools: readonly ToolView[] | null, by: Staff): LogSystem {
    if (this.systems.length >= LIMIT.systems)
      throw new Refused(409, "too_many", tooMany(LIMIT.systems));
    const now = this.#core.now();
    const fields = this.#fields(input, null, tools);
    const system: LogSystem = {
      log_id: this.pinned ?? randomUUID(),
      ...fields,
      checks: [],
      retired: null,
      created_at: now,
      created_by: by,
      updated_at: now,
      updated_by: by,
    };
    this.pinned = null;
    this.systems.push(system);
    this.#save();
    this.log(system.log_id, "added", "", by);
    return system;
  }

  update(system: LogSystem, input: Input, tools: readonly ToolView[] | null, by: Staff) {
    const fields = this.#fields(input, system, tools);
    const detail = changed(system, fields);
    Object.assign(system, fields);
    this.#touch(system, by);
    this.log(system.log_id, "changed", detail, by);
    return system;
  }

  lookFields(system: LogSystem, input: Input): LookFields {
    if (system.retired) throw new Refused(409, "invalid", SAY.retired);
    if (system.checks.length >= LIMIT.looks)
      throw new Refused(409, "too_many", tooMany(LIMIT.looks));
    const byName = cleanText(input.by_name, LIMIT.by_name);
    if (!byName) throw new Refused(400, "invalid", SAY.byName);
    return { on: this.day(input.on), by_name: byName, note: cleanText(input.note, LIMIT.note) };
  }

  addLook(system: LogSystem, fields: LookFields, fileId: string | null, by: Staff): LogLook {
    const look: LogLook = {
      check_id: randomUUID(),
      ...fields,
      file_id: fileId,
      at: this.#core.now(),
      by,
    };
    system.checks.push(look);
    this.#touch(system, by);
    this.log(system.log_id, "looked at", fileId ? "A file kept" : "", by);
    return look;
  }

  retire(system: LogSystem, input: Input, by: Staff): LogSystem {
    if (system.retired) throw new Refused(409, "invalid", SAY.retired);
    const why = cleanText(input.why, LIMIT.why);
    if (why.length < 2) throw new Refused(400, "invalid", SAY.why);
    system.retired = { on: this.day(input.on), why };
    this.#touch(system, by);
    this.log(system.log_id, "retired", "", by);
    return system;
  }

  saveMonths(input: Input): number | null {
    const text = clean(input.check_months, 4);
    let months: number | null = null;
    if (text) {
      months = /^\d+$/.test(text) ? Number(text) : NaN;
      if (!Number.isInteger(months) || months < LIMIT.months_min || months > LIMIT.months_max)
        throw new Refused(400, "invalid", SAY.months);
    }
    this.checkMonths = months;
    this.#save();
    return months;
  }
}
