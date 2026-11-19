/**
 * Money's edit log (ws-notes/duties/spec.md §5.4, §8.3): one line for every change to a
 * finance record, written **before** the record's file is saved, each line chained to the one
 * before it by a SHA-256 (`hash = sha256(editLineText(previous hash, line))`, the first line's
 * previous hash being 64 zeros). Append-only: nothing here rewrites or removes a line, and
 * `verify()` reads the file as it is on disk, so a line changed by hand breaks the chain at
 * its number. Values are printed as the pages print them.
 */

import { createHash } from "node:crypto";

import { editLineText, type EditLine } from "../duties-contracts";
import type { Staff } from "../protocol";
import type { DataStore } from "../store";

export const GENESIS = "0".repeat(64);
export const EDITS = "money/edits.jsonl";

export type Change = EditLine["changes"][number];

export const hashOf = (previous: string, line: Omit<EditLine, "hash">): string =>
  createHash("sha256").update(editLineText(previous, line), "utf8").digest("hex");

export type Verified = { ok: boolean; lines: number; broken_at: number | null };

export class EditLog {
  readonly #store: DataStore;
  readonly #name: string;
  readonly #now: () => string;
  lines: EditLine[];

  constructor(store: DataStore, now: () => string, name = EDITS) {
    this.#store = store;
    this.#name = name;
    this.#now = now;
    this.lines = store
      .readLines<EditLine>(name)
      .filter((line) => typeof line?.n === "number" && typeof line.hash === "string");
  }

  get last(): EditLine | null {
    return this.lines[this.lines.length - 1] ?? null;
  }

  /** Writes one line (synced) and answers it. */
  append(input: {
    record: string;
    id: string;
    verb: string;
    changes: Change[];
    by: Staff;
  }): EditLine {
    const previous = this.last;
    const body: Omit<EditLine, "hash"> = {
      n: (previous?.n ?? 0) + 1,
      record: input.record,
      id: input.id,
      verb: input.verb,
      changes: input.changes.map((change) => ({
        field: change.field,
        before: change.before,
        after: change.after,
      })),
      by: { staff_id: input.by.staff_id, name: input.by.name },
      at: this.#now(),
    };
    const line: EditLine = { ...body, hash: hashOf(previous?.hash ?? GENESIS, body) };
    this.#store.appendLine(this.#name, line);
    this.lines.push(line);
    return line;
  }

  /** One record's lines, oldest first. */
  of(record: string, id: string): EditLine[] {
    return this.lines.filter((line) => line.record === record && line.id === id);
  }

  /** The chain as it is on disk: the first line whose hash or number does not hold, or none. */
  verify(): Verified {
    const text = this.#store.readText(this.#name);
    const rows = text.split("\n").filter((row) => row.trim() !== "");
    let previous = GENESIS;
    for (const [index, row] of rows.entries()) {
      const n = index + 1;
      let line: EditLine;
      try {
        line = JSON.parse(row) as EditLine;
      } catch {
        return { ok: false, lines: rows.length, broken_at: n };
      }
      if (line?.n !== n || typeof line.hash !== "string")
        return { ok: false, lines: rows.length, broken_at: n };
      const { hash, ...body } = line;
      if (hash !== hashOf(previous, body)) return { ok: false, lines: rows.length, broken_at: n };
      previous = hash;
    }
    return { ok: true, lines: rows.length, broken_at: null };
  }
}

/** The fields that differ between two printed versions of a record, in the order given. */
export function changesOf(
  before: Readonly<Record<string, string>>,
  after: Readonly<Record<string, string>>,
): Change[] {
  const changes: Change[] = [];
  for (const field of Object.keys(after)) {
    const was = before[field] ?? "";
    const now = after[field] ?? "";
    if (was !== now) changes.push({ field, before: was, after: now });
  }
  return changes;
}
