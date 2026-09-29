import { describe, expect, it } from "vitest";

import type { BridgeMonth, Contract } from "@/lib/api/revenue";
import {
  addMonths,
  arpaByMonth,
  averageTenureMonths,
  churnByReason,
  concentration,
  customersByMonth,
  growthMetrics,
  logoChurn,
  logoCohorts,
  monthEnd,
  movementRates,
  niceCeiling,
  paying,
  quarterEnd,
  quarterOf,
  quarterStart,
  renewalsByMonth,
  seatFigures,
  sliceBy,
  topSlices,
} from "@/lib/revenue/metrics";

/** Every figure below was worked by hand before it was typed; that is the point. */

function month(over: Partial<BridgeMonth> & { month: string }): BridgeMonth {
  return {
    start: 0,
    new: 0,
    expansion: 0,
    contraction: 0,
    churn: 0,
    reactivation: 0,
    adjustment: 0,
    end: 0,
    partial: false,
    ...over,
  };
}

const MONTHS: BridgeMonth[] = [
  month({ month: "2026-06", start: 100, new: 20, end: 120 }),
  month({
    month: "2026-07",
    start: 120,
    new: 10,
    expansion: 6,
    contraction: -2,
    churn: -4,
    end: 130,
  }),
  month({ month: "2026-08", start: 130, churn: -13, end: 117 }),
  month({ month: "2026-09", start: 117, new: 50, end: 167, partial: true }),
];

describe("growth metrics", () => {
  const metrics = growthMetrics(MONTHS);

  it("ignores the month still running", () => {
    expect(metrics.latest?.month).toBe("2026-08");
  });

  it("reads growth off the latest completed month", () => {
    expect(metrics.momGrowth).toBeCloseTo(-13 / 130, 10);
    expect(metrics.netNew).toBe(-13);
  });

  it("compounds from the first completed month's end to the latest's", () => {
    // 120 → 117 over two months: (117/120)^(1/2) − 1.
    expect(metrics.cmgrMonths).toBe(2);
    expect(metrics.cmgr).toBeCloseTo(Math.sqrt(117 / 120) - 1, 10);
  });

  it("averages gross churn over the last three completed months", () => {
    // 0/100, (4+2)/120 = 0.05, 13/130 = 0.1 → mean 0.05.
    expect(metrics.churnMonths).toBe(3);
    expect(metrics.grossChurnRate).toBeCloseTo(0.05, 10);
  });

  it("divides gains by losses for the quick ratio", () => {
    // Gains 20 + 10 + 6 = 36; losses 2 + 4 + 13 = 19.
    expect(metrics.quickRatio).toBeCloseTo(36 / 19, 10);
    expect(metrics.hadLosses).toBe(true);
  });

  it("measures net retention against the window's opening MRR, ignoring new business", () => {
    // 100 + 6 − 2 − 4 − 13 = 87 → 0.87.
    expect(metrics.retentionMonths).toBe(3);
    expect(metrics.netRetention).toBeCloseTo(0.87, 10);
  });

  it("says so when there were no losses instead of dividing by zero", () => {
    const quiet = growthMetrics([month({ month: "2026-08", start: 100, new: 10, end: 110 })]);
    expect(quiet.quickRatio).toBeNull();
    expect(quiet.hadLosses).toBe(false);
    expect(quiet.cmgr).toBeNull();
  });

  it("has nothing to say about an empty bridge", () => {
    const none = growthMetrics([]);
    expect(none.latest).toBeNull();
    expect(none.momGrowth).toBeNull();
    expect(none.netRetention).toBeNull();
  });
});

function contract(over: Partial<Contract> & { contract_id: string }): Contract {
  return {
    company_id: over.contract_id,
    company_name: over.contract_id,
    deal_id: "",
    plan_name: "Desk",
    seats: 1,
    mrr_amount: 199,
    currency: "USD",
    billing_cadence: "monthly",
    starts_on: "2026-01-01",
    term_months: 12,
    renews_on: "2027-01-01",
    renews_in_days: 95,
    state: "active",
    ends_on: null,
    cancel_reason: "",
    notes: "",
    created_at: null,
    ...over,
  };
}

const TODAY = "2026-09-28";
const ALPHA = contract({
  contract_id: "alpha",
  company_name: "Alpha",
  plan_name: "Team",
  seats: 10,
  mrr_amount: 1690,
  billing_cadence: "annual",
  starts_on: "2025-01-15",
  renews_on: "2027-01-15",
});
const BETA = contract({
  contract_id: "beta",
  company_name: "Beta",
  starts_on: "2026-03-10",
  renews_on: "2026-10-10",
});
const GAMMA = contract({
  contract_id: "gamma",
  company_name: "Gamma",
  starts_on: "2025-06-01",
  renews_on: null,
  state: "ended",
  ends_on: "2026-05-01",
});
const DELTA = contract({
  contract_id: "delta",
  company_name: "Delta",
  plan_name: "Professional desk",
  seats: 2,
  mrr_amount: 398,
  starts_on: "2026-08-20",
  renews_on: "2026-11-20",
});
const EPSILON = contract({ contract_id: "epsilon", currency: "GBP", mrr_amount: 300 });
const BOOK = [ALPHA, BETA, GAMMA, DELTA, EPSILON];

