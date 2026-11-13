/**
 * Text as it arrives in files: bytes decoded the way Mail merge decodes a list (a UTF-16
 * byte-order mark first, then strict UTF-8, then the old Windows page), and a CSV read
 * with the same reader and column keys the sender uses, so a heading becomes the same
 * field name everywhere.
 */

import { parseCsv } from "../../src/lib/crm/csv";
import { columnKey } from "../mail-merge/template";

export { csvCell, toCsv } from "../../src/lib/crm/csv-download";

/** A spreadsheet's export as text: UTF-8, UTF-16 by its mark, or the old Windows page. */
export function decode(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

export type CsvRead = {
  /** The headings as written. */
  header: string[];
  /** The field key of each heading (`columnKey`), made unique. */
  keys: string[];
  rows: string[][];
};

/** Unique field keys for a header row: "Email", "email" and "" each still get their own. */
export function keysOf(header: readonly string[]): string[] {
  const taken = new Set<string>();
  return header.map((label, index) => {
    const base = columnKey(label) || `column_${index + 1}`;
    let key = base;
    for (let copy = 2; taken.has(key); copy += 1) key = `${base}_${copy}`;
    taken.add(key);
    return key;
  });
}

/** A CSV as the sender reads one, with field keys for its headings. */
export function readCsv(text: string): CsvRead {
  const table = parseCsv(text);
  return { header: table.header, keys: keysOf(table.header), rows: table.rows };
}

/** One row as a record by field key; a short row leaves later keys "". */
export function rowRecord(keys: readonly string[], row: readonly string[]): Record<string, string> {
  const record: Record<string, string> = {};
  keys.forEach((key, index) => {
    record[key] = (row[index] ?? "").trim();
  });
  return record;
}

/** Whether the first bytes read as text: valid UTF-8 (or UTF-16 by its mark) with no NUL. */
export function looksLikeText(bytes: Uint8Array): boolean {
  const head = bytes.subarray(0, 8_192);
  if ((head[0] === 0xff && head[1] === 0xfe) || (head[0] === 0xfe && head[1] === 0xff)) return true;
  if (head.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(
      // A multi-byte character cut at the sample's edge is not a fault of the file.
      head.length === bytes.length ? head : trimToCharacter(head),
    );
    return true;
  } catch {
    return false;
  }
}

function trimToCharacter(head: Uint8Array): Uint8Array {
  const end = head.length;
  for (let back = 1; back <= 3 && end - back >= 0; back += 1) {
    const byte = head[end - back]!;
    if ((byte & 0xc0) === 0x80) continue; // a continuation byte: keep looking back
    if (byte >= 0xc0) return head.subarray(0, end - back); // a lead byte at the edge: cut before it
    break;
  }
  return head;
}
