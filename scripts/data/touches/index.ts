/**
 * Touches by hand (ws-notes/company/spec.md §8): connection requests, messages, calls and
 * meetings made outside email, logged on a lead or an investor firm, with the week's count of
 * connection requests, a line above about 100 a week, and a warning when fewer than 1 in 5
 * requests in the last four weeks were accepted. Neither blocks anything; nothing here is
 * automated or sent, and the network is never named.
 *
 * One line per touch in `touches/touches.jsonl`; taking one back (or restoring it) is a
 * second line `{touch_id, withdrawn}`, applied on read. No Due, agenda, search or "Used for".
 */

import { randomUUID } from "node:crypto";

import { Refused } from "../../mail-merge/engine";
import type { DataCore } from "../core";
import { addDays } from "../days";
import { clean, cleanText, isDay, wholeNumber } from "../guard";
import type { LeadsService } from "../leads/contracts";
import type { Staff } from "../protocol";
import { RAISE_SERVICES, mondayOf, type InvestorsRaise } from "../raise-contracts";
import {
  TOUCH_ACCEPT_FLOOR,
  TOUCH_ACCEPT_WARNING,
  TOUCH_CEILING,
  TOUCH_CEILING_WARNING,
  TOUCH_KINDS,
} from "../../../src/lib/data/labels-people";
import {
  ACCEPT_WINDOW_DAYS,
  SUBJECT_ID,
  TOUCHES_PAGE,
  TOUCH_LIMITS,
  TOUCH_TOTAL,
  TOUCH_WEEKS,
} from "./limits";
import type { Touch, TouchKind, TouchSubject, TouchWeek } from "./types";

const TOUCHES = "touches/touches.jsonl";
const NO_SUBJECT = "Say who the touch was with.";

const isKind = (value: string): value is TouchKind => value in TOUCH_KINDS;
const isLive = (touch: Touch): boolean => touch.withdrawn === null;

/** Newest first: by the day, then by when it was logged. */
const byOn = (a: Touch, b: Touch): number => b.on.localeCompare(a.on) || b.at.localeCompare(a.at);

/** The lead's or the firm's own page. */
export const subjectHref = (subject: Pick<TouchSubject, "kind" | "id">): string =>
  subject.kind === "lead" ? `/data/leads/${subject.id}` : `/data/investors/${subject.id}`;

/**
 * The counts, over every live touch: the last eight weeks (Monday to Sunday, newest first),
 * this week's requests and messages, the last 28 days' requests and acceptances, and the two
 * warnings. Today is this Mac's day.
 */
export function touchSummary(touches: readonly Touch[], today: string) {
  const live = touches.filter(isLive);
  const monday = mondayOf(today);
  const weeks: TouchWeek[] = [];
  for (let index = 0; index < TOUCH_WEEKS; index += 1) {
    const from = addDays(monday, -7 * index);
    const to = addDays(from, 6);
    const week: TouchWeek = { week_from: from, requests: 0, accepted: 0, messages: 0, other: 0 };
    for (const touch of live) {
      if (touch.on < from || touch.on > to) continue;
      if (touch.kind === "request") week.requests += 1;
      else if (touch.kind === "accepted") week.accepted += 1;
      else if (touch.kind === "message") week.messages += 1;
      else week.other += 1;
    }
    weeks.push(week);
  }
  const thisWeek = weeks[0]!;
  const since = addDays(today, -(ACCEPT_WINDOW_DAYS - 1));
  const recent = live.filter((touch) => touch.on >= since && touch.on <= today);
  const four_weeks = {
    requests: recent.filter((touch) => touch.kind === "request").length,
    accepted: recent.filter((touch) => touch.kind === "accepted").length,
  };
  const warnings: string[] = [];
  if (thisWeek.requests > TOUCH_CEILING) warnings.push(TOUCH_CEILING_WARNING);
  if (four_weeks.requests >= TOUCH_ACCEPT_FLOOR && four_weeks.accepted * 5 < four_weeks.requests)
    warnings.push(TOUCH_ACCEPT_WARNING);
  return {
    weeks,
    this_week: { from: monday, requests: thisWeek.requests, messages: thisWeek.messages },
    four_weeks,
    warnings,
  };
}

