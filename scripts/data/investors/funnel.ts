/**
 * The raise's funnel (raise spec §5.5), as plain counts of firms on the page: per forward
 * stage, the firms there now, the firms that reached it or went past it, and what that is
 * out of; days since the first send; first meetings this week; amounts per state per
 * currency, never added across currencies; pass reasons; time in stage with the 14-day
 * stale rule; and the same counts by wave and by introduction. There is no target, no
 * share and no per cent sign anywhere in it. Pure: today and the first send are passed in.
 */

import { daysBetween, localDay } from "../days";
import {
  FORWARD_STAGES,
  mondayOf,
  type ForwardStage,
  type FunnelSplit,
  type FunnelSummary,
} from "../raise-contracts";
import { PASS_REASONS, STALE_DAYS } from "../../../src/lib/data/labels";
import type { AmountState, Currency, InvestorStage, PassReason } from "./types";

export type FunnelFirm = {
  investor_id: string;
  firm: string;
  stage: InvestorStage;
  stage_since: string;
  next_step: string;
  next_step_on: string | null;
  passed_reason: PassReason | "";
  wave: string;
  warm: boolean;
  latest: { state: AmountState; amount: number; currency: Currency } | null;
  /** Every stage the firm was moved to, with when: the `seeded`, `written` and `stage` events' `to`. */
  moves: { to: InvestorStage; at: string }[];
};

/** Written to 1 … Money in 8; Not written to yet 0; the exits have no place. */
const PLACE: Partial<Record<InvestorStage, number>> = { not_written: 0 };
FORWARD_STAGES.forEach((stage, index) => {
  PLACE[stage] = index + 1;
});
const placeOf = (stage: string): number => PLACE[stage as InvestorStage] ?? 0;
const MEETING = placeOf("meeting");
const SOFT = placeOf("soft");

const EXITS = ["set_aside", "passed", "do_not_pitch"] as const;
/** The stages time in stage is counted for: Written to through Signed. */
const WAITING: readonly ForwardStage[] = FORWARD_STAGES.filter((stage) => stage !== "money_in");
const STALE_ROWS = 50;
const AMOUNT_ORDER: readonly AmountState[] = ["asked", "soft", "signed", "money_in"];

const byName = (a: string, b: string): number =>
  a.localeCompare(b, "en", { sensitivity: "base", numeric: true });

function furthestOf(firm: FunnelFirm): number {
  let best = placeOf(firm.stage);
  for (const move of firm.moves) best = Math.max(best, placeOf(move.to));
  return best;
}

/** This Mac's day of the firm's first meeting, or null when it has had none. */
function firstMeetingOf(firm: FunnelFirm): string | null {
  let first: string | null = null;
  for (const move of firm.moves)
    if (placeOf(move.to) >= MEETING && (first === null || move.at < first)) first = move.at;
  if (first !== null) return localDay(first);
  return placeOf(firm.stage) >= MEETING ? localDay(firm.stage_since) : null;
}

function splitOf(key: string, label: string, firms: readonly { furthest: number }[]): FunnelSplit {
  const reached = (place: number) => firms.filter((firm) => firm.furthest >= place).length;
  return {
    key,
    label,
    firms: firms.length,
    written: reached(placeOf("written")),
    replied: reached(placeOf("replied")),
    meeting: reached(MEETING),
    met: reached(placeOf("met")),
    soft_or_later: reached(SOFT),
  };
}

