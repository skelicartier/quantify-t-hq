/**
 * Delimited text from a bank (ws-notes/duties/spec.md §9.3): `.csv`, `.txt`, `.tsv`. Pure,
 * `bytes → lines`, written here with no dependency, and it never throws: a file it cannot
 * read is answered `{ ok: false, words }` with the sentence the page prints.
 *
 * Decoding is `text.ts`'s (UTF-8 with its mark dropped, UTF-16 by its mark, else the old
 * Windows page). Records split on CRLF, LF or CR outside quotes; a field quoted with `"`
 * may hold the delimiter, a line break and a doubled quote. The delimiter is the one of
 * comma, semicolon, tab and bar that gives the same column count on the most of the first 30
 * non-empty rows (three columns at least); the row of column names is the first of the first
 * 40 with a cell saying "date" and three cells filled. Amounts must use a dot for paise: a
 * cell ending in a comma and two digits refuses the whole file, since a decimal comma read
 * as a thousands separator would make it a hundred times too large.
 */

import { minorOf } from "../../../src/lib/data/labels-duties";
import {
  DECIMAL_COMMA_WORDS,
  NOT_A_STATEMENT_WORDS,
  NO_DATES_WORDS,
  NO_HEADER_WORDS,
  NO_LINES_WORDS,
  PDF_WORDS,
  TOO_LARGE_WORDS,
  TOO_MANY_LINES_WORDS,
  XLS_WORDS,
} from "../../../src/lib/data/labels-statements";
import { isDay } from "../guard";
import { decode } from "../text";
import {
  DELIMITER_ROWS,
  HEADER_ROWS,
  NARRATION_MAX,
  REFERENCE_MAX,
  STATEMENT_MAX_BYTES,
  STATEMENT_MAX_LINES,
} from "./limits";
import type { AmountColumns, CsvMapping, DateFormat, Delimiter, Parsed, ReadLine } from "./types";

export const DELIMITERS: readonly Delimiter[] = [",", ";", "\t", "|"];
export const DATE_FORMATS: readonly DateFormat[] = [
  "DD/MM/YYYY",
  "DD-MM-YYYY",
  "DD/MM/YY",
  "DD-MMM-YYYY",
  "DD MMM YYYY",
  "YYYY-MM-DD",
  "MM/DD/YYYY",
];

// ------------------------------------------------------------------ what is never read

const startsWith = (bytes: Uint8Array, head: readonly number[]) =>
  head.every((byte, index) => bytes[index] === byte);

/** A spreadsheet or a PDF, by its first bytes or its name: the page's sentence, else null. */
export function refusalOf(bytes: Uint8Array, name: string): string | null {
  const lower = name.toLowerCase();
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46]) || lower.endsWith(".pdf")) return PDF_WORDS;
  if (
    startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) ||
    startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]) ||
    lower.endsWith(".xlsx") ||
    lower.endsWith(".xls")
  )
    return XLS_WORDS;
  if (bytes.length > STATEMENT_MAX_BYTES) return TOO_LARGE_WORDS;
  return null;
}

// ------------------------------------------------------------------ records and fields

/**
 * The file's records, each its fields. A record is ended by CRLF, LF or CR outside quotes.
 * `limit` stops after that many records (for choosing the delimiter on the first rows).
 */
export function splitRecords(text: string, delimiter: string, limit = Infinity): string[][] {
  const records: string[][] = [];
  let fields: string[] = [];
  let field = "";
  let quoted = false;
  let started = false;
  const endField = () => {
    fields.push(field);
    field = "";
    started = false;
  };
  const endRecord = () => {
    endField();
    records.push(fields);
    fields = [];
  };
  for (let index = 0; index < text.length; index += 1) {
    if (records.length >= limit) return records;
    const char = text[index]!;
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else quoted = false;
      } else field += char;
      continue;
    }
    if (char === '"' && !started && field.trim() === "") {
      quoted = true;
      started = true;
      field = "";
    } else if (char === delimiter) endField();
    else if (char === "\r" || char === "\n") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      endRecord();
    } else {
      field += char;
      if (char !== " ") started = true;
    }
  }
  if (field !== "" || fields.length > 0 || quoted) endRecord();
  return records;
}

