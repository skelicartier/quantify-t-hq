/**
 * Lead source files: CSVs kept in Files whose rows are leads (or people held back). Every
 * version of a file is read, oldest first and the current one last, so a value from a
 * newer version fills or replaces an older one and a row only an older version had stays,
 * marked stale: a new version never drops a lead.
 *
 * What a read gives is kept per source in memory and written beside the source as a
 * snapshot, so the leads a file brought stay even if the file later leaves Files.
 */

import { readFileSync, statSync } from "node:fs";

import { Refused } from "../../mail-merge/engine";
import type { DataStore } from "../store";
import { normaliseEmail } from "../guard";
import { decode, readCsv } from "../text";
import type { FilesService } from "./contracts";
import type { LeadSource, LeftOutRow } from "./types";

/** One person as a source file gives them: every column, from the last version that had them. */
export type SourceRow = {
  email: string;
  values: Record<string, string>;
  /** The version the row was last seen in. */
  n: number;
  line: number;
  /** Not in the current version. */
  stale: boolean;
};

export type SourceRead = {
  rows: Map<string, SourceRow>;
  /** Every version read, as `n:sha256`, so a start can tell whether the snapshot is current. */
  signature: string;
  version_n: number;
  sha256: string;
  /** Rows in the current version. */
  row_count: number;
  left_out: LeftOutRow[];
};

/** Larger than this, a source is refused: spec §3.6. */
export const SOURCE_MAX_BYTES = 100 * 1024 * 1024;
const LEFT_OUT_KEPT = 50_000;

const EMAIL_KEYS = new Set([
  "email",
  "e_mail",
  "email_address",
  "e_mail_address",
  "mail",
  "work_email",
  "business_email",
  "contact_email",
  "primary_email",
  "investor_email",
  "email_id",
]);

