/**
 * A workbook's sheets as rows of text (ws-notes/security/spec.md §9.3), read from bytes held
 * in memory with nothing but `node:zlib`. Refused, each with a sentence: an old `.xls` or a
 * password-protected workbook (the compound-file header), anything that is not a zip, Zip64,
 * an encrypted entry, a method other than stored or deflate, more than 2,000 entries, a part
 * unpacking past 16 MiB or the parts read past 32 MiB in all, and a part declaring its own
 * entities. Only `xl/workbook.xml`, its relationships, the shared strings and the worksheets
 * are opened: macros, drawings, comments and external links never are. No formula is
 * evaluated: a formula's cached value is read. Pure: no file, no clock.
 */

import { inflateRawSync } from "node:zlib";

import {
  ENCRYPTED_WORDS,
  ENTRIES_WORDS,
  METHOD_WORDS,
  NOT_XLSX_WORDS,
  NO_SHEETS_WORDS,
  NO_SHEET_WORDS,
  OLD_XLS_WORDS,
  PART_TOO_LARGE_WORDS,
  TOTAL_TOO_LARGE_WORDS,
  XLSX_LIMITS,
  ZIP64_WORDS,
} from "./limits";
import { DAMAGED, XmlRefused, ooxmlUnescape, scanXml } from "./xml";

export class XlsxRefused extends Error {
  constructor(readonly words: string) {
    super(words);
    this.name = "XlsxRefused";
  }
}

export type XlsxLimits = {
  entries: number;
  part_bytes: number;
  total_bytes: number;
  rows: number;
  columns: number;
  cell_chars: number;
};

export type SheetRead = {
  name: string;
  /** Row 1 first; a row is its cells from column A, trailing empty cells left off. */
  rows: string[][];
  /** A cell right of column BH was left out. */
  columns_cut: boolean;
  /** A row after row 5,000 was left out. */
  rows_cut: boolean;
};

export type WorkbookRead = {
  /** Every worksheet, in the workbook's order, with how many rows it holds. */
  sheets: { name: string; rows: number }[];
  /** The one asked for, or the first. */
  sheet: SheetRead;
};

const CFB = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const LOCAL = 0x04034b50;
const CENTRAL = 0x02014b50;
const END = 0x06054b50;
const MAX32 = 0xffffffff;

type Entry = {
  name: string;
  method: number;
  flags: number;
  compressed: number;
  size: number;
  offset: number;
};

const startsWith = (bytes: Uint8Array, prefix: readonly number[]) =>
  bytes.length >= prefix.length && prefix.every((byte, index) => bytes[index] === byte);

/** Whether the bytes are an old compound file: an `.xls`, or any password-protected workbook. */
export function isCompoundFile(bytes: Uint8Array): boolean {
  return startsWith(bytes, CFB);
}

/** A column's letters to its index: A → 0, Z → 25, AA → 26, AZ → 51, BA → 52. */
export function columnIndex(letters: string): number {
  let index = 0;
  for (const char of letters.toUpperCase()) {
    const code = char.charCodeAt(0);
    if (code < 65 || code > 90) return -1;
    index = index * 26 + (code - 64);
  }
  return index - 1;
}

/** An index to its letters: 0 → A, 26 → AA, 59 → BH. */
export function columnLetters(index: number): string {
  let left = index + 1;
  let letters = "";
  while (left > 0) {
    const rest = (left - 1) % 26;
    letters = String.fromCharCode(65 + rest) + letters;
    left = Math.floor((left - 1) / 26);
  }
  return letters;
}

/** "B3" → { row: 3, column: 1 }; null when it is not a cell reference. */
export function cellRef(ref: string): { row: number; column: number } | null {
  const found = /^\$?([A-Za-z]{1,3})\$?(\d{1,7})$/.exec(ref.trim());
  if (!found) return null;
  return { column: columnIndex(found[1]!), row: Number(found[2]) };
}

