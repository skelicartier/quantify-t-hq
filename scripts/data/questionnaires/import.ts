/**
 * A buyer's file as rows, for the two-step import (ws-notes/security/spec.md §9.3): CSV by the
 * sender's own reader, XLSX by the reader written here, told apart by their first bytes as
 * Files tells them. Step 1 answers what was read (the sheets, the header row's guess, the
 * first twenty rows after it, how many questions); nothing is kept until step 2. Pure but for
 * the bytes it is handed.
 */

import { sniff } from "../files/sniff";
import { decode, readCsv } from "../text";
import { columnsOf, guessMap, headerRowOf, questionsOf, type GuessMap } from "./columns";
import {
  COLUMNS_CUT_WORDS,
  EMPTY_WORDS,
  NOT_A_SHEET_WORDS,
  QUESTIONNAIRE_LIMITS,
  ROWS_CUT_WORDS,
  XLSX_LIMITS,
} from "./limits";
import { XlsxRefused, isCompoundFile, readXlsx } from "./xlsx-read";

export class ImportRefused extends Error {
  constructor(readonly words: string) {
    super(words);
    this.name = "ImportRefused";
  }
}

export type SheetsRead = {
  format: "csv" | "xlsx";
  /** Every sheet with its row count; one, named "", for a CSV. */
  sheets: { name: string; rows: number }[];
  /** The sheet read; null for a CSV. */
  sheet: string | null;
  rows: string[][];
  columns_cut: boolean;
  rows_cut: boolean;
};

/** What a file is, from its first bytes and its name: a CSV, a workbook, or neither. */
export function formatOf(bytes: Uint8Array, name: string): "csv" | "xlsx" | null {
  if (isCompoundFile(bytes)) return "xlsx"; // refused by the reader with what to do
  const kind = sniff(bytes.subarray(0, 8_192), name).kind;
  if (kind === "excel" || kind === "zip") return "xlsx";
  if (kind === "csv" || kind === "text") return "csv";
  return null;
}

const cut = (text: string) =>
  text.length > XLSX_LIMITS.cell_chars ? `${text.slice(0, XLSX_LIMITS.cell_chars)} …` : text;

function csvRows(bytes: Uint8Array): Omit<SheetsRead, "format" | "sheets" | "sheet"> {
  const read = readCsv(decode(bytes));
  const all = [read.header, ...read.rows];
  let columnsCut = false;
  const rows = all.slice(0, XLSX_LIMITS.rows).map((row) => {
    if (row.length > XLSX_LIMITS.columns && row.slice(XLSX_LIMITS.columns).some((cell) => cell))
      columnsCut = true;
    const kept = row.slice(0, XLSX_LIMITS.columns).map(cut);
    while (kept.length > 0 && kept[kept.length - 1] === "") kept.pop();
    return kept;
  });
  while (rows.length > 0 && rows[rows.length - 1]!.length === 0) rows.pop();
  return { rows, columns_cut: columnsCut, rows_cut: all.length > XLSX_LIMITS.rows };
}

/** The file as rows: a CSV's, or a workbook's sheet (the one named, or the first). */
export function readSheets(bytes: Uint8Array, name: string, sheet: string | null): SheetsRead {
  if (bytes.length === 0) throw new ImportRefused(EMPTY_WORDS);
  const format = formatOf(bytes, name);
  if (format === null) throw new ImportRefused(NOT_A_SHEET_WORDS);
  if (format === "csv") {
    const read = csvRows(bytes);
    return { format, sheets: [{ name: "", rows: read.rows.length }], sheet: null, ...read };
  }
  try {
    const read = readXlsx(bytes, { sheet });
    return {
      format,
      sheets: read.sheets,
      sheet: read.sheet.name,
      rows: read.sheet.rows,
      columns_cut: read.sheet.columns_cut,
      rows_cut: read.sheet.rows_cut,
    };
  } catch (error) {
    if (error instanceof XlsxRefused) throw new ImportRefused(error.words);
    throw error;
  }
}

export type PreviewRead = {
  format: "csv" | "xlsx";
  sheets: { name: string; rows: number }[];
  sheet: string | null;
  header_row: number;
  columns: string[];
  /** The first twenty rows after the header, padded to the columns. */
  rows: string[][];
  guess: GuessMap;
  /** Rows after the header whose guessed question cell is not empty. */
  questions: number;
  /** "Columns after BH are not read.", "Rows after 5,000 are not read.", or none. */
  notes: string[];
};

/** Step 1's answer, from the rows: the header row (his, or the guess), the guess, the first rows. */
export function previewOf(read: SheetsRead, headerRow: number | null): PreviewRead {
  const header =
    headerRow !== null && headerRow >= 1 && headerRow <= Math.max(1, read.rows.length)
      ? headerRow
      : headerRowOf(read.rows);
  const columns = columnsOf(read.rows, header);
  const guess = guessMap(columns);
  const pad = (row: readonly string[]) =>
    Array.from({ length: columns.length }, (_, index) => row[index] ?? "");
  const rows = read.rows
    .slice(header, header + QUESTIONNAIRE_LIMITS.preview_rows)
    .map((row) => pad(row));
  const questions =
    guess.question === null
      ? 0
      : questionsOf(read.rows, header, { ...guess, question: guess.question }).questions.length;
  return {
    format: read.format,
    sheets: read.sheets,
    sheet: read.sheet,
    header_row: header,
    columns,
    rows,
    guess,
    questions,
    notes: [
      ...(read.columns_cut ? [COLUMNS_CUT_WORDS] : []),
      ...(read.rows_cut ? [ROWS_CUT_WORDS] : []),
    ],
  };
}