const ADDRESS = /[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/;

function addressIn(cell: string): string {
  const whole = normaliseEmail(cell);
  if (whole) return whole;
  const found = ADDRESS.exec(cell);
  return found ? normaliseEmail(found[0]) : "";
}

/** The column of addresses: by its heading, else the one most of whose cells are addresses. */
export function emailColumnOf(keys: readonly string[], rows: readonly string[][]): number {
  const byKey = keys.findIndex((key) => EMAIL_KEYS.has(key));
  if (byKey >= 0) return byKey;
  let best = -1;
  let bestShare = 0;
  const sample = rows.slice(0, 500);
  keys.forEach((_key, index) => {
    const filled = sample.filter((cells) => (cells[index] ?? "").trim() !== "");
    if (filled.length === 0) return;
    const share = filled.filter((cells) => addressIn(cells[index] ?? "")).length / filled.length;
    if (share > bestShare) {
      best = index;
      bestShare = share;
    }
  });
  return bestShare >= 0.5 ? best : -1;
}

/** One version's text: its rows by address and what was left out, line by line. */
export function readVersionText(
  text: string,
  n: number,
): { rows: Map<string, SourceRow>; left_out: LeftOutRow[]; row_count: number } {
  const table = readCsv(text);
  if (table.header.length === 0 || table.header.every((name) => name === ""))
    throw new Refused(
      400,
      "file_refused",
      "The file has no heading row. The first row names the columns.",
    );
  const at = emailColumnOf(table.keys, table.rows);
  if (at < 0)
    throw new Refused(
      400,
      "file_refused",
      "No column of email addresses was found. Name the column Email and try again.",
    );
  const rows = new Map<string, SourceRow>();
  const leftOut: LeftOutRow[] = [];
  table.rows.forEach((cells, index) => {
    // Line 1 is the heading row; blank lines were dropped by the reader.
    const line = index + 2;
    const raw = (cells[at] ?? "").trim();
    if (!raw) {
      leftOut.push({ line, reason: "No address", value: "" });
      return;
    }
    const email = addressIn(raw);
    if (!email) {
      leftOut.push({ line, reason: "Not an address", value: raw.slice(0, 120) });
      return;
    }
    if (rows.has(email)) {
      leftOut.push({ line, reason: "Already in this file", value: email });
      return;
    }
    const values: Record<string, string> = {};
    table.keys.forEach((key, position) => {
      values[key] = (cells[position] ?? "").trim();
    });
    values.email = email;
    rows.set(email, { email, values, n, line, stale: false });
  });
  return { rows, left_out: leftOut.slice(0, LEFT_OUT_KEPT), row_count: table.rows.length };
}

/** Merge a newer version's rows over what the older ones gave: non-empty values win. */
function mergeVersion(into: Map<string, SourceRow>, rows: Map<string, SourceRow>): void {
  for (const [email, row] of rows) {
    const known = into.get(email);
    if (!known) {
      into.set(email, { ...row, values: { ...row.values } });
      continue;
    }
    for (const [key, value] of Object.entries(row.values)) if (value) known.values[key] = value;
    known.n = row.n;
    known.line = row.line;
  }
}

/** The versions of a source's file in reading order: oldest first, the current one last. */
export function readingOrder(files: FilesService, fileId: string): { n: number; sha256: string }[] {
  const current = files.versionPath(fileId);
  const all = files.versions(fileId).map((version) => ({ n: version.n, sha256: version.sha256 }));
  if (!current) return all;
  return [
    ...all.filter((version) => version.n !== current.n),
    { n: current.n, sha256: current.sha256 },
  ];
}

export function signatureOf(order: readonly { n: number; sha256: string }[]): string {
  return order.map((version) => `${version.n}:${version.sha256}`).join("|");
}

/**
 * Read every version of a source's file. Yields between versions so the worker answers
 * in between; the caller marks a poison pill around it.
 */
export async function readSourceFile(
  files: FilesService,
  source: LeadSource,
  pause: () => Promise<void>,
): Promise<SourceRead> {
  const order = readingOrder(files, source.file_id);
  if (order.length === 0) throw new Refused(404, "not_found", "The file is no longer in Files.");
  const merged = new Map<string, SourceRow>();
  let current: { rows: Map<string, SourceRow>; left_out: LeftOutRow[]; row_count: number } | null =
    null;
  const last = order[order.length - 1]!;
  for (const version of order) {
    const located = files.versionPath(source.file_id, version.n);
    if (!located) continue;
    const size = statSync(located.path).size;
    if (size > SOURCE_MAX_BYTES)
      throw new Refused(400, "too_large", "That file is over 100 MB. Split it into two sources.");
    let read: { rows: Map<string, SourceRow>; left_out: LeftOutRow[]; row_count: number };
    try {
      read = readVersionText(decode(new Uint8Array(readFileSync(located.path))), version.n);
    } catch (error) {
      // An older version that cannot be read gives nothing; the current one must read.
      if (version.n !== last.n) continue;
      throw error;
    }
    mergeVersion(merged, read.rows);
    if (version.n === last.n) current = read;
    await pause();
  }
  if (!current) throw new Refused(400, "file_refused", "The current version could not be read.");
  for (const row of merged.values()) row.stale = !current.rows.has(row.email);
  return {
    rows: merged,
    signature: signatureOf(order),
    version_n: last.n,
    sha256: last.sha256,
    row_count: current.row_count,
    left_out: current.left_out,
  };
}

// ------------------------------------------------------------------ snapshots

type SnapshotHead = { format: 1; signature: string; version_n: number; sha256: string };

export function snapshotName(sourceId: string): string {
  return `leads/source-${sourceId}.jsonl`;
}

export function leftOutName(sourceId: string): string {
  return `leads/left-out-${sourceId}.json`;
}

/** Write what a read gave, whole, in one go (a line per row after a head line). */
export function writeSnapshot(store: DataStore, sourceId: string, read: SourceRead): void {
  const head: SnapshotHead = {
    format: 1,
    signature: read.signature,
    version_n: read.version_n,
    sha256: read.sha256,
  };
  const lines = [JSON.stringify(head)];
  for (const row of read.rows.values()) lines.push(JSON.stringify(row));
  store.writeText(snapshotName(sourceId), `${lines.join("\n")}\n`);
  store.writeJson(leftOutName(sourceId), read.left_out);
}

/** The last read of a source as it was written; null when there is none. */
export function readSnapshot(
  store: DataStore,
  sourceId: string,
): { signature: string; version_n: number; sha256: string; rows: Map<string, SourceRow> } | null {
  const text = store.readText(snapshotName(sourceId));
  if (!text) return null;
  const lines = text.split("\n");
  let head: SnapshotHead;
  try {
    head = JSON.parse(lines[0] ?? "") as SnapshotHead;
  } catch {
    return null;
  }
  if (head?.format !== 1) return null;
  const rows = new Map<string, SourceRow>();
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (!line) continue;
    try {
      const row = JSON.parse(line) as SourceRow;
      if (typeof row.email === "string") rows.set(row.email, row);
    } catch {
      // a torn line: that row comes back at the next read
    }
  }
  return { signature: head.signature, version_n: head.version_n, sha256: head.sha256, rows };
}

export function readLeftOut(store: DataStore, sourceId: string): LeftOutRow[] {
  const rows = store.readJson<LeftOutRow[]>(leftOutName(sourceId), []);
  return Array.isArray(rows) ? rows : [];
}
