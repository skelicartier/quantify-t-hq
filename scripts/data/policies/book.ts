/**
 * The policies book (ws-notes/security/spec.md §8.2): `policies/policies.json` (one entry per
 * policy he has acted on: the expected eleven by key, his own as "own-<uuid>") and
 * `policies/events.jsonl` (one line per change: verb and field names, never values). An
 * expected policy with no entry reads "No document linked."; an entry is written on his first
 * act. Nothing is deleted: a policy is marked not needed, and that can be taken back.
 */

import { randomUUID } from "node:crypto";

import { Refused } from "../../mail-merge/engine";
import type { DataCore } from "../core";
import { clean, cleanText, isDay } from "../guard";
import type { Staff } from "../protocol";
import { isPolicyKey } from "../../../src/lib/data/labels-controls";
import { LIMIT, SAY } from "./limits";
import type { PoliciesEvent, PolicyEntry } from "./types";

const POLICIES = "policies/policies.json";
const EVENTS = "policies/events.jsonl";

type Input = Record<string, unknown>;

const has = (input: Input, name: string) => Object.prototype.hasOwnProperty.call(input, name);
export const isOwnKey = (key: string): boolean =>
  /^own-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(key);

export class PoliciesBook {
  readonly #core: DataCore;
  readonly #today: () => string;
  entries: PolicyEntry[];

  constructor(core: DataCore, today: () => string) {
    this.#core = core;
    this.#today = today;
    core.store.ensureDir("policies");
    const stored = core.store.readJson<Record<string, unknown>>(POLICIES, {});
    this.entries = Array.isArray(stored.entries)
      ? (stored.entries as PolicyEntry[]).filter(
          (item) =>
            item && typeof item.key === "string" && (isPolicyKey(item.key) || isOwnKey(item.key)),
        )
      : [];
  }

