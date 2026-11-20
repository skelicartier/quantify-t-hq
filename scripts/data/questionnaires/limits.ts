/**
 * The questionnaires module's limits and refusals (ws-notes/security/spec.md §9.3, §9.4,
 * §5.5). `guard.ts` is not edited this batch, so the limits new to questionnaires and the
 * answer library live here.
 */

import { DILIGENCE_LIMITS } from "../diligence/limits";

/** A buyer's file, as statements take one: in memory, at most 3 MiB. */
export const QUESTIONNAIRE_MAX_BYTES = 3 * 1024 * 1024;

export const XLSX_LIMITS = {
  /** The end record is in the last 22 + 65,535 bytes. */
  end_search: 65_557,
  entries: 2_000,
  /** One part, inflated. */
  part_bytes: 16 * 1024 * 1024,
  /** Every part read, inflated, together. */
  total_bytes: 32 * 1024 * 1024,
  rows: 5_000,
  columns: 60,
  /** A cell's text beyond this is cut with " …" (a spreadsheet's own cell limit). */
  cell_chars: 32_767,
} as const;

export const ANSWER_LIMITS = {
  question_min: 3,
  question: 500,
  answer: 4_000,
  caiq_ids: 20,
  other_ids: 10,
  evidence: 10,
  owner: 120,
  by_name: 120,
  answers: 3_000,
} as const;

export const QUESTIONNAIRE_LIMITS = {
  title_min: 3,
  title: 200,
  questions: DILIGENCE_LIMITS.questions,
  answer: 4_000,
  how: 200,
  questionnaires: 500,
  /** The header row is looked for in the first rows only. */
  header_search: 20,
  /** Rows shown in the preview, after the header. */
  preview_rows: 20,
} as const;

/** An import read but not yet kept is held this long, then swept. */
export const IMPORT_KEEP_MS = 60 * 60 * 1_000;

/** Matching (§5.5): the best three, "Likely" from 500, "Possible" from 300. */
export const MATCH = { likely: 500, possible: 300, shown: 3 } as const;

/** HQ's default: an approved answer is read again a year after it was approved. */
export const REVIEW_MONTHS_DEFAULT = 12;

/** A CAIQ question or control ID as its file writes it: "A&A-01.1", "IAM-02". */
export const CAIQ_ID = /^[A-Z&]{2,4}-\d{2}(\.\d{1,2})?$/;
/** A SIG ID or a buyer's own, as typed. */
export const OTHER_ID = /^[A-Za-z0-9 ._&#:/-]{1,40}$/;

export const CAIQ_ID_WORDS = "Type a CAIQ ID as its file writes it, such as A&A-01.1.";
export const OTHER_ID_WORDS =
  "Type another ID with letters, digits, spaces and . _ & # : / - only, 40 characters at most.";

export const OLD_XLS_WORDS =
  "This is an older .xls file or a password-protected one. Save it as .xlsx or CSV without a password, then import that.";
export const NOT_XLSX_WORDS = "This is not an .xlsx workbook. Save it as .xlsx or CSV.";
export const ZIP64_WORDS =
  "This workbook is too large for HQ to read. Save the questionnaire's sheet on its own as .xlsx or CSV.";
export const ENCRYPTED_WORDS =
  "Part of this workbook is encrypted. Save it as .xlsx or CSV without a password, then import that.";
export const METHOD_WORDS =
  "This workbook is packed in a way HQ does not read. Open it and save it again as .xlsx, or save it as CSV.";
export const ENTRIES_WORDS =
  "This workbook holds more than 2,000 parts, more than HQ reads. Save the questionnaire's sheet on its own as .xlsx or CSV.";
export const PART_TOO_LARGE_WORDS =
  "Part of this workbook unpacks to more than 16 MB, more than HQ reads. Save the questionnaire's sheet on its own as .xlsx or CSV.";
export const TOTAL_TOO_LARGE_WORDS =
  "This workbook unpacks to more than 32 MB, more than HQ reads. Save the questionnaire's sheet on its own as .xlsx or CSV.";
export const NO_SHEET_WORDS = "That sheet is not in this workbook.";
export const NO_SHEETS_WORDS = "This workbook has no sheet HQ can read. Save it as CSV.";
export const NOT_A_SHEET_WORDS = "Choose a CSV or .xlsx file: HQ reads those two.";
export const EMPTY_WORDS = "That file is empty.";
export const TOO_LARGE_WORDS =
  "That file is over 3 MB. Save the questionnaire's sheet on its own as .xlsx or CSV.";
export const NO_QUESTIONS_WORDS =
  "No questions were found under the header row. Choose the header row and the question column.";
export const IMPORT_GONE_WORDS = "That import is no longer here. Choose the file again.";

export const COLUMNS_CUT_WORDS = "Columns after BH are not read.";
export const ROWS_CUT_WORDS = "Rows after 5,000 are not read.";

/** The page's line under the export buttons (§9.3), in the shared words. */
export { EXPORT_KEEPS } from "../../../src/lib/data/labels-questionnaires";
