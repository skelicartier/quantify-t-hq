/**
 * Logs and time (ws-notes/security/spec.md §7.2): one record per system that keeps logs (a
 * tool from Systems or a name he types): what it logs, where they go, how long they stay,
 * whether they are kept in India, which clock it keeps time by, and each quarterly look. On
 * disk under `data/logs/`. Nothing here reads a log or asks a time server.
 */

import type { Flag } from "../company-contracts";
import type { Staff } from "../protocol";
import type { LogKind } from "../../../src/lib/data/labels-controls";
import type { LogPlace, TimeSource } from "../../../src/lib/data/labels-devices";

export type LogLook = {
  check_id: string;
  on: string;
  by_name: string;
  note: string;
  /** Files, "Security › Logs". */
  file_id: string | null;
  at: string;
  by: Staff;
};

export type LogSystem = {
  log_id: string;
  /** A tool in Systems, when one was chosen. */
  tool_id: string | null;
  /** The tool's name when chosen, else typed. */
  name: string;
  kinds: LogKind[];
  /** "The cloud's log store, then a bucket", as typed. */
  where: string;
  retention_days: number | null;
  place: LogPlace;
  region: string;
  time_source: TimeSource;
  /** "samay1.nic.in", as typed. */
  time_detail: string;
  /** The time zone is kept with each time (CERT-In's FAQ 40). */
  zone_recorded: Flag;
  checks: LogLook[];
  retired: { on: string; why: string } | null;
  notes: string;
  created_at: string;
  created_by: Staff;
  updated_at: string;
  updated_by: Staff;
};

/** One line of `logs/events.jsonl`: field names in words, never their values. */
export type LogsEvent = {
  event_id: string;
  log_id: string;
  verb: string;
  detail: string;
  by: Staff;
  at: string;
};

/** A check line: its key, so a page can put the rule line, the readings or the source beside it. */
export type LogLine = {
  key:
    | "retention_unknown"
    | "retention_short"
    | "place_outside"
    | "place_unknown"
    | "time_unknown"
    | "time_cloud"
    | "time_other"
    | "zone"
    | "look_overdue";
  words: string;
  /** Something to look at; false for a line that only says what is allowed. */
  attention: boolean;
};