describe("the book", () => {
  it("counts only what pays today, in one currency", () => {
    expect(paying(BOOK, "USD").map((row) => row.contract_id)).toEqual(["alpha", "beta", "delta"]);
  });

  it("slices MRR by plan, largest first, with shares that sum to one", () => {
    const slices = sliceBy(paying(BOOK, "USD"), (row) => row.plan_name);
    expect(slices.map((slice) => [slice.label, slice.count, slice.mrr])).toEqual([
      ["Team", 1, 1690],
      ["Professional desk", 1, 398],
      ["Desk", 1, 199],
    ]);
    expect(slices[0]!.share).toBeCloseTo(1690 / 2287, 10);
    expect(slices.reduce((sum, slice) => sum + slice.share, 0)).toBeCloseTo(1, 10);
  });

  it("folds the tail into one slice", () => {
    const slices = topSlices(
      sliceBy(paying(BOOK, "USD"), (row) => row.plan_name),
      1,
    );
    expect(slices).toHaveLength(2);
    expect(slices[1]!.label).toBe("Everyone else (2)");
    expect(slices[1]!.mrr).toBe(597);
    expect(slices[1]!.count).toBe(2);
  });

  it("names the largest customer and its share", () => {
    const figures = concentration(paying(BOOK, "USD"));
    expect(figures.customers).toBe(3);
    expect(figures.largest).toEqual({ name: "Alpha", mrr: 1690, share: 1690 / 2287 });
    expect(figures.top5Share).toBe(1);
  });

  it("counts seats and the share billed annually", () => {
    const figures = seatFigures(paying(BOOK, "USD"));
    expect(figures.seats).toBe(13);
    expect(figures.perSeat).toBeCloseTo(2287 / 13, 10);
    expect(figures.annualShare).toBeCloseTo(1690 / 2287, 10);
  });

  it("buckets renewals by month for the months ahead, skipping what has ended", () => {
    expect(renewalsByMonth(BOOK, TODAY, 6)).toEqual([
      { month: "2026-09", count: 0, mrr: 0 },
      { month: "2026-10", count: 1, mrr: 199 },
      { month: "2026-11", count: 1, mrr: 398 },
      { month: "2026-12", count: 0, mrr: 0 },
      { month: "2027-01", count: 2, mrr: 1990 },
      { month: "2027-02", count: 0, mrr: 0 },
    ]);
  });

  it("counts paying customers at each month's end", () => {
    const counts = customersByMonth(
      [ALPHA, BETA, GAMMA, DELTA],
      ["2025-06", "2026-04", "2026-06", "2026-09"],
    );
    expect(counts.map((row) => row.count)).toEqual([2, 3, 2, 3]);
  });

  it("measures logo churn against the cohort paying a year ago", () => {
    const churn = logoChurn([ALPHA, BETA, GAMMA, DELTA], TODAY, 12);
    expect(churn.since).toBe("2025-09-28");
    expect(churn.atStart).toBe(2);
    expect(churn.churned).toBe(1);
    expect(churn.rate).toBe(0.5);
  });

  it("averages tenure in months of 30.4375 days", () => {
    // 621 + 202 + 39 days over three contracts.
    expect(averageTenureMonths([ALPHA, BETA, DELTA], TODAY)).toBeCloseTo(862 / 3 / 30.4375, 6);
    expect(averageTenureMonths([], TODAY)).toBeNull();
  });
});

describe("calendar arithmetic", () => {
  it("clamps to the end of a shorter month", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-09-28", -12)).toBe("2025-09-28");
    expect(monthEnd("2026-02")).toBe("2026-02-28");
    expect(monthEnd("2024-02")).toBe("2024-02-29");
  });

  it("rounds an axis ceiling up to a half-magnitude step", () => {
    expect(niceCeiling(87_312)).toBe(90_000);
    expect(niceCeiling(58)).toBe(60);
    expect(niceCeiling(5_231)).toBe(5_500);
    expect(niceCeiling(199)).toBe(200);
    expect(niceCeiling(0)).toBe(1);
  });
});

