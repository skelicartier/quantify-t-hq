/**
 * A mark's dates (ws-notes/duties/spec.md §5.2), pure: each is the base day moved by its
 * rule's months (years × 12), "before" moving back; the hearing is its own day. A refused,
 * abandoned, withdrawn or removed mark ends every clock except restoration after removal. A
 * renewal records a new expiry, and the last four clocks restart from it. Nothing is worked
 * out from a rule the rule book cannot answer here.
 */

import { addMonths } from "../company-contracts";
import { dutyDue, ruleLineOf, type DutyRuleKey, type DutyRuleState } from "../duties-contracts";
import { minorWords } from "../../../src/lib/data/labels-duties";
import {
  DEAD_MARK_STATUSES,
  MARK_CLOCKS,
  type MarkClockKey,
} from "../../../src/lib/data/labels-security";
import type { Mark, MarkClock } from "./types";

export type StateOf = (key: DutyRuleKey) => DutyRuleState | null;

export const isDead = (mark: Pick<Mark, "status">): boolean =>
  DEAD_MARK_STATUSES.includes(mark.status);

/** That many months (or years) before a day, by the rule's unit; null when not usable. */
export function dueBefore(state: DutyRuleState | null, day: string): string | null {
  if (!state || !state.usable || state.amount === null) return null;
  if (state.unit === "months") return addMonths(day, -state.amount);
  if (state.unit === "years") return addMonths(day, -state.amount * 12);
  return null;
}

/**
 * The registration's expiry now: the latest renewal's, else the certificate's, else worked
 * out from the application day by `tm-term`.
 */
export function currentExpiry(
  mark: Mark,
  term: DutyRuleState | null,
): { on: string | null; worked: boolean } {
  const renewal = mark.renewals[mark.renewals.length - 1];
  if (renewal) return { on: renewal.expires_on, worked: false };
  if (mark.steps.expires_on) return { on: mark.steps.expires_on, worked: false };
  if (mark.applied_on && term) return { on: dutyDue(term, mark.applied_on), worked: true };
  return { on: null, worked: false };
}

export function clocksOf(mark: Mark, stateOf: StateOf, today: string): MarkClock[] {
  const dead = isDead(mark);
  const steps = mark.steps;
  const clocks: MarkClock[] = [];
  const add = (
    key: MarkClockKey,
    base: string | null,
    due: string | null,
    done: boolean,
    ruleKey: DutyRuleKey | null,
    alive = !dead,
  ) => {
    const state = ruleKey ? stateOf(ruleKey) : null;
    clocks.push({
      key,
      title: MARK_CLOCKS[key].label,
      base_on: base,
      due_on: due,
      done,
      open: alive && !done,
      rule: state ? ruleLineOf(state) : null,
    });
  };
  const within = (key: DutyRuleKey, base: string) => {
    const state = stateOf(key);
    return state ? dutyDue(state, base) : null;
  };

  if (steps.deficiency_notice_on)
    add(
      "deficiency",
      steps.deficiency_notice_on,
      within("tm-deficiency", steps.deficiency_notice_on),
      steps.deficiency_fixed_on !== null,
      "tm-deficiency",
    );
  if (steps.exam_report_on)
    add(
      "exam_reply",
      steps.exam_report_on,
      within("tm-exam-reply", steps.exam_report_on),
      steps.exam_reply_on !== null,
      "tm-exam-reply",
    );
  if (steps.hearing_on) add("hearing", null, steps.hearing_on, steps.hearing_on < today, null);
  if (steps.journal_on) {
    const closes = within("tm-opposition", steps.journal_on);
    add("opposition", steps.journal_on, closes, closes !== null && closes < today, "tm-opposition");
  }
  if (steps.opposition_notice_on)
    add(
      "counter_statement",
      steps.opposition_notice_on,
      within("tm-counter-statement", steps.opposition_notice_on),
      steps.counter_statement_on !== null,
      "tm-counter-statement",
    );

  const expiry = currentExpiry(mark, stateOf("tm-term"));
  if (expiry.on) {
    const base = mark.renewals[mark.renewals.length - 1]?.renewed_on ?? mark.applied_on;
    add("expiry", base, expiry.on, false, expiry.worked ? "tm-term" : null);
    add(
      "renewal_opens",
      expiry.on,
      dueBefore(stateOf("tm-renewal-opens"), expiry.on),
      false,
      "tm-renewal-opens",
    );
    const late = within("tm-surcharge", expiry.on);
    add(
      "late_renewal_ends",
      expiry.on,
      late,
      false,
      "tm-surcharge",
      !dead && today > expiry.on && (late === null || late >= today),
    );
    add(
      "restoration_ends",
      expiry.on,
      within("tm-restoration", expiry.on),
      false,
      "tm-restoration",
      mark.status === "removed",
    );
  }
  return clocks;
}

/** "Reply by 3 Jan 2027": the earliest open clock with a day, or null for none. */
export function nextClock(clocks: readonly MarkClock[]): MarkClock | null {
  return (
    clocks
      .filter((clock) => clock.open && clock.due_on !== null && clock.key !== "expiry")
      .sort((a, b) => (a.due_on ?? "").localeCompare(b.due_on ?? ""))[0] ?? null
  );
}

/**
 * The fee check (§5.2): with `tm-fee-startup` usable, a startup's fee for one class against
 * what was paid. Null words while the rule is not usable: both readings print instead.
 */
export function feeCheck(
  mark: Pick<Mark, "filed_as_startup" | "fee_paid">,
  state: DutyRuleState | null,
): { words: string | null } | null {
  if (mark.filed_as_startup !== "yes" || mark.fee_paid === null) return null;
  if (!state || !state.usable || state.amount === null) return { words: null };
  const fee = state.amount;
  const paid = mark.fee_paid;
  if (paid === fee) return { words: "The startup fee for 1 class." };
  const gap = minorWords(Math.abs(paid - fee) * 100, "INR");
  return {
    words:
      paid > fee
        ? `${gap} more than the startup fee for 1 class. Confirm with your trademark agent.`
        : `${gap} less than the startup fee for 1 class. Confirm with your trademark agent.`,
  };
}