/** A cell's text, cut at the spreadsheet's own limit with " …". */
function cut(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit)} …` : text;
}

/** CR LF and a lone CR (`_x000D_`) read as one line break. */
function lines(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

// ------------------------------------------------------------------ the zip

function directoryOf(bytes: Uint8Array, limits: XlsxLimits): Map<string, Entry> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 22 || view.getUint32(0, true) !== LOCAL) throw new XlsxRefused(NOT_XLSX_WORDS);
  let end = -1;
  const lowest = Math.max(0, bytes.length - XLSX_LIMITS.end_search);
  for (let at = bytes.length - 22; at >= lowest; at -= 1) {
    if (view.getUint32(at, true) === END) {
      end = at;
      break;
    }
  }
  if (end < 0) throw new XlsxRefused(NOT_XLSX_WORDS);
  const total = view.getUint16(end + 10, true);
  const size = view.getUint32(end + 12, true);
  const start = view.getUint32(end + 16, true);
  if (size === MAX32 || start === MAX32 || total === 0xffff) throw new XlsxRefused(ZIP64_WORDS);
  if (total > limits.entries) throw new XlsxRefused(ENTRIES_WORDS);
  if (start + size > end) throw new XlsxRefused(NOT_XLSX_WORDS);
  const entries = new Map<string, Entry>();
  const decoder = new TextDecoder("utf-8");
  let at = start;
  let count = 0;
  while (at + 46 <= end && view.getUint32(at, true) === CENTRAL) {
    count += 1;
    if (count > limits.entries) throw new XlsxRefused(ENTRIES_WORDS);
    const flags = view.getUint16(at + 8, true);
    const method = view.getUint16(at + 10, true);
    const compressed = view.getUint32(at + 20, true);
    const uncompressed = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const offset = view.getUint32(at + 42, true);
    if (compressed === MAX32 || uncompressed === MAX32 || offset === MAX32)
      throw new XlsxRefused(ZIP64_WORDS);
    if ((flags & 1) === 1) throw new XlsxRefused(ENCRYPTED_WORDS);
    if (method !== 0 && method !== 8) throw new XlsxRefused(METHOD_WORDS);
    if (at + 46 + nameLength > bytes.length) throw new XlsxRefused(NOT_XLSX_WORDS);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    at += 46 + nameLength + extraLength + commentLength;
    // A name that climbs out or starts at the root is never a part of the workbook.
    if (name.startsWith("/") || name.split(/[\\/]/).includes("..")) continue;
    if (!entries.has(name))
      entries.set(name, { name, method, flags, compressed, size: uncompressed, offset });
  }
  return entries;
}

class Parts {
  #read = 0;
  constructor(
    readonly bytes: Uint8Array,
    readonly entries: Map<string, Entry>,
    readonly limits: XlsxLimits,
  ) {}

  has(name: string): boolean {
    return this.entries.has(name);
  }

  /** One entry's bytes, inflated within the limits; null when there is no such entry. */
  bytesOf(name: string): Uint8Array | null {
    const entry = this.entries.get(name);
    if (!entry) return null;
    const view = new DataView(this.bytes.buffer, this.bytes.byteOffset, this.bytes.byteLength);
    const at = entry.offset;
    if (at + 30 > this.bytes.length || view.getUint32(at, true) !== LOCAL)
      throw new XlsxRefused(NOT_XLSX_WORDS);
    const data = at + 30 + view.getUint16(at + 26, true) + view.getUint16(at + 28, true);
    if (data + entry.compressed > this.bytes.length) throw new XlsxRefused(NOT_XLSX_WORDS);
    const raw = this.bytes.subarray(data, data + entry.compressed);
    let out: Uint8Array;
    if (entry.method === 0) {
      if (raw.length > this.limits.part_bytes) throw new XlsxRefused(PART_TOO_LARGE_WORDS);
      out = raw;
    } else {
      try {
        out = inflateRawSync(raw, { maxOutputLength: this.limits.part_bytes });
      } catch (error) {
        const code = (error as { code?: unknown }).code;
        if (error instanceof RangeError || code === "ERR_BUFFER_TOO_LARGE")
          throw new XlsxRefused(PART_TOO_LARGE_WORDS);
        throw new XlsxRefused(DAMAGED);
      }
    }
    this.#read += out.length;
    if (this.#read > this.limits.total_bytes) throw new XlsxRefused(TOTAL_TOO_LARGE_WORDS);
    return out;
  }

  textOf(name: string): string | null {
    const bytes = this.bytesOf(name);
    if (!bytes) return null;
    return new TextDecoder("utf-8").decode(bytes);
  }
}

// ------------------------------------------------------------------ the parts

/** A relationship's target, as a path inside the zip: relative to `xl/` unless it starts at the root. */
export function targetPath(target: string): string | null {
  const joined = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
  const parts: string[] = [];
  for (const part of joined.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (parts.length === 0) return null;
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return parts.length > 0 ? parts.join("/") : null;
}

function sheetsOf(parts: Parts): { name: string; path: string }[] {
  const workbook = parts.textOf("xl/workbook.xml");
  if (workbook === null) throw new XlsxRefused(NOT_XLSX_WORDS);
  const listed: { name: string; id: string }[] = [];
  scanXml(workbook, (event) => {
    if (event.type === "open" && event.name === "sheet")
      listed.push({ name: event.attrs.name ?? "", id: event.attrs.id ?? "" });
  });
  const rels = parts.textOf("xl/_rels/workbook.xml.rels") ?? "";
  const targets = new Map<string, string>();
  if (rels)
    scanXml(rels, (event) => {
      if (event.type === "open" && event.name === "Relationship") {
        const id = event.attrs.Id ?? "";
        const path = targetPath(event.attrs.Target ?? "");
        if (id && path && !targets.has(id)) targets.set(id, path);
      }
    });
  const sheets: { name: string; path: string }[] = [];
  for (const [index, item] of listed.entries()) {
    const path = targets.get(item.id) ?? `xl/worksheets/sheet${index + 1}.xml`;
    // Worksheets only: a chart sheet or a macro sheet is never opened.
    if (!path.startsWith("xl/worksheets/") || !path.endsWith(".xml") || !parts.has(path)) continue;
    sheets.push({ name: item.name || `Sheet${index + 1}`, path });
  }
  return sheets;
}

/** Each `<si>`: its `<t>`, or its runs' `<t>`s joined; phonetic runs are left out. */
function sharedStringsOf(parts: Parts): string[] {
  const text = parts.textOf("xl/sharedStrings.xml");
  if (text === null) return [];
  const strings: string[] = [];
  const stack: string[] = [];
  let current: string[] | null = null;
  let inT = false;
  scanXml(text, (event) => {
    if (event.type === "open") {
      stack.push(event.name);
      if (event.name === "si") current = [];
      else if (event.name === "t") {
        const parent = stack[stack.length - 2];
        inT = current !== null && (parent === "si" || parent === "r") && !stack.includes("rPh");
      }
    } else if (event.type === "close") {
      if (event.name === "t") inT = false;
      if (event.name === "si" && current) {
        strings.push(lines(ooxmlUnescape(current.join(""))));
        current = null;
      }
      const index = stack.lastIndexOf(event.name);
      if (index >= 0) stack.length = index;
    } else if (inT && current) current.push(event.text);
  });
  return strings;
}

function readSheet(
  parts: Parts,
  path: string,
  shared: readonly string[],
  limits: XlsxLimits,
  name: string,
): SheetRead {
  const text = parts.textOf(path);
  if (text === null) throw new XlsxRefused(NO_SHEET_WORDS);
  const rows: string[][] = [];
  let columnsCut = false;
  let rowsCut = false;
  let rowNumber = 0;
  let row: string[] | null = null;
  let column = -1;
  let cell: {
    type: string;
    v: string[];
    is: string[];
    inV: boolean;
    inIs: boolean;
    inT: boolean;
  } | null = null;
  const stack: string[] = [];
  const put = () => {
    if (!cell || !row) return;
    let value: string;
    if (cell.type === "s") {
      const at = Number.parseInt(cell.v.join("").trim(), 10);
      value = Number.isInteger(at) ? (shared[at] ?? "") : "";
    } else if (cell.type === "inlineStr") value = lines(ooxmlUnescape(cell.is.join("")));
    else if (cell.type === "b")
      value = cell.v.length === 0 ? "" : cell.v.join("").trim() === "1" ? "TRUE" : "FALSE";
    else if (cell.type === "str") value = lines(ooxmlUnescape(cell.v.join("")));
    else value = cell.v.join("");
    if (column >= limits.columns) {
      if (value !== "") columnsCut = true;
      return;
    }
    if (column < 0 || value === "") return;
    while (row.length < column) row.push("");
    row[column] = cut(value, limits.cell_chars);
  };
  scanXml(text, (event) => {
    if (event.type === "open") {
      stack.push(event.name);
      if (event.name === "row") {
        const given = Number.parseInt(event.attrs.r ?? "", 10);
        rowNumber = Number.isInteger(given) && given > 0 ? given : rowNumber + 1;
        if (rowNumber > limits.rows) {
          rowsCut = true;
          return false;
        }
        row = [];
        column = -1;
      } else if (event.name === "c" && row) {
        const ref = event.attrs.r ? cellRef(event.attrs.r) : null;
        column = ref && ref.column >= 0 ? ref.column : column + 1;
        cell = { type: event.attrs.t ?? "", v: [], is: [], inV: false, inIs: false, inT: false };
      } else if (cell) {
        if (event.name === "v") cell.inV = true;
        else if (event.name === "is") cell.inIs = true;
        else if (event.name === "t" && cell.inIs && !stack.includes("rPh")) cell.inT = true;
      }
    } else if (event.type === "close") {
      if (cell) {
        if (event.name === "v") cell.inV = false;
        else if (event.name === "is") cell.inIs = false;
        else if (event.name === "t") cell.inT = false;
      }
      if (event.name === "c" && cell) {
        put();
        cell = null;
      } else if (event.name === "row" && row) {
        while (rows.length < rowNumber - 1) rows.push([]);
        rows[rowNumber - 1] = row;
        row = null;
      }
      const index = stack.lastIndexOf(event.name);
      if (index >= 0) stack.length = index;
    } else if (cell) {
      if (cell.inV) cell.v.push(event.text);
      else if (cell.inT) cell.is.push(event.text);
    }
  });
  while (rows.length > 0 && rows[rows.length - 1]!.every((value) => value === "")) rows.pop();
  return { name, rows, columns_cut: columnsCut, rows_cut: rowsCut };
}

/**
 * Read a workbook: every worksheet's name and row count, and the one named (or the first)
 * as rows of text. Throws `XlsxRefused` with the sentence to show.
 */
export function readXlsx(
  bytes: Uint8Array,
  options: { sheet?: string | null; limits?: Partial<XlsxLimits> } = {},
): WorkbookRead {
  const limits: XlsxLimits = { ...XLSX_LIMITS, ...(options.limits ?? {}) };
  if (isCompoundFile(bytes)) throw new XlsxRefused(OLD_XLS_WORDS);
  try {
    const parts = new Parts(bytes, directoryOf(bytes, limits), limits);
    const listed = sheetsOf(parts);
    if (listed.length === 0) throw new XlsxRefused(NO_SHEETS_WORDS);
    const wanted = options.sheet ?? null;
    const chosen =
      wanted === null || wanted === "" ? listed[0]! : listed.find((s) => s.name === wanted);
    if (!chosen) throw new XlsxRefused(NO_SHEET_WORDS);
    const shared = sharedStringsOf(parts);
    const sheets: { name: string; rows: number }[] = [];
    let sheet: SheetRead | null = null;
    for (const item of listed) {
      const read = readSheet(parts, item.path, shared, limits, item.name);
      sheets.push({ name: item.name, rows: read.rows.length });
      if (item === chosen) sheet = read;
    }
    return { sheets, sheet: sheet! };
  } catch (error) {
    if (error instanceof XlsxRefused) throw error;
    if (error instanceof XmlRefused) throw new XlsxRefused(error.words);
    if (error instanceof RangeError) throw new XlsxRefused(NOT_XLSX_WORDS);
    throw error;
  }
}