describe("movement rates", () => {
  it("weights each kind by opening MRR over the window and shows losses positive", () => {
    const rates = movementRates(MONTHS, 3);
    // Openings 100 + 120 + 130 = 350; expansion 6; contraction 2; churn 4 + 13 = 17.
    expect(rates.months).toBe(3);
    expect(rates.opening).toBe(350);
    expect(rates.expansionRate).toBeCloseTo(6 / 350, 10);
    expect(rates.contractionRate).toBeCloseTo(2 / 350, 10);
    expect(rates.churnRate).toBeCloseTo(17 / 350, 10);
    expect(rates.reactivationRate).toBe(0);
    // (17 + 2 − 6 − 0) ÷ 350.
    expect(rates.netChurnRate).toBeCloseTo(13 / 350, 10);
    // Gross retention over the window's months: 100 less every churn and contraction.
    expect(rates.grossRetention).toBeCloseTo((100 - 4 - 2 - 13) / 100, 10);
  });

  it("has no rates without a completed month", () => {
    const rates = movementRates([month({ month: "2026-09", start: 50, partial: true })]);
    expect(rates.expansionRate).toBeNull();
    expect(rates.grossRetention).toBeNull();
  });
});

describe("churn by reason", () => {
  it("groups the contracts ended in the window by reason, largest MRR first", () => {
    const rows = [
      contract({
        contract_id: "a",
        state: "ended",
        ends_on: "2026-05-01",
        cancel_reason: "price",
        mrr_amount: 300,
      }),
      contract({
        contract_id: "b",
        state: "ended",
        ends_on: "2026-08-01",
        cancel_reason: "budget",
        mrr_amount: 500,
      }),
      contract({
        contract_id: "c",
        state: "ended",
        ends_on: "2025-01-01",
        cancel_reason: "price",
        mrr_amount: 900,
      }),
      contract({ contract_id: "d", state: "active", mrr_amount: 100 }),
    ];
    const slices = churnByReason(rows, TODAY, 12);
    expect(slices.map((slice) => [slice.reason, slice.count, slice.mrr])).toEqual([
      ["budget", 1, 500],
      ["price", 1, 300],
    ]);
    expect(slices[0]!.share).toBeCloseTo(500 / 800, 10);
  });
});

describe("per customer by month", () => {
  it("divides month-end MRR by the customers paying then", () => {
    const rows = arpaByMonth(
      [month({ month: "2026-07", end: 900 }), month({ month: "2026-08", end: 0 })],
      [
        { month: "2026-07", count: 3 },
        { month: "2026-08", count: 0 },
      ],
    );
    expect(rows).toEqual([
      { month: "2026-07", arpa: 300 },
      { month: "2026-08", arpa: null },
    ]);
  });
});

describe("cohorts by start quarter", () => {
  it("names quarters and walks their ends", () => {
    expect(quarterOf("2025-08-14")).toBe("2025-Q3");
    expect(quarterOf("2026-01-01")).toBe("2026-Q1");
    expect(quarterStart("2025-Q3", 1)).toBe("2025-10-01");
    expect(quarterStart("2025-Q4", 1)).toBe("2026-01-01");
    expect(quarterEnd("2025-Q3", 0)).toBe("2025-09-30");
    expect(quarterEnd("2025-Q4", 1)).toBe("2026-03-31");
  });

  it("measures each cohort's firms still paying at each later quarter's end, blank for the future", () => {
    const rows = [
      // Two firms began in 2025-Q3; one ended in February 2026.
      contract({ contract_id: "a", company_id: "A", starts_on: "2025-08-01" }),
      contract({
        contract_id: "b",
        company_id: "B",
        starts_on: "2025-09-15",
        state: "ended",
        ends_on: "2026-02-10",
      }),
      // A second contract for A does not count it twice.
      contract({ contract_id: "a2", company_id: "A", starts_on: "2026-03-01" }),
      // One firm began in 2026-Q2.
      contract({ contract_id: "c", company_id: "C", starts_on: "2026-05-01" }),
    ];
    const { cohorts, periods } = logoCohorts(rows, "2026-09-28", 4);
    expect(periods).toEqual([1, 2, 3, 4]);
    expect(cohorts.map((cohort) => [cohort.quarter, cohort.size])).toEqual([
      ["2025-Q3", 2],
      ["2026-Q2", 1],
    ]);
    // 2025-Q3 + 1 = end of 2025-Q4: both paying. + 2 = end of 2026-Q1: B has ended.
    // + 3 = end of 2026-Q2: A only. + 4 = end of 2026-Q3 (30 Sep 2026), still in the future.
    expect(cohorts[0]!.cells.map((cell) => cell.retained)).toEqual([1, 0.5, 0.5, null]);
    expect(cohorts[0]!.cells.map((cell) => cell.active)).toEqual([2, 1, 1, null]);
    // 2026-Q2 + 1 = end of 2026-Q3: not over yet.
    expect(cohorts[1]!.cells.map((cell) => cell.retained)).toEqual([null, null, null, null]);
  });
});
