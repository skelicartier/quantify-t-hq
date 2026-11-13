/**
 * The six stages (spec §2.6.1), what each needs when a firm moves there, and the counts
 * read from the events: "now at" (where each firm's last move left it) and "ever reached"
 * (every stage a firm was ever moved to). Nothing is overwritten: every move is an event.
 */

import { Refused } from "../../mail-merge/engine";
import { LIMITS, clean, cleanText, isDay } from "../guard";
import type { Staff } from "../protocol";
import {
  DROP_REASONS,
  WAITLIST_STAGES,
  WAITLIST_STAGE_ORDER,
  type WaitlistStage,
} from "../../../src/lib/data/labels";
import type { Book, WaitlistEntry, WaitlistEvent } from "./entries";

/** The stages that need a next step and its day: every one but Customer and Dropped. */
export const NEEDS_NEXT_STEP: ReadonlySet<WaitlistStage> = new Set([
  "joined",
  "call_booked",
  "call_held",
  "pilot",
]);

export const isStage = (value: unknown): value is WaitlistStage =>
  typeof value === "string" && (WAITLIST_STAGE_ORDER as readonly string[]).includes(value);

export type StageMove = {
  stage: WaitlistStage;
  next_step: string;
  next_step_on: string | null;
  call_at: string | null;
  pilot: { starts_on: string; ends_on: string; success: string } | null;
  dropped: { reason: string; look_again_on: string | null } | null;
  /** The call's notes, offered when a call was held. */
  notes: string;
  /** The stage the person saw when they pressed: two presses at once are caught. */
  from: WaitlistStage | null;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** A move as the form sends it, checked against the stage's rules; refusals are sentences. */
export function readStageMove(
  body: Record<string, unknown>,
  now: string,
  today: string,
): StageMove {
  const stage = body.stage;
  if (!isStage(stage)) throw new Refused(400, "invalid", "Choose a stage.");
  const label = WAITLIST_STAGES[stage].label;
  const from = isStage(body.from) ? body.from : null;
  const nextStep = cleanText(body.next_step, LIMITS.title);
  const nextStepOn = clean(body.next_step_on, 10);
  const move: StageMove = {
    stage,
    next_step: "",
    next_step_on: null,
    call_at: null,
    pilot: null,
    dropped: null,
    notes: cleanText(body.notes, LIMITS.notes),
    from,
  };
  if (NEEDS_NEXT_STEP.has(stage)) {
    if (!nextStep || !isDay(nextStepOn))
      throw new Refused(
        400,
        "needs_next_step",
        `Moving to ${label} needs a next step and the day it is due by.`,
      );
    if (nextStepOn < today)
      throw new Refused(400, "invalid", "The day for the next step is in the past.");
    move.next_step = nextStep;
    move.next_step_on = nextStepOn;
  } else if (nextStep && stage === "customer") {
    // Customer may carry a next step if one is given; it is never required.
    move.next_step = nextStep;
    move.next_step_on = isDay(nextStepOn) ? nextStepOn : null;
  }
  if (stage === "call_booked") {
    const typed = clean(body.call_at, 40);
    const parsed = typed ? Date.parse(typed) : Number.NaN;
    if (!Number.isFinite(parsed)) throw new Refused(400, "invalid", "Say when the call is.");
    move.call_at = new Date(parsed).toISOString();
    if (Date.parse(move.call_at) < Date.parse(now) - 24 * 60 * 60_000)
      throw new Refused(400, "invalid", "The call is more than a day in the past.");
  }
  if (stage === "pilot") {
    const pilot = record(body.pilot);
    const startsOn = clean(pilot.starts_on ?? body.pilot_starts_on, 10);
    const endsOn = clean(pilot.ends_on ?? body.pilot_ends_on, 10);
    const success = cleanText(pilot.success ?? body.pilot_success, LIMITS.notes);
    if (!isDay(startsOn) || !isDay(endsOn) || !success)
      throw new Refused(
        400,
        "invalid",
        "A pilot needs the day it starts, the day it ends and what success looks like.",
      );
    if (endsOn < startsOn) throw new Refused(400, "invalid", "The pilot ends before it starts.");
    move.pilot = { starts_on: startsOn, ends_on: endsOn, success };
  }
  if (stage === "dropped") {
    const dropped = record(body.dropped);
    const reason = clean(dropped.reason ?? body.reason, 40);
    if (!(reason in DROP_REASONS))
      throw new Refused(400, "needs_reason", "Say why it was dropped.");
    const lookAgain = clean(dropped.look_again_on ?? body.look_again_on, 10);
    if (lookAgain && !isDay(lookAgain)) throw new Refused(400, "invalid", "That is not a day.");
    move.dropped = { reason, look_again_on: lookAgain || null };
  }
  return move;
}

/** Move a firm: the entry changes, and each change is an event. */
export function applyMove(
  book: Book,
  entry: WaitlistEntry,
  move: StageMove,
  by: Staff,
  at: string,
  today: string,
): WaitlistEntry {
  if (move.from && move.from !== entry.stage)
    throw new Refused(
      409,
      "stage_changed",
      `It was moved to ${WAITLIST_STAGES[entry.stage].label} just now; look again before moving it.`,
    );
  if (move.stage === entry.stage)
    throw new Refused(409, "same_stage", `It is at ${WAITLIST_STAGES[entry.stage].label} already.`);
  const from = entry.stage;
  const before = { next_step: entry.next_step, next_step_on: entry.next_step_on };
  entry.stage = move.stage;
  entry.stage_since = today;
  entry.next_step = move.next_step;
  entry.next_step_on = move.next_step_on;
  if (move.stage === "call_booked") entry.call_at = move.call_at;
  if (move.stage === "pilot") entry.pilot = move.pilot;
  entry.dropped = move.stage === "dropped" ? move.dropped : null;
  entry.updated_at = at;
  book.save();
  book.log({
    entry_id: entry.entry_id,
    kind: "stage",
    at,
    by,
    from,
    to: move.stage,
    text:
      move.stage === "dropped" && move.dropped
        ? DROP_REASONS[move.dropped.reason as keyof typeof DROP_REASONS]
        : "",
  });
  if (move.notes)
    book.log({ entry_id: entry.entry_id, kind: "call", at, by, text: move.notes, when: at });
  if (before.next_step !== entry.next_step || before.next_step_on !== entry.next_step_on)
    book.log({
      entry_id: entry.entry_id,
      kind: "next_step",
      at,
      by,
      text: nextStepWords(entry.next_step, entry.next_step_on),
    });
  return entry;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "10 Nov 2026": a calendar day in words, never shifted into a zone. */
export function dayWords(day: string): string {
  const [year = "", month = "", date = ""] = day.split("-");
  return `${Number(date)} ${MONTHS[Number(month) - 1] ?? ""} ${year}`.trim();
}

export function nextStepWords(step: string, on: string | null): string {
  if (!step) return "No next step";
  return on ? `${step}, by ${dayWords(on)}` : step;
}

const zero = (): Record<WaitlistStage, number> =>
  Object.fromEntries(WAITLIST_STAGE_ORDER.map((stage) => [stage, 0])) as Record<
    WaitlistStage,
    number
  >;

/** Where each firm's last move left it, counted by stage (read from the events alone). */
export function nowAt(events: readonly WaitlistEvent[]): Record<WaitlistStage, number> {
  const last = new Map<string, WaitlistStage>();
  for (const event of events)
    if (event.kind === "stage" && event.to) last.set(event.entry_id, event.to);
  const counts = zero();
  for (const stage of last.values()) counts[stage] += 1;
  return counts;
}

/** How many firms were ever moved to each stage, at any time (each firm once per stage). */
export function everReached(events: readonly WaitlistEvent[]): Record<WaitlistStage, number> {
  const seen = new Map<WaitlistStage, Set<string>>();
  for (const event of events) {
    if (event.kind !== "stage" || !event.to) continue;
    const firms = seen.get(event.to) ?? new Set<string>();
    firms.add(event.entry_id);
    seen.set(event.to, firms);
  }
  const counts = zero();
  for (const [stage, firms] of seen) counts[stage] = firms.size;
  return counts;
}