export function funnelOf(input: {
  firms: readonly FunnelFirm[];
  today: string;
  first_send_at: string | null;
}): FunnelSummary {
  const { today } = input;
  const weekFrom = mondayOf(today);
  const firms = input.firms.map((firm) => ({ ...firm, furthest: furthestOf(firm) }));

  const stages = FORWARD_STAGES.map((stage, index) => {
    const place = index + 1;
    return {
      stage,
      now: firms.filter((firm) => firm.stage === stage).length,
      reached: firms.filter((firm) => firm.furthest >= place).length,
      of: 0,
    };
  });
  stages.forEach((row, index) => {
    row.of = index === 0 ? firms.length : (stages[index - 1]?.reached ?? 0);
  });

  const meetingDays = firms
    .map(firstMeetingOf)
    .filter((day): day is string => day !== null)
    .sort();

  const money: FunnelSummary["money"] = {};
  for (const firm of firms) {
    if (!firm.latest) continue;
    const currency = (money[firm.latest.currency] ??= {});
    const sum = (currency[firm.latest.state] ??= { amount: 0, firms: 0 });
    sum.amount += firm.latest.amount;
    sum.firms += 1;
  }
  // In a steady order (Asked, Soft, Signed, Money in) so the answer reads the same each time.
  for (const [code, states] of Object.entries(money)) {
    const ordered: (typeof money)[string] = {};
    for (const state of AMOUNT_ORDER) if (states[state]) ordered[state] = states[state];
    money[code] = ordered;
  }

  const passedFirms = firms.filter((firm) => firm.stage === "passed");
  const reasons = new Map<string, number>();
  for (const firm of passedFirms) {
    const reason = firm.passed_reason ? PASS_REASONS[firm.passed_reason] : PASS_REASONS.none_given;
    reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  }

  const waited = firms
    .filter((firm) => (WAITING as readonly string[]).includes(firm.stage))
    .map((firm) => ({ firm, days: daysBetween(localDay(firm.stage_since), today) }));
  const stale = waited
    .filter((item) => item.days >= STALE_DAYS)
    .sort((a, b) => b.days - a.days || byName(a.firm.firm, b.firm.firm));

  const waves = [...new Set(firms.map((firm) => firm.wave).filter(Boolean))].sort(byName);
  const byWave = waves.map((wave) =>
    splitOf(
      wave,
      wave,
      firms.filter((firm) => firm.wave === wave),
    ),
  );
  const noWave = firms.filter((firm) => !firm.wave);
  if (noWave.length) byWave.push(splitOf("", "No wave", noWave));

  const firstSend = input.first_send_at ? localDay(input.first_send_at) : null;
  return {
    today,
    week_from: weekFrom,
    firms: firms.length,
    not_written: firms.filter((firm) => firm.stage === "not_written").length,
    first_send_on: firstSend,
    days_since_first_send: firstSend ? daysBetween(firstSend, today) : null,
    first_meetings_this_week: meetingDays.filter((day) => day >= weekFrom && day <= today).length,
    first_meeting_days: meetingDays,
    stages,
    exits: EXITS.map((stage) => ({
      stage,
      now: firms.filter((firm) => firm.stage === stage).length,
    })),
    money,
    passed: passedFirms.length,
    pass_reasons: [...reasons.entries()]
      .map(([reason, count]) => ({ reason, firms: count }))
      .sort((a, b) => b.firms - a.firms || byName(a.reason, b.reason)),
    stale_days: STALE_DAYS,
    time_in_stage: WAITING.map((stage) => {
      const here = waited.filter((item) => item.firm.stage === stage);
      return {
        stage,
        firms: here.length,
        stale: here.filter((item) => item.days >= STALE_DAYS).length,
        longest_days: here.reduce((most, item) => Math.max(most, item.days), 0),
      };
    }),
    stale: stale.slice(0, STALE_ROWS).map(({ firm, days }) => ({
      investor_id: firm.investor_id,
      firm: firm.firm,
      stage: firm.stage as ForwardStage,
      days,
      next_step: firm.next_step,
      next_step_on: firm.next_step_on,
    })),
    by_wave: byWave,
    by_intro: [
      splitOf(
        "warm",
        "Introduced",
        firms.filter((firm) => firm.warm),
      ),
      splitOf(
        "cold",
        "Not introduced",
        firms.filter((firm) => !firm.warm),
      ),
    ],
  };
}
