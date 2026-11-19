/**
 * The holiday set's shapes (ws-notes/duties/spec.md §7.4): each day off he records, of a
 * kind (national, state, company; optional days are listed but are not days off), and the
 * working week (the weekly off days, the state whose list he follows, the state's minimum as
 * his CA confirmed it, and how many optional days each person may take). Nothing is guessed:
 * no list ships in the code. A holiday is not a legal record, so it may be changed or removed;
 * each change is a line in `holidays/events.jsonl`.
 */

import type { HolidayKind } from "../duties-contracts";
import type { Staff } from "../protocol";

export type Holiday = {
  holiday_id: string;
  on: string;
  name: string;
  kind: HolidayKind;
  note: string;
  created_at: string;
  created_by: Staff;
};

export type HolidaySetup = {
  /** 0 Sunday … 6 Saturday; at least one, at most six. Default [0, 6]. */
  week_off: number[];
  /** The state whose list he follows: a key of `STATES` (labels-company), or "". */
  state: string;
  /** The state's minimum paid holidays a year, as his CA confirmed it; null until typed. */
  state_minimum: number | null;
  /** How many optional holidays each person may take; null until typed. */
  optional_allowance: number | null;
  updated_at: string | null;
  updated_by: Staff | null;
};

export type HolidaysFile = { format: 1; setup: HolidaySetup; holidays: Holiday[] };

/** One line of `holidays/events.jsonl`: what changed. */
export type HolidayEvent = {
  event_id: string;
  verb: "added" | "changed" | "removed" | "setup";
  holiday_id: string | null;
  on: string | null;
  name: string;
  by: Staff;
  at: string;
};

/** A holiday as the page lists it: its weekday, and whether it falls on a weekly off day. */
export type HolidayRow = Holiday & { weekday: string; on_week_off: boolean };
