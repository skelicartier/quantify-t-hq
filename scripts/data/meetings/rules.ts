/**
 * Meetings' arithmetic (ws-notes/company/spec.md §5.3 and §7.5), pure: the serial titles,
 * the notice check, the board's quorum and the minutes timetable of Secretarial Standard 1.
 * Every amount comes in from the caller (his amount from the rule book, or the rule's own),
 * so nothing here reads a file or the clock.
 */

import { addDays, daysBetween } from "../days";
import type { RuleKey } from "../company-contracts";
import {
  countWords,
  dayWords,
  isGeneral,
  serialTitle,
} from "../../../src/lib/data/labels-registers";
import type { Meeting } from "./types";

/** His amount for a rule, or the rule's own; null when the rule has none. */
export type Amounts = (key: RuleKey) => number | null;

/** The day a meeting is on: the day it was held, or the day it is planned for. */
export const meetingDay = (meeting: Meeting): string => meeting.held_on ?? meeting.scheduled_on;

/**
 * Each meeting's place in its sequence (board meetings; AGMs; EGMs; resolutions by
 * circulation): every meeting not cancelled, by its day, then by when it was written.
 */
export function serials(meetings: readonly Meeting[]): Map<string, number> {
  const order = meetings
    .filter((meeting) => meeting.state !== "cancelled")
    .sort(
      (a, b) =>
        meetingDay(a).localeCompare(meetingDay(b)) || a.created_at.localeCompare(b.created_at),
    );
  const next: Record<string, number> = {};
  const found = new Map<string, number>();
  for (const meeting of order) {
    const serial = (next[meeting.kind] ?? 0) + 1;
    next[meeting.kind] = serial;
    found.set(meeting.meeting_id, serial);
  }
  return found;
}

/** "Board meeting 3, 12 Dec 2026", or the title he gave it; a cancelled one has no number. */
export function titleOf(meeting: Meeting, numbers: Map<string, number>): string {
  if (meeting.title) return meeting.title;
  const serial = numbers.get(meeting.meeting_id);
  const day = meetingDay(meeting);
  if (serial === undefined) {
    const kind = serialTitle(meeting.kind, 0, day).replace(/ 0, /, ", ");
    return `${kind} (cancelled)`;
  }
  return serialTitle(meeting.kind, serial, day);
}

const daysText = (count: number, clear: boolean): string =>
  `${countWords(count)} ${clear ? "clear " : ""}${count === 1 ? "day" : "days"}`;

export type NoticeCheck = {
  sent_on: string | null;
  /** The last day the notice may go and still meet the rule. */
  send_by: string;
  /** Days (board) or clear days (general meeting) between the notice and the meeting. */
  days: number | null;
  clear: boolean;
  needed: number;
  short: boolean;
  /** "7 days before", "20 clear days before", "Not sent". */
  words: string;
  /** The whole sentence the meeting's page shows. */
  sentence: string;
};

/**
 * The notice check: a board meeting needs at least 7 days, a general meeting 21 clear days
 * (the day the notice goes and the meeting's day are not counted). A resolution by
 * circulation has no notice.
 */
export function noticeCheck(meeting: Meeting, amounts: Amounts): NoticeCheck | null {
  if (meeting.kind === "circular") return null;
  const general = isGeneral(meeting.kind);
  const needed = amounts(general ? "general-notice" : "board-notice") ?? (general ? 21 : 7);
  const day = meetingDay(meeting);
  const sendBy = addDays(day, -(general ? needed + 1 : needed));
  const sent = meeting.notice.sent_on;
  if (!sent)
    return {
      sent_on: null,
      send_by: sendBy,
      days: null,
      clear: general,
      needed,
      short: false,
      words: "Not sent",
      sentence: `No notice recorded. Send it by ${dayWords(sendBy)}.`,
    };
  const between = daysBetween(sent, day);
  const days = general ? between - 1 : between;
  const short = days < needed;
  const words = days < 0 ? "After the meeting" : `${daysText(days, general)} before`;
  const reason = meeting.notice.shorter_reason;
  const sentence = [
    days < 0 ? `Sent ${dayWords(sent)}, after the meeting.` : `Sent ${dayWords(sent)}, ${words}.`,
    short ? `The rule is at least ${countWords(needed)}.` : "",
    short && reason ? `Why it was shorter: ${reason}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return { sent_on: sent, send_by: sendBy, days, clear: general, needed, short, words, sentence };
}

/** The warning a short notice gives, unless he recorded why it was shorter. */
export function noticeWarning(check: NoticeCheck | null, reason: string): string | null {
  if (!check || !check.short || check.days === null || reason) return null;
  if (check.days < 0) return "The notice is dated after the meeting.";
  return `Notice went ${daysText(check.days, check.clear)} before; the rule is at least ${countWords(check.needed)}.`;
}

/** Two directors, or a third of the board rounded up, whichever is more. */
export function quorumNeeded(directors: number | null, amount: number | null): number {
  return Math.max(amount ?? 2, directors ? Math.ceil(directors / 3) : 0);
}

export type Quorum = { needed: number; present: number; met: boolean; directors: number | null };

/** A held board meeting's quorum; null for anything else (a general meeting records its own). */
export function quorumOf(
  meeting: Meeting,
  directors: number | null,
  amounts: Amounts,
): Quorum | null {
  if (meeting.kind !== "board" || meeting.state !== "held") return null;
  const needed = quorumNeeded(directors, amounts("board-quorum"));
  const seen = new Set<string>();
  for (const person of meeting.attendees)
    if (person.role === "director")
      seen.add(person.director_id ?? `name:${person.name.toLowerCase()}`);
  return { needed, present: seen.size, met: seen.size >= needed, directors };
}

export const quorumSentence = (quorum: Quorum): string =>
  `Quorum: ${countWords(quorum.present)} present of ${countWords(quorum.needed)} needed.`;

export type Step = "draft" | "comments" | "signed";
export type TimetableRow = { step: Step; by: string; done_on: string | null };

/**
 * The minutes timetable from the meeting day H: draft out by H + 15; comments close 7
 * days after the draft actually went out, or H + 22 while it has not; entered and signed
 * by H + 30. Empty for a meeting not held and for a resolution by circulation.
 */
export function timetable(meeting: Meeting, amounts: Amounts): TimetableRow[] {
  if (meeting.kind === "circular" || meeting.state !== "held" || !meeting.held_on) return [];
  const held = meeting.held_on;
  const draft = amounts("minutes-draft") ?? 15;
  const comments = amounts("minutes-comments") ?? 7;
  const signed = amounts("minutes-signed") ?? 30;
  const { minutes } = meeting;
  return [
    { step: "draft", by: addDays(held, draft), done_on: minutes.draft_sent_on },
    {
      step: "comments",
      by: minutes.draft_sent_on
        ? addDays(minutes.draft_sent_on, comments)
        : addDays(held, draft + comments),
      done_on: minutes.comments_closed_on,
    },
    { step: "signed", by: addDays(held, signed), done_on: minutes.signed?.on ?? null },
  ];
}

/** Where the minutes are: the next step and its day, or "done" with the day they were signed. */
export function minutesStep(
  meeting: Meeting,
  amounts: Amounts,
): { step: Step | "done"; by: string } | null {
  const rows = timetable(meeting, amounts);
  if (rows.length === 0) return null;
  if (meeting.minutes.signed) return { step: "done", by: meeting.minutes.signed.on };
  const open = rows.find((row) => row.done_on === null && row.step !== "signed");
  const next = open ?? rows[2]!;
  return { step: next.step, by: next.by };
}
