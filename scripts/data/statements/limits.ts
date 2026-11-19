/**
 * The statements module's limits (ws-notes/duties/spec.md §9.3, §9.4): module constants,
 * never edits to `guard.ts`. The sentences a person reads are in
 * `src/lib/data/labels-statements.ts`, shared with the pages.
 */

/** The most a statement file may be: 3 MiB, as any file sent in one request. */
export const STATEMENT_MAX_BYTES = 3 * 1024 * 1024;
/** The most transaction lines one file may hold. */
export const STATEMENT_MAX_LINES = 20_000;
/** Rows looked at to choose the delimiter, and to find the row of column names. */
export const DELIMITER_ROWS = 30;
export const HEADER_ROWS = 40;
/** The first rows of a file shown in the preview, as read. */
export const PREVIEW_ROWS = 20;

export const ACCOUNT_NAME_MAX = 120;
export const BANK_NAME_MAX = 120;
export const NARRATION_MAX = 500;
export const REFERENCE_MAX = 120;
export const NOTE_MAX = 500;
export const FILE_NAME_MAX = 255;
export const WHY_MIN = 5;
export const WHY_MAX = 300;

/** A stipend payment is offered for a line paid within this many days of it. */
export const STIPEND_DAYS = 5;
/** A reference or an invoice number shorter than this is never taken as a match on its own. */
export const REFERENCE_MATCH_MIN = 6;
export const INVOICE_MATCH_MIN = 5;

/** An import kept between its preview and its import, under core's `tmp/`. */
export const IMPORT_KEEP_MS = 60 * 60 * 1_000;

export const FOLDER = "statements";
export const ACCOUNTS = "statements/accounts.json";
export const STATEMENTS = "statements/statements.json";
export const LINES_FOLDER = "statements/lines";
export const FILES_FOLDER = "statements/files";
export const EVENTS = "statements/events.jsonl";
export const EDITS = "statements/edits.jsonl";
/** Replays of creating POSTs, kept here (left out of an Admin's backup), never in core's log. */
export const ATTEMPTS = "statements/attempts.jsonl";
