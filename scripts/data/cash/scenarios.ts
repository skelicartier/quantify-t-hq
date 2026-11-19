/**
 * Three scenarios, month by month for 24 months from the month after the opening day, in
 * rupees only (ws-notes/duties/spec.md §5.3, §7.6): Base, as he typed it; Hiring delayed,
 * every hire starting later by his number of months; Raise delayed six months, every raise
 * landing six months later. A forecast to think with, never a target. The scenarios never
 * read the people ledger. Integer arithmetic in paise; pure.
 */

import { addPeriods, periodOf } from "../duties-contracts";
import { periodWords } from "../../../src/lib/data/labels-duties";
import { CASH_DEFAULTS } from "./limits";
import type { CashEvent } from "./types";

export type ScenarioKey = "base" | "hiring_delayed" | "raise_delayed";

export type Scenario = {
  key: ScenarioKey;
  label: string;
  months: { period: string; closing_minor: number }[];
  cash_out: string | null;
  break_even: string | null;
  words: string;
  break_even_words: string;
};

export type ScenarioInput = {
  /** Rupees in paise, and the day the figure is true on. */
  opening: { minor: number; as_of: string };
  /** The monthly net burn, paise; 0 when none is known. */
  burn_minor: number;
  /** Money collected a month now, paise. */
  collections_minor: number;
  /** Per cent a month, at most one decimal. */
  growth: number;
  hire_delay_months: number;
  events: readonly CashEvent[];
};

export const SCENARIO_LABELS: Record<ScenarioKey, string> = {
  base: "Base",
  hiring_delayed: "Hiring delayed",
  raise_delayed: "Raise delayed six months",
};

export const NO_COLLECTIONS =
  "No money is collected from customers yet, so these numbers never reach break-even. The cash decides.";
export const NO_GROWTH =
  "Collections do not grow here, so these numbers never reach break-even. The cash decides.";

/** The next month's collections: `floor(c × (10000 + round(rate × 100)) / 10000)` in paise. */
export function grown(collections: number, growth: number): number {
  return Math.floor((collections * (10_000 + Math.round(growth * 100))) / 10_000);
}

function run(input: ScenarioInput, key: ScenarioKey): Scenario {
  const start = addPeriods(periodOf(input.opening.as_of), 1);
  const shift = (event: CashEvent): string => {
    if (key === "hiring_delayed" && event.kind === "monthly_cost" && event.flagged)
      return addPeriods(event.period, input.hire_delay_months);
    if (key === "raise_delayed" && event.kind === "money_in" && event.flagged)
      return addPeriods(event.period, CASH_DEFAULTS.raise_delay_months);
    return event.period;
  };
  const events = input.events.map((event) => ({ ...event, period: shift(event) }));
  const gross = input.burn_minor + input.collections_minor;
  let cash = input.opening.minor;
  let collected = input.collections_minor;
  const months: Scenario["months"] = [];
  let cashOut: string | null = null;
  let breakEven: string | null = null;
  for (let index = 0; index < CASH_DEFAULTS.months; index += 1) {
    const period = addPeriods(start, index);
    if (index > 0) collected = grown(collected, input.growth);
    const costs = events
      .filter((event) => event.kind === "monthly_cost" && event.period <= period)
      .reduce((sum, event) => sum + event.amount_minor, 0);
    const landing = events
      .filter((event) => event.kind === "money_in" && event.period === period)
      .reduce((sum, event) => sum + event.amount_minor, 0);
    cash = cash - gross - costs + collected + landing;
    months.push({ period, closing_minor: cash });
    if (cashOut === null && cash < 0) cashOut = period;
    if (breakEven === null && collected > 0 && input.growth > 0 && collected >= gross + costs)
      breakEven = period;
  }
  const breakEvenWords =
    input.collections_minor === 0
      ? NO_COLLECTIONS
      : input.growth === 0
        ? NO_GROWTH
        : breakEven
          ? `Collections reach the month's costs in ${periodWords(breakEven)}.`
          : `Collections do not reach the month's costs in ${CASH_DEFAULTS.months} months.`;
  return {
    key,
    label: SCENARIO_LABELS[key],
    months,
    cash_out: cashOut,
    break_even: breakEven,
    words: cashOut
      ? `Cash runs out in ${periodWords(cashOut)}.`
      : `No cash-out in ${CASH_DEFAULTS.months} months.`,
    break_even_words: breakEvenWords,
  };
}

/** The three scenarios, in their fixed order. */
export function scenariosOf(input: ScenarioInput): Scenario[] {
  return (["base", "hiring_delayed", "raise_delayed"] as const).map((key) => run(input, key));
}
