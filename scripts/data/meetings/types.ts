/**
 * The shapes of Meetings (ws-notes/company/spec.md §7.2): board meetings, AGMs, EGMs and
 * resolutions by circulation, with the notice, who was there, the resolutions with their
 * MGT-14 choice, and the minutes, locked once signed. The serial ("Board meeting 3") is
 * worked out on every read, never stored.
 */

import type { MeetingKind, ResolutionKind } from "../company-contracts";
import type { Staff } from "../protocol";

export type { MeetingKind, ResolutionKind };

export type Attendee = {
  attendee_id: string;
  name: string;
  role: "director" | "member" | "proxy" | "invitee" | "auditor" | "secretary";
  /** A director in the company record, when chosen from it. */
  director_id: string | null;
  how: "in_person" | "video";
};

export type Resolution = {
  resolution_id: string;
  /** 1, 2, 3 … in the meeting's order. */
  number: number;
  title: string;
  text: string;
  kind: ResolutionKind;
  outcome: "passed" | "not_passed" | "deferred";
  /** A matter under section 179(3), such as issuing shares or borrowing. */
  s179_3: boolean;
  mgt14: "needed" | "not_needed" | "ask";
  /** A resolution by circulation: the later board meeting it was noted at. */
  noted_at: string | null;
};

export type Minutes = {
  text: string;
  draft_sent_on: string | null;
  comments_closed_on: string | null;
  comments: string;
  signed: { on: string; by_name: string; file_id: string | null; at: string; by: Staff } | null;
  /** After signing; never changed or removed. */
  later_notes: { note_id: string; text: string; at: string; by: Staff }[];
};

export type Meeting = {
  meeting_id: string;
  kind: MeetingKind;
  /** "" reads as "{kind} {serial}, {d Mon YYYY}". */
  title: string;
  scheduled_on: string;
  /** "HH:MM" or "". */
  time: string;
  place: string;
  mode: "in_person" | "video" | "hybrid";
  agenda: string;
  notice: { sent_on: string | null; shorter_reason: string };
  state: "planned" | "held" | "cancelled";
  held_on: string | null;
  chair: string;
  /** Typed only when the company record has no directors: the board's size that day. */
  board_size: number | null;
  attendees: Attendee[];
  /** General meetings: he records it; board meetings work it out. */
  quorum_present: boolean | null;
  resolutions: Resolution[];
  minutes: Minutes;
  cancelled: { on: string; why: string } | null;
  created_at: string;
  created_by: Staff;
  updated_at: string;
  updated_by: Staff;
};

export type MeetingsEvent = {
  event_id: string;
  meeting_id: string;
  /** "planned", "changed", "notice", "held", "cancelled", "resolution", "minutes" … */
  verb: string;
  detail: string;
  by: Staff;
  at: string;
};