export async function register(core: DataCore): Promise<void> {
  core.store.ensureDir("touches");
  const touches: Touch[] = [];
  const byId = new Map<string, Touch>();
  for (const line of core.store.readLines<Record<string, unknown>>(TOUCHES)) {
    if (!line || typeof line.touch_id !== "string") continue;
    const known = byId.get(line.touch_id);
    if (known) {
      if ("withdrawn" in line) known.withdrawn = (line.withdrawn as Touch["withdrawn"]) ?? null;
      continue;
    }
    const touch = line as unknown as Touch;
    if (!touch.subject || !isDay(touch.on) || !isKind(String(touch.kind))) continue;
    touch.withdrawn = touch.withdrawn ?? null;
    touches.push(touch);
    byId.set(touch.touch_id, touch);
  }

  const touchOr404 = (id: string | undefined): Touch => {
    const touch = id ? byId.get(id) : undefined;
    if (!touch) throw new Refused(404, "not_found", "That touch is not here.");
    return touch;
  };

  /**
   * Who the touch was with. A lead is checked against All leads, and an investor firm
   * against the investors module, when each is loaded; each one's own name is kept.
   */
  function subjectOf(body: Record<string, unknown>): TouchSubject {
    const kind = clean(body.subject_kind, 20);
    const id = clean(body.subject_id, 64).toLowerCase();
    if ((kind !== "lead" && kind !== "investor") || !SUBJECT_ID.test(id))
      throw new Refused(400, "invalid", NO_SUBJECT);
    let name = cleanText(body.subject_name, TOUCH_LIMITS.subject_name);
    if (kind === "lead") {
      const leads = core.need<LeadsService>("leads");
      if (leads) {
        const lead = leads.detail(id) as { name?: unknown; email?: unknown } | null;
        if (!lead) throw new Refused(404, "not_found", "That lead is not here.");
        const own = [lead.name, lead.email].find((value) => typeof value === "string" && value);
        if (typeof own === "string") name = own.slice(0, TOUCH_LIMITS.subject_name);
      }
    } else {
      const raise = core.need<InvestorsRaise>(RAISE_SERVICES.investorsRaise);
      if (raise) {
        const real = raise.name(id);
        if (real === null) throw new Refused(404, "not_found", "That firm is not here.");
        name = real.slice(0, TOUCH_LIMITS.subject_name);
      }
    }
    if (!name) throw new Refused(400, "invalid", NO_SUBJECT);
    return { kind, id, name };
  }

  const rowOf = (touch: Touch) => ({ ...touch, href: subjectHref(touch.subject) });

  core.route("GET", "/data/touches", (ctx) => {
    const today = core.day();
    const subjectKind = clean(ctx.query.get("subject_kind"), 20);
    const subjectId = clean(ctx.query.get("subject_id"), 64).toLowerCase();
    const kind = clean(ctx.query.get("kind"), 20);
    const offset = Math.min(200_000, Math.max(0, wholeNumber(ctx.query.get("offset"), 0)));
    const chosen = touches
      .filter(
        (touch) =>
          (!subjectKind || touch.subject.kind === subjectKind) &&
          (!subjectId || touch.subject.id === subjectId),
      )
      .sort(byOn);
    const counts: Record<string, number> = { all: chosen.length };
    for (const key of Object.keys(TOUCH_KINDS)) counts[key] = 0;
    for (const touch of chosen) counts[touch.kind] = (counts[touch.kind] ?? 0) + 1;
    const shown = isKind(kind) ? chosen.filter((touch) => touch.kind === kind) : chosen;
    return {
      touches: shown.slice(offset, offset + TOUCHES_PAGE).map(rowOf),
      total: shown.length,
      offset,
      limit: TOUCHES_PAGE,
      counts,
      ...touchSummary(touches, today),
      today,
    };
  });

  core.route("POST", "/data/touches", (ctx) => {
    const by: Staff = ctx.staff();
    const today = core.day();
    if (touches.length >= TOUCH_TOTAL)
      throw new Refused(
        400,
        "invalid",
        `Data holds ${TOUCH_TOTAL.toLocaleString("en-GB")} at most.`,
      );
    const subject = subjectOf(ctx.body);
    const on = clean(ctx.body.on, 10) || today;
    if (!isDay(on)) throw new Refused(400, "invalid", "That is not a day.");
    if (on > today) throw new Refused(400, "invalid", "That day is in the future.");
    const kind = clean(ctx.body.kind, 20);
    if (!isKind(kind)) throw new Refused(400, "invalid", "Choose the kind of touch.");
    const touch: Touch = {
      touch_id: randomUUID(),
      subject,
      on,
      kind,
      note: cleanText(ctx.body.note, TOUCH_LIMITS.note),
      at: core.now(),
      by,
      withdrawn: null,
    };
    touches.push(touch);
    byId.set(touch.touch_id, touch);
    core.store.appendLine(TOUCHES, touch);
    return { touch: rowOf(touch) };
  });

  core.route("POST", "/data/touches/:id/withdraw", (ctx) => {
    const by = ctx.staff();
    const touch = touchOr404(ctx.params[0]);
    if (touch.withdrawn) throw new Refused(409, "withdrawn", "That touch is withdrawn already.");
    touch.withdrawn = { at: core.now(), by };
    core.store.appendLine(TOUCHES, { touch_id: touch.touch_id, withdrawn: touch.withdrawn });
    return { touch: rowOf(touch) };
  });

  core.route("POST", "/data/touches/:id/restore", (ctx) => {
    ctx.staff();
    const touch = touchOr404(ctx.params[0]);
    if (!touch.withdrawn) throw new Refused(409, "not_withdrawn", "That touch is not withdrawn.");
    touch.withdrawn = null;
    core.store.appendLine(TOUCHES, { touch_id: touch.touch_id, withdrawn: null });
    return { touch: rowOf(touch) };
  });
}