const filled = (record: readonly string[]) => record.some((cell) => cell.trim() !== "");

/** The delimiter whose column count repeats on the most of the first non-empty rows. */
export function chooseDelimiter(text: string): Delimiter | null {
  let best: { delimiter: Delimiter; score: number; columns: number } | null = null;
  for (const delimiter of DELIMITERS) {
    const rows = splitRecords(text, delimiter, DELIMITER_ROWS * 4)
      .filter(filled)
      .slice(0, DELIMITER_ROWS);
    const counts = new Map<number, number>();
    for (const row of rows)
      if (row.length >= 3) counts.set(row.length, (counts.get(row.length) ?? 0) + 1);
    let score = 0;
    let columns = 0;
    for (const [count, times] of counts)
      if (times > score || (times === score && count > columns)) {
        score = times;
        columns = count;
      }
    if (
      score > 0 &&
      (!best || score > best.score || (score === best.score && columns > best.columns))
    )
      best = { delimiter, score, columns };
  }
  return best?.delimiter ?? null;
}

// ------------------------------------------------------------------ dates

const MONTH_NAMES = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

/** "Oct", "oct", "Sept", "October" → 10; anything else null. */
function monthOfName(word: string): number | null {
  const lower = word.toLowerCase();
  if (lower.length < 3) return null;
  const index = MONTH_NAMES.findIndex((name) => name.startsWith(lower));
  return index >= 0 ? index + 1 : null;
}

const TAIL = "(?:[ T].*)?$";
const PATTERNS: Record<DateFormat, RegExp> = {
  "DD/MM/YYYY": new RegExp(`^(\\d{1,2})\\/(\\d{1,2})\\/(\\d{4})${TAIL}`),
  "DD-MM-YYYY": new RegExp(`^(\\d{1,2})-(\\d{1,2})-(\\d{4})${TAIL}`),
  "DD/MM/YY": new RegExp(`^(\\d{1,2})\\/(\\d{1,2})\\/(\\d{2})${TAIL}`),
  "DD-MMM-YYYY": new RegExp(`^(\\d{1,2})-([A-Za-z]{3,9})-(\\d{4})${TAIL}`),
  "DD MMM YYYY": /^(\d{1,2}) ([A-Za-z]{3,9}),? (\d{4})(?: .*)?$/,
  "YYYY-MM-DD": new RegExp(`^(\\d{4})-(\\d{1,2})-(\\d{1,2})${TAIL}`),
  "MM/DD/YYYY": new RegExp(`^(\\d{1,2})\\/(\\d{1,2})\\/(\\d{4})${TAIL}`),
};

const pad = (value: number) => String(value).padStart(2, "0");

/** A cell read in one format as "YYYY-MM-DD", or null. Two-digit years are 2000–2099. */
export function readDate(cell: string, format: DateFormat): string | null {
  const match = PATTERNS[format].exec(cell.trim());
  if (!match) return null;
  const [, a = "", b = "", c = ""] = match;
  let year: number;
  let month: number | null;
  let day: number;
  if (format === "YYYY-MM-DD") [year, month, day] = [Number(a), Number(b), Number(c)];
  else if (format === "MM/DD/YYYY") [year, month, day] = [Number(c), Number(a), Number(b)];
  else if (format === "DD-MMM-YYYY" || format === "DD MMM YYYY")
    [year, month, day] = [Number(c), monthOfName(b), Number(a)];
  else if (format === "DD/MM/YY") [year, month, day] = [2000 + Number(c), Number(b), Number(a)];
  else [year, month, day] = [Number(c), Number(b), Number(a)];
  if (month === null) return null;
  const text = `${year}-${pad(month)}-${pad(day)}`;
  return isDay(text) ? text : null;
}

/**
 * The formats that read every date cell (cells no format reads are not dates: totals and
 * notes). Day first wins over month first when both read them all.
 */
export function guessDateFormat(cells: readonly string[]): {
  format: DateFormat | null;
  day_first_chosen: boolean;
} {
  const dates = cells.filter((cell) =>
    DATE_FORMATS.some((format) => readDate(cell, format) !== null),
  );
  if (dates.length === 0) return { format: null, day_first_chosen: false };
  const reading = DATE_FORMATS.filter((format) =>
    dates.every((cell) => readDate(cell, format) !== null),
  );
  return {
    format: reading[0] ?? null,
    day_first_chosen: reading.includes("DD/MM/YYYY") && reading.includes("MM/DD/YYYY"),
  };
}

