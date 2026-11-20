/**
 * A finding's fix-by day and its words, and when the next penetration test is due
 * (ws-notes/security/spec.md §5.4, §8.5). Pure: the day, the windows and the customers'
 * duties in force are given. The day is `fixByOf` of the contract (his windows, made
 * earlier by a duty in force that covers the source and the severity); his own day
 * overrides it with a reason, and says so when it is later than a customer's contract
 * allows. In Due from 7 days before.
 */

import { addMonths } from "../company-contracts";
import { addDays, daysBetween } from "../days";
import {
  FIX_WINDOWS_DEFAULT,
  fixByOf,
  flowdownOf,
  inDue,
  type FixWindows,
  type FlowdownInForce,
  type FlowdownKey,
  type Regime,
} from "../security-contracts";
import { dayWords } from "../../../src/lib/data/labels-company";
import { PRACTICES, SEVERITIES } from "../../../src/lib/data/labels-controls";
import { STILL_OPEN_ON_HOST, lateWords, lowerFirst } from "../../../src/lib/data/labels-assurance";
import { AHEAD } from "./limits";
import type { Finding, PenTest, Setup } from "./types";

/** His windows where he set one, HQ's default for the rest. */
export function windowsOf(setup: Pick<Setup, "windows">): FixWindows {
  const windows = { ...FIX_WINDOWS_DEFAULT };
  for (const severity of SEVERITIES) {
    const mine = setup.windows[severity];
    if (typeof mine === "number" && Number.isInteger(mine) && mine > 0) windows[severity] = mine;
  }
  return windows;
}

export type Because = {
  entry_id: string;
  firm: string;
  key: FlowdownKey;
  regime: Regime;
  /** "Shorter because of Walk Capital's contract: high-severity missing patches fixed within 1 week." */
  words: string;
};

export type FixState = "due" | "overdue" | "fixed" | "fixed_late" | "accepted" | "dismissed";

export type FixView = {
  /** The day that counts: his own when he moved it, else the worked-out day. */
  fix_by: string;
  /** The windows' day, made earlier by a customer's duty where one applies. */
  worked_out: string;
  because: Because | null;
  own: { on: string; why: string } | null;
  /** In Due from this day while the finding is open. */
  due_from: string;
  state: FixState;
  /** "Fix by 20 Dec 2026", "Overdue since 20 Dec 2026", "Fixed 3 days after its fix-by day". */
  words: string;
  /** The lines under it: why it is shorter, that he moved it, that it is later than a contract allows. */
  lines: string[];
};

export const becauseWords = (firm: string, key: FlowdownKey): string =>
  `Shorter because of ${firm}'s contract: ${lowerFirst(flowdownOf(key).words)}.`;

export function fixViewOf(
  finding: Pick<
    Finding,
    "found_on" | "severity" | "source" | "status" | "fixed_on" | "own_fix_by" | "dependabot"
  >,
  windows: FixWindows,
  inForce: readonly FlowdownInForce[],
  today: string,
): FixView {
  const worked = fixByOf({
    found_on: finding.found_on,
    severity: finding.severity,
    source: finding.source,
    windows,
    in_force: inForce,
  });
  const because: Because | null = worked.because
    ? {
        ...worked.because,
        regime: flowdownOf(worked.because.key).regime,
        words: becauseWords(worked.because.firm, worked.because.key),
      }
    : null;
  const own = finding.own_fix_by ? { ...finding.own_fix_by } : null;
  const fixBy = own?.on ?? worked.fix_by;
  const lines: string[] = [];
  if (because) lines.push(because.words);
  if (own) {
    lines.push(`Moved to ${dayWords(own.on)}: ${own.why}`);
    if (because && own.on > worked.fix_by)
      lines.push(`Later than ${because.firm}'s contract allows (${dayWords(worked.fix_by)}).`);
  }
  let state: FixState;
  let words: string;
  if (finding.status === "fixed") {
    const on = finding.fixed_on ?? fixBy;
    const late = daysBetween(fixBy, on);
    state = late > 0 ? "fixed_late" : "fixed";
    words = late > 0 ? `Fixed ${lateWords(late)} after its fix-by day` : `Fixed ${dayWords(on)}`;
  } else if (finding.status === "accepted") {
    state = "accepted";
    words = "Risk accepted";
    if (finding.dependabot?.state === "open") lines.push(STILL_OPEN_ON_HOST);
  } else if (finding.status === "dismissed") {
    state = "dismissed";
    words = "Dismissed";
  } else if (fixBy < today) {
    state = "overdue";
    words = `Overdue since ${dayWords(fixBy)}`;
  } else {
    state = "due";
    words = `Fix by ${dayWords(fixBy)}`;
  }
  return {
    fix_by: fixBy,
    worked_out: worked.fix_by,
    because,
    own,
    due_from: addDays(fixBy, -AHEAD.finding),
    state,
    words,
    lines,
  };
}

