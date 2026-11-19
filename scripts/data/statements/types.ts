/**
 * The statements module's records (ws-notes/duties/spec.md §9.2): bank and card accounts,
 * the statements imported for them, and the lines those statements hold. Money is whole
 * minor units (paise, cents). Only the last four digits of an account number are kept.
 * For the Owner only: a line names who was paid what.
 */

import type { Staff } from "../protocol";

export type Account = {
  account_id: string;
  /** As he names it: "Walk Bank current". */
  name: string;
  kind: "bank" | "card";
  bank: string;
  /** The last four digits only; the full number is never stored. */
  last4: string;
  currency: string;
  /** For a file that gives no balances: what the account held at the start of a day. */
  opening: { on: string; balance_minor: number } | null;
  closed_on: string | null;
  /** The columns of this bank's file, remembered from the last import. */
  mapping: CsvMapping | null;
  created_at: string;
  created_by: Staff;
  updated_at: string;
  updated_by: Staff;
};

export type DateFormat =
  | "DD/MM/YYYY"
  | "DD-MM-YYYY"
  | "DD/MM/YY"
  | "DD-MMM-YYYY"
  | "DD MMM YYYY"
  | "YYYY-MM-DD"
  | "MM/DD/YYYY";

export type Delimiter = "," | ";" | "\t" | "|";

export type AmountColumns =
  | { style: "two_columns"; debit: number; credit: number }
  /** A minus sign or brackets mean money out. */
  | { style: "signed"; column: number }
  /** A second column says DR or CR. */
  | { style: "marker"; column: number; marker: number };

export type CsvMapping = {
  delimiter: Delimiter;
  /** The row holding the column names, counted from 0 over the file's non-empty rows. */
  header_row: number;
  date: number;
  date_format: DateFormat;
  narration: number;
  reference: number | null;
  amount: AmountColumns;
  balance: number | null;
};

export type StoredFile = { stored: string; original_name: string; bytes: number; sha256: string };

export type AddsUp =
  | { ok: true }
  | { ok: false; at_line: number; words: string }
  /** No balances in the file. */
  | { ok: null };

export type Statement = {
  statement_id: string;
  account_id: string;
  /** The days it covers, inclusive: at least the first and last line's days. */
  from: string;
  to: string;
  source: "delimited" | "ofx";
  file: StoredFile;
  copy: StoredFile | null;
  opening_minor: number | null;
  closing_minor: number | null;
  lines: number;
  skipped: number;
  ignored_rows: number;
  adds_up: AddsUp;
  imported_at: string;
  imported_by: Staff;
  withdrawn: { at: string; by: Staff; why: string } | null;
};

export type LineMatch =
  | { kind: "bill_payment"; bill_id: string; payment_id: string; made_here: boolean }
  | { kind: "export_receipt"; invoice_id: string; receipt_id: string; made_here: boolean }
  | { kind: "stipend"; person_id: string; payment_id: string };

export type Line = {
  line_id: string;
  account_id: string;
  statement_id: string;
  n: number;
  posted_on: string;
  direction: "debit" | "credit";
  amount_minor: number;
  balance_minor: number | null;
  narration: string;
  reference: string;
  fingerprint: string;
  category_id: string | null;
  match: LineMatch | null;
  note: string;
  sorted_at: string | null;
  sorted_by: Staff | null;
  /** Its statement was withdrawn: kept, greyed, counted nowhere. */
  withdrawn: boolean;
};

/** One transaction as a parser read it, before it is an account's line. */
export type ReadLine = {
  /** Its row in the file, counted from 1 over the non-empty rows (for OFX, its transaction). */
  row: number;
  posted_on: string;
  direction: "debit" | "credit";
  amount_minor: number;
  balance_minor: number | null;
  narration: string;
  reference: string;
};

/** What a parser answers: never a throw. */
export type Parsed =
  | {
      ok: true;
      source: "delimited" | "ofx";
      /** Oldest first. */
      lines: ReadLine[];
      ignored_rows: number;
      /** The mapping it read with (delimited files only). */
      mapping: CsvMapping | null;
      /** The column names (delimited files only). */
      header: string[];
      /** Both day-first and month-first read every date: it was read day first. */
      day_first_chosen: boolean;
      /** What the file itself says it covers (OFX), else null. */
      from: string | null;
      to: string | null;
      /** The balance the file itself gives at its end (OFX), else null. */
      closing_minor: number | null;
      /** The file's own currency (OFX), else null. */
      currency: string | null;
    }
  | {
      ok: false;
      words: string;
      /** When only the columns could not be told apart: the column names, so he can choose. */
      header?: string[];
      mapping?: Partial<CsvMapping>;
    };