// ------------------------------------------------------------------ amounts

export type AmountCell =
  | { kind: "empty" }
  | { kind: "bad" }
  | { kind: "comma" }
  | { kind: "value"; minor: number; negative: boolean; marker: "dr" | "cr" | null };

/**
 * One amount cell: ₹, Rs, INR, spaces and commas dropped; brackets or a minus sign mean
 * money out; a trailing Dr or Cr is read; a comma and two digits at its end is a decimal
 * comma, which is refused.
 */
export function amountCell(text: string): AmountCell {
  let value = text.replace(/[\s ]+/g, "").replace(/₹|Rs\.?|INR/gi, "");
  if (value === "" || value === "-" || value === "−") return { kind: "empty" };
  let marker: "dr" | "cr" | null = null;
  const tail = /(dr|cr)\.?$/i.exec(value);
  if (tail) {
    marker = tail[1]!.toLowerCase() as "dr" | "cr";
    value = value.slice(0, tail.index);
  }
  let negative = false;
  if (/^\(.*\)$/.test(value)) {
    negative = true;
    value = value.slice(1, -1);
  }
  if (/^[-−]/.test(value)) {
    negative = true;
    value = value.slice(1);
  } else if (/[-−]$/.test(value)) {
    negative = true;
    value = value.slice(0, -1);
  } else if (value.startsWith("+")) value = value.slice(1);
  if (/,\d{2}$/.test(value)) return { kind: "comma" };
  const minor = minorOf(value.replace(/,/g, ""));
  if (minor === null) return value === "" && marker ? { kind: "empty" } : { kind: "bad" };
  return { kind: "value", minor, negative, marker };
}

// ------------------------------------------------------------------ the columns