/** Whether an open finding is in Due on `today`. */
export const findingInDue = (fix: FixView, today: string): boolean =>
  (fix.state === "due" || fix.state === "overdue") && inDue(fix.fix_by, today, AHEAD.finding);

// ------------------------------------------------------------------ the next penetration test

export type PenTestNext = {
  /** Null when no test has a report yet. */
  next_on: string | null;
  /** "Last report 2 Oct 2026 by Walk Testers", "A large change on 5 Jan 2027: …", or why none. */
  why: string;
  /** His months, or HQ's 12. */
  months: number;
  /** The test with the latest report, when there is one. */
  latest: PenTest | null;
  /** The large change that brought it forward, when one did. */
  change: { on: string; what: string } | null;
};

export const penTestMonths = (setup: Pick<Setup, "pen_test_months">): number =>
  setup.pen_test_months ?? PRACTICES.pen_test.amount;

/**
 * `addMonths(latest report day, months)`, or the day of a large change recorded after the
 * latest report (that day, so at once). No test with a report: no day.
 */
export function penTestNextOf(penTests: readonly PenTest[], months: number): PenTestNext {
  const reported = penTests
    .filter((test): test is PenTest & { report_on: string } => test.report_on !== null)
    .sort(
      (a, b) => b.report_on.localeCompare(a.report_on) || b.created_at.localeCompare(a.created_at),
    );
  const latest = reported[0] ?? null;
  if (!latest)
    return {
      next_on: null,
      why: penTests.length ? "No report is recorded yet." : "No penetration test recorded.",
      months,
      latest: null,
      change: null,
    };
  const change =
    penTests
      .map((test) => test.large_change)
      .filter((item): item is { on: string; what: string } => item !== null)
      .filter((item) => item.on > latest.report_on)
      .sort((a, b) => a.on.localeCompare(b.on))[0] ?? null;
  const yearly = addMonths(latest.report_on, months);
  if (change && change.on <= yearly)
    return {
      next_on: change.on,
      why: `A large change on ${dayWords(change.on)}: ${change.what}`,
      months,
      latest,
      change: { ...change },
    };
  return {
    next_on: yearly,
    why: `Last report ${dayWords(latest.report_on)} by ${latest.tester}`,
    months,
    latest,
    change: null,
  };
}

/** The next test is in Due from 30 days before; a retest planned and not done from 7. */
export const penTestInDue = (next: PenTestNext, today: string): boolean =>
  next.next_on !== null && inDue(next.next_on, today, AHEAD.pen_test);

export const retestInDue = (test: PenTest, today: string): boolean =>
  test.retest.planned_on !== null &&
  test.retest.done_on === null &&
  inDue(test.retest.planned_on, today, AHEAD.retest);

/** Whether a test's report is older than his months on `today`. */
export const reportOlderThan = (reportOn: string, months: number, today: string): boolean =>
  addMonths(reportOn, months) < today;
