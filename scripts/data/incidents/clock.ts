/**
 * The incident's clocks (ws-notes/duties/spec.md §5.2, §6.3), pure: CERT-In's report by the
 * rule's hours after noticing a listed incident; the Data Protection Board's detailed report
 * for personal data, from the rule's start day; and each customer's contractual hours. All
 * instants, shown in IST by a fixed offset, never through this Mac's zone. Nothing here
 * reads the clock: `now` is passed in.
 */

import { ruleLineOf, type DutyRuleState } from "../duties-contracts";
import { addHours, istWords, minutesBetween, spanWords } from "../../../src/lib/data/labels-duties";
import { isListed } from "./kinds";
import type { BoardClock, CertInClock, Clock, CustomerClock, Incident } from "./types";

/** "6 hours", "1 hour". */
export const hoursWords = (hours: number): string =>
  `${hours.toLocaleString("en")} ${hours === 1 ? "hour" : "hours"}`;

/** "with 10 minutes to spare" or "30 minutes after the 6 hours". */
export function marginWords(deadline: string, sentAt: string, hours: number): string {
  return sentAt <= deadline
    ? `with ${spanWords(minutesBetween(sentAt, deadline))} to spare`
    : `${spanWords(minutesBetween(deadline, sentAt))} after the ${hoursWords(hours)}`;
}

/** "4 hours 40 minutes left" while it runs; "1 hour 5 minutes ago" once it has passed. */
export function leftWords(deadline: string, now: string): string {
  return now > deadline
    ? `${spanWords(minutesBetween(deadline, now))} ago`
    : `${spanWords(minutesBetween(now, deadline))} left`;
}

/** The rule's hours, when days may be worked out with it; null otherwise. */
function hoursOf(state: DutyRuleState | null): number | null {
  return state && state.usable && state.amount !== null && state.unit === "hours"
    ? state.amount
    : null;
}

/** CERT-In's deadline for an incident: noticed plus the rule's hours. Null when none runs. */
export function certInReportBy(incident: Incident, state: DutyRuleState | null): string | null {
  const hours = hoursOf(state);
  return isListed(incident.kind) && hours !== null ? addHours(incident.aware_at, hours) : null;
}

export function certInClock(
  incident: Incident,
  state: DutyRuleState | null,
  now: string,
): CertInClock {
  if (!isListed(incident.kind)) return { state: "not_listed" };
  const decided = incident.cert_in.not_reportable;
  if (decided && !incident.cert_in.report) return { state: "not_reportable", ...decided };
  const hours = hoursOf(state);
  if (hours === null) return { state: "no_rule" };
  const reportBy = addHours(incident.aware_at, hours);
  const report = incident.cert_in.report;
  if (report)
    return {
      state: "reported",
      report_by: reportBy,
      sent_at: report.sent_at,
      sent_words: istWords(report.sent_at),
      margin_words: marginWords(reportBy, report.sent_at, hours),
    };
  if (now > reportBy)
    return {
      state: "overdue",
      report_by: reportBy,
      report_by_words: istWords(reportBy),
      minutes_late: minutesBetween(reportBy, now),
      words: leftWords(reportBy, now),
    };
  return {
    state: "due",
    report_by: reportBy,
    report_by_words: istWords(reportBy),
    minutes_left: minutesBetween(now, reportBy),
    words: leftWords(reportBy, now),
  };
}

/**
 * The Board's clock. `state` is the rule's state on the day the incident was noticed (IST),
 * so an incident noticed before the rule's start day never gets one.
 */
export function boardClock(
  incident: Incident,
  state: DutyRuleState | null,
  startsOn: string | null,
  now: string,
): BoardClock {
  if (!incident.personal_data) return { state: "no_personal_data" };
  if (!state) return { state: "no_rule" };
  if (state.not_yet && startsOn) return { state: "not_in_force", starts_on: startsOn };
  const hours = hoursOf(state);
  if (hours === null) return { state: "no_rule" };
  const reportBy = addHours(incident.aware_at, hours);
  const report = incident.board.report;
  if (report)
    return {
      state: "reported",
      report_by: reportBy,
      report_by_words: istWords(reportBy),
      words: marginWords(reportBy, report.sent_at, hours),
    };
  return {
    state: now > reportBy ? "overdue" : "due",
    report_by: reportBy,
    report_by_words: istWords(reportBy),
    words: leftWords(reportBy, now),
  };
}

/** Each customer not withdrawn: tell them by their contract's hours after noticing it. */
export function customerClocks(incident: Incident, now: string): CustomerClock[] {
  return incident.customers
    .filter((row) => !row.withdrawn)
    .map((row) => {
      const tellBy = addHours(incident.aware_at, row.hours);
      if (row.told_at)
        return {
          row_id: row.row_id,
          tell_by: tellBy,
          tell_by_words: istWords(tellBy),
          state: "told" as const,
          words: marginWords(tellBy, row.told_at, row.hours),
        };
      return {
        row_id: row.row_id,
        tell_by: tellBy,
        tell_by_words: istWords(tellBy),
        state: now > tellBy ? ("overdue" as const) : ("due" as const),
        words: leftWords(tellBy, now),
      };
    });
}

export function clockOf(
  incident: Incident,
  rules: {
    certIn: DutyRuleState | null;
    board: DutyRuleState | null;
    boardStartsOn: string | null;
  },
  now: string,
): Clock {
  return {
    cert_in: certInClock(incident, rules.certIn, now),
    board: boardClock(incident, rules.board, rules.boardStartsOn, now),
    customers: customerClocks(incident, now),
    rules: {
      cert_in: rules.certIn ? ruleLineOf(rules.certIn) : null,
      board: rules.board && incident.personal_data ? ruleLineOf(rules.board) : null,
    },
  };
}
