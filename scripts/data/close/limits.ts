/**
 * The close module's limits and where it keeps its records (ws-notes/duties/spec.md §9.7):
 * module constants, never edits to `guard.ts`.
 */

export const FOLDER = "close";
export const MONTHS_FOLDER = "close/months";
export const MIS_FOLDER = "close/mis";
/** The MIS's people part: left out of a backup an Admin makes. */
export const OWNER_FOLDER = "close/owner";
export const EVENTS = "close/events.jsonl";
export const EDITS = "close/edits.jsonl";

export const COMMENTARY_MAX = 4_000;
export const NOTE_MAX = 500;
export const NAME_MAX = 120;
export const HOW_MAX = 120;
export const REOPEN_MIN = 10;
export const REOPEN_MAX = 500;
/** Due lists the last three months that are over and not locked. */
export const DUE_MONTHS = 3;
/** Files a close row may hold. */
export const FILES_PER_ROW = 50;
export const COPY_MAX_BYTES = 3 * 1024 * 1024;
/** Years a voucher is kept after its financial year, when the rule book is not loaded. */
export const RETENTION_YEARS = 8;