  #save(): void {
    this.#core.store.writeJson(POLICIES, { format: 1, entries: this.entries });
  }

  log(key: string, verb: string, detail: string, by: Staff): void {
    const line: PoliciesEvent = {
      event_id: randomUUID(),
      key,
      verb,
      detail,
      by,
      at: this.#core.now(),
    };
    this.#core.store.appendLine(EVENTS, line);
  }

  events(key: string, limit = 50): PoliciesEvent[] {
    return this.#core.store
      .readLines<PoliciesEvent>(EVENTS)
      .filter((event) => typeof event?.event_id === "string" && event.key === key)
      .reverse()
      .slice(0, limit);
  }

  entry(key: string): PolicyEntry | null {
    return this.entries.find((item) => item.key === key) ?? null;
  }

  own(): PolicyEntry[] {
    return this.entries.filter((item) => isOwnKey(item.key));
  }

  /** The entry for a key, written on his first act; refused for a key that is neither expected nor his. */
  #ensure(key: string, by: Staff): PolicyEntry {
    const found = this.entry(key);
    if (found) return found;
    if (!isPolicyKey(key)) throw new Refused(404, "not_found", SAY.policy);
    const now = this.#core.now();
    const entry: PolicyEntry = {
      key,
      title: "",
      file_id: null,
      owner: "",
      approved_by: "",
      approved_on: null,
      not_needed: null,
      note: "",
      created_at: now,
      created_by: by,
      updated_at: now,
      updated_by: by,
    };
    this.entries.push(entry);
    return entry;
  }

  /** Whether a key names a policy here (an expected one, or one of his own). */
  known(key: string): boolean {
    return isPolicyKey(key) || this.entry(key) !== null;
  }

  #touch(entry: PolicyEntry, by: Staff): void {
    entry.updated_at = this.#core.now();
    entry.updated_by = by;
    this.#save();
  }

  link(key: string, fileId: string | null, by: Staff): PolicyEntry {
    if (!this.known(key)) throw new Refused(404, "not_found", SAY.policy);
    const entry = this.#ensure(key, by);
    const before = entry.file_id;
    entry.file_id = fileId;
    this.#touch(entry, by);
    this.log(
      key,
      fileId ? (before ? "document changed" : "document linked") : "document unlinked",
      "",
      by,
    );
    return entry;
  }

  update(key: string, input: Input, by: Staff): PolicyEntry {
    if (!this.known(key)) throw new Refused(404, "not_found", SAY.policy);
    const read = (name: string, limit: number, say: string): string | undefined => {
      if (!has(input, name)) return undefined;
      const text = cleanText(input[name], limit + 1);
      if (text.length > limit) throw new Refused(400, "invalid", say);
      return text;
    };
    const owner = read("owner", LIMIT.name, SAY.owner);
    const approvedBy = read("approved_by", LIMIT.name, SAY.approvedBy);
    const note = has(input, "note") ? cleanText(input.note, LIMIT.note) : undefined;
    let approvedOn: string | null | undefined;
    if (has(input, "approved_on")) {
      const day = clean(input.approved_on, 10);
      if (!day) approvedOn = null;
      else if (!isDay(day)) throw new Refused(400, "invalid", SAY.notADay);
      else if (day > this.#today()) throw new Refused(400, "invalid", SAY.future);
      else approvedOn = day;
    }
    let title: string | undefined;
    if (has(input, "title") && isOwnKey(key)) title = this.#ownTitle(input.title, key);
    const entry = this.#ensure(key, by);
    const fields: string[] = [];
    if (owner !== undefined && owner !== entry.owner) fields.push("Owner");
    if (approvedBy !== undefined && approvedBy !== entry.approved_by) fields.push("Approved by");
    if (approvedOn !== undefined && approvedOn !== entry.approved_on) fields.push("Approved on");
    if (note !== undefined && note !== entry.note) fields.push("Note");
    if (title !== undefined && title !== entry.title) fields.push("Title");
    if (owner !== undefined) entry.owner = owner;
    if (approvedBy !== undefined) entry.approved_by = approvedBy;
    if (approvedOn !== undefined) entry.approved_on = approvedOn;
    if (note !== undefined) entry.note = note;
    if (title !== undefined) entry.title = title;
    this.#touch(entry, by);
    this.log(key, "changed", fields.join(", ") || "Nothing", by);
    return entry;
  }

  notNeeded(key: string, input: Input, by: Staff): PolicyEntry {
    if (!this.known(key)) throw new Refused(404, "not_found", SAY.policy);
    const entry = this.#ensure(key, by);
    if (input.undo === true) {
      entry.not_needed = null;
      this.#touch(entry, by);
      this.log(key, "needed again", "", by);
      return entry;
    }
    if (entry.not_needed) throw new Refused(409, "invalid", SAY.notNeeded);
    const why = cleanText(input.why, LIMIT.why + 1);
    if (why.length < LIMIT.why_min || why.length > LIMIT.why)
      throw new Refused(400, "invalid", SAY.why);
    entry.not_needed = { why, on: this.#today() };
    this.#touch(entry, by);
    this.log(key, "not needed", "", by);
    return entry;
  }

  #ownTitle(value: unknown, except: string | null): string {
    const title = cleanText(value, LIMIT.own_title + 1);
    if (title.length < LIMIT.own_title_min || title.length > LIMIT.own_title)
      throw new Refused(400, "invalid", SAY.title);
    if (
      this.own().some(
        (item) => item.key !== except && item.title.toLowerCase() === title.toLowerCase(),
      )
    )
      throw new Refused(409, "name_taken", SAY.titleTaken);
    return title;
  }

  addOwn(input: Input, by: Staff): PolicyEntry {
    if (this.own().length >= LIMIT.own) throw new Refused(409, "too_many", SAY.tooMany);
    const title = this.#ownTitle(input.title, null);
    const now = this.#core.now();
    const entry: PolicyEntry = {
      key: `own-${randomUUID()}`,
      title,
      file_id: null,
      owner: "",
      approved_by: "",
      approved_on: null,
      not_needed: null,
      note: "",
      created_at: now,
      created_by: by,
      updated_at: now,
      updated_by: by,
    };
    this.entries.push(entry);
    this.#save();
    this.log(entry.key, "added", "", by);
    return entry;
  }
}