const words = (cell: string) =>
  cell
    .toLowerCase()
    .replace(/[._()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** The columns guessed from the header's words; null for any it could not tell. */
export function guessColumns(header: readonly string[]): {
  date: number | null;
  narration: number | null;
  reference: number | null;
  amount: AmountColumns | null;
  balance: number | null;
} {
  const cells = header.map(words);
  const find = (test: (cell: string, index: number) => boolean, taken: Set<number>) => {
    const index = cells.findIndex((cell, at) => !taken.has(at) && test(cell, at));
    return index >= 0 ? index : null;
  };
  const taken = new Set<number>();
  const keep = (index: number | null) => {
    if (index !== null) taken.add(index);
    return index;
  };
  let date: number | null = null;
  for (const name of ["transaction date", "txn date", "tran date", "posting date"]) {
    date = find((cell) => cell.includes(name), taken);
    if (date !== null) break;
  }
  date ??= find((cell) => /\bdate\b|\bdt\b/.test(cell) && !cell.includes("value"), taken);
  date ??= find((cell) => cell.includes("date"), taken);
  keep(date);
  const marker = keep(
    find((cell) => /dr\s*\/\s*cr|cr\s*\/\s*dr|^type$|^dr cr$|^cr dr$/.test(cell), taken),
  );
  const balance = keep(find((cell) => cell.includes("balance"), taken));
  const narration = keep(
    find((cell) => /narration|description|particulars|remarks|details/.test(cell), taken),
  );
  const reference = keep(find((cell) => /\b(ref|reference|chq|cheque|utr)/.test(cell), taken));
  const debit = keep(find((cell) => /\b(debit|withdrawal|withdrawals|dr)\b/.test(cell), taken));
  const credit = keep(find((cell) => /\b(credit|deposit|deposits|cr)\b/.test(cell), taken));
  const amount = keep(find((cell) => /\bamount\b|\bamt\b/.test(cell), taken));
  let columns: AmountColumns | null = null;
  if (debit !== null && credit !== null) columns = { style: "two_columns", debit, credit };
  else if (amount !== null && marker !== null)
    columns = { style: "marker", column: amount, marker };
  else if (amount !== null) columns = { style: "signed", column: amount };
  return { date, narration, reference, amount: columns, balance };
}

// ------------------------------------------------------------------ the file

/** Narration and reference as stored: spaces made one, cut to the limit. */
const tidy = (value: string, limit: number) => value.replace(/\s+/g, " ").trim().slice(0, limit);

const cellOf = (row: readonly string[], index: number | null) =>
  index === null ? "" : (row[index] ?? "");

type Row = { cells: string[]; record: number };

export function parseDelimited(
  bytes: Uint8Array,
  options: { name?: string; mapping?: CsvMapping | null; strict?: boolean } = {},
): Parsed {
  try {
    const refusal = refusalOf(bytes, options.name ?? "");
    if (refusal) return { ok: false, words: refusal };
    const text = decode(bytes).replace(/^﻿/, "");
    if (text.includes("\u0000")) return { ok: false, words: NOT_A_STATEMENT_WORDS };
    const given = options.mapping ?? null;
    if (given) {
      const read = readWith(text, given);
      if (read.ok || options.strict) return read;
    }
    const delimiter = chooseDelimiter(text);
    if (!delimiter) return { ok: false, words: NO_HEADER_WORDS };
    const rows = rowsOf(text, delimiter);
    const headerRow = rows
      .slice(0, HEADER_ROWS)
      .findIndex(
        (row) =>
          row.cells.some((cell) => /date/i.test(cell)) &&
          row.cells.filter((cell) => cell.trim() !== "").length >= 3,
      );
    if (headerRow < 0) return { ok: false, words: NO_HEADER_WORDS };
    const header = rows[headerRow]!.cells.map((cell) => cell.trim());
    const columns = guessColumns(header);
    const partial: Partial<CsvMapping> = { delimiter, header_row: headerRow };
    if (columns.date !== null) partial.date = columns.date;
    if (columns.narration !== null) partial.narration = columns.narration;
    partial.reference = columns.reference;
    if (columns.amount) partial.amount = columns.amount;
    partial.balance = columns.balance;
    if (columns.date === null || columns.amount === null)
      return {
        ok: false,
        words: "Choose which columns hold the day and the amounts.",
        header,
        mapping: partial,
      };
    const dateCells = rows.slice(headerRow + 1).map((row) => cellOf(row.cells, columns.date));
    const guessed = guessDateFormat(dateCells);
    if (!guessed.format) return { ok: false, words: NO_DATES_WORDS, header, mapping: partial };
    const mapping: CsvMapping = {
      delimiter,
      header_row: headerRow,
      date: columns.date,
      date_format: guessed.format,
      narration: columns.narration ?? -1,
      reference: columns.reference,
      amount: columns.amount,
      balance: columns.balance,
    };
    const read = readRows(rows, mapping, header);
    return read.ok ? { ...read, day_first_chosen: guessed.day_first_chosen } : read;
  } catch {
    return { ok: false, words: NOT_A_STATEMENT_WORDS };
  }
}

/** The non-empty records, each with its place in the file (counted from 1). */
function rowsOf(text: string, delimiter: string): Row[] {
  return splitRecords(text, delimiter)
    .map((cells, index) => ({ cells, record: index + 1 }))
    .filter((row) => filled(row.cells));
}

/** Read with a mapping he chose or the account remembers. */
function readWith(text: string, mapping: CsvMapping): Parsed {
  const rows = rowsOf(text, mapping.delimiter);
  const headerRow = rows[mapping.header_row];
  if (!headerRow) return { ok: false, words: NO_HEADER_WORDS };
  const header = headerRow.cells.map((cell) => cell.trim());
  // A remembered mapping from a file with more or fewer lines above its column names.
  if (!header.some((cell) => /date/i.test(cell))) return { ok: false, words: NO_HEADER_WORDS };
  const columns = [
    mapping.date,
    mapping.amount.style === "two_columns" ? mapping.amount.debit : mapping.amount.column,
    mapping.amount.style === "two_columns" ? mapping.amount.credit : mapping.date,
    mapping.amount.style === "marker" ? mapping.amount.marker : mapping.date,
  ];
  if (columns.some((column) => column < 0 || column >= header.length))
    return { ok: false, words: "Choose which columns hold the day and the amounts.", header };
  return readRows(rows, mapping, header);
}

function readRows(rows: readonly Row[], mapping: CsvMapping, header: string[]): Parsed {
  const lines: ReadLine[] = [];
  let ignored = 0;
  const narrationAt = mapping.narration >= 0 ? mapping.narration : null;
  for (const row of rows.slice(mapping.header_row + 1)) {
    const posted = readDate(cellOf(row.cells, mapping.date), mapping.date_format);
    if (!posted) {
      ignored += 1;
      continue;
    }
    const at = `Row ${row.record.toLocaleString("en-GB")}`;
    let direction: "debit" | "credit";
    let amount: number;
    const amountColumns = mapping.amount;
    if (amountColumns.style === "two_columns") {
      const out = amountCell(cellOf(row.cells, amountColumns.debit));
      const into = amountCell(cellOf(row.cells, amountColumns.credit));
      if (out.kind === "comma" || into.kind === "comma")
        return { ok: false, words: DECIMAL_COMMA_WORDS };
      if (out.kind === "bad" || into.kind === "bad")
        return { ok: false, words: `${at}: the amount could not be read.` };
      const outMinor = out.kind === "value" ? out.minor : 0;
      const inMinor = into.kind === "value" ? into.minor : 0;
      if (out.kind === "empty" && into.kind === "empty")
        return { ok: false, words: `${at} has a date and no amount.` };
      if (outMinor > 0 && inMinor > 0)
        return { ok: false, words: `${at} has money both out and in.` };
      if (outMinor === 0 && inMinor === 0) {
        ignored += 1;
        continue;
      }
      direction = outMinor > 0 ? "debit" : "credit";
      amount = outMinor > 0 ? outMinor : inMinor;
    } else {
      const cell = amountCell(cellOf(row.cells, amountColumns.column));
      if (cell.kind === "comma") return { ok: false, words: DECIMAL_COMMA_WORDS };
      if (cell.kind === "bad") return { ok: false, words: `${at}: the amount could not be read.` };
      if (cell.kind === "empty") return { ok: false, words: `${at} has a date and no amount.` };
      if (cell.minor === 0) {
        ignored += 1;
        continue;
      }
      amount = cell.minor;
      if (amountColumns.style === "marker") {
        const said = cellOf(row.cells, amountColumns.marker).trim().toLowerCase();
        if (/^(dr|d|debit|withdrawal)\b/.test(said)) direction = "debit";
        else if (/^(cr|c|credit|deposit)\b/.test(said)) direction = "credit";
        else return { ok: false, words: `${at}: the Dr or Cr column says neither.` };
      } else direction = cell.negative || cell.marker === "dr" ? "debit" : "credit";
    }
    let balance: number | null = null;
    if (mapping.balance !== null) {
      const cell = amountCell(cellOf(row.cells, mapping.balance));
      if (cell.kind === "comma") return { ok: false, words: DECIMAL_COMMA_WORDS };
      if (cell.kind === "value")
        balance = cell.negative || cell.marker === "dr" ? -cell.minor : cell.minor;
    }
    lines.push({
      row: row.record,
      posted_on: posted,
      direction,
      amount_minor: amount,
      balance_minor: balance,
      narration: tidy(cellOf(row.cells, narrationAt), NARRATION_MAX),
      reference: tidy(cellOf(row.cells, mapping.reference), REFERENCE_MAX),
    });
    if (lines.length > STATEMENT_MAX_LINES) return { ok: false, words: TOO_MANY_LINES_WORDS };
  }
  if (lines.length === 0) return { ok: false, words: NO_LINES_WORDS, header };
  return {
    ok: true,
    source: "delimited",
    lines: oldestFirst(lines),
    ignored_rows: ignored,
    mapping,
    header,
    day_first_chosen: false,
    from: null,
    to: null,
    closing_minor: null,
    currency: null,
  };
}

/** A file listed newest first is turned round, then kept in day order (stable within a day). */
export function oldestFirst<T extends { posted_on: string }>(lines: readonly T[]): T[] {
  const ordered =
    lines.length > 1 && lines[0]!.posted_on > lines[lines.length - 1]!.posted_on
      ? [...lines].reverse()
      : [...lines];
  return ordered
    .map((line, index) => ({ line, index }))
    .sort((a, b) => a.line.posted_on.localeCompare(b.line.posted_on) || a.index - b.index)
    .map((item) => item.line);
}
