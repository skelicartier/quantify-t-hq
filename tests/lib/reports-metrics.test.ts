import { describe, expect, it } from "vitest";

import type { DealSummary } from "@/lib/api/crm";
import { closedMetrics, pipelineCover } from "@/lib/reports/metrics";

function deal(over: Partial<DealSummary> & { deal_id: string }): DealSummary {
  return {
    name: over.deal_id,
    company_id: "",
    primary_person_id: "",
    stage_key: "won",
    stage_label: "Won",
    status: "won",
    mrr_amount: 1000,
    currency: "USD",
    seats: 1,
    win_probability: 100,
    weighted_mrr: 1000,
    expected_close_date: "",
    next_step: "",
    next_step_due: "",
    owner_staff_id: "",
    source_key: "",
    days_in_stage: 0,
    idle_days: 0,
    flags: [],
    loss_reason: "",
    loss_competitor: "",
    loss_detail: "",
    closed_at: null,
    created_at: null,
    ...over,
  };
}

const NOW = Date.parse("2026-09-28T12:00:00Z");
const WON = [
  deal({ deal_id: "w1", created_at: "2026-06-01T00:00:00Z", closed_at: "2026-08-01T00:00:00Z" }),
  deal({
    deal_id: "w2",
    mrr_amount: 500,
    created_at: "2026-07-01T00:00:00Z",
    closed_at: "2026-09-20T00:00:00Z",
  }),
  deal({ deal_id: "w3", created_at: "2026-01-01T00:00:00Z", closed_at: "2026-05-01T00:00:00Z" }),
];
const LOST = [
  deal({ deal_id: "l1", status: "lost", loss_reason: "price", closed_at: "2026-09-10T00:00:00Z" }),
  deal({ deal_id: "l2", status: "lost", loss_reason: "price", closed_at: "2026-08-30T00:00:00Z" }),
  deal({ deal_id: "l3", status: "lost", loss_reason: "timing", closed_at: "2026-09-27T00:00:00Z" }),
];

describe("closed deals in a window", () => {
  const metrics = closedMetrics(WON, LOST, NOW, 90);

  it("counts only deals closed inside the window", () => {
    expect(metrics.won).toBe(2);
    expect(metrics.lost).toBe(3);
    expect(metrics.winRate).toBeCloseTo(0.4, 10);
  });

  it("totals and averages what was won, per currency", () => {
    expect(metrics.wonMrr).toEqual({ USD: 1500 });
    expect(metrics.averageWon).toEqual({ USD: 750 });
    // 1,500 over ninety days is 500 a month.
    expect(metrics.monthlyWonMrr).toEqual({ USD: 500 });
  });

  it("takes the middle sales cycle", () => {
    // 61 days and 81 days → 71.
    expect(metrics.medianCycleDays).toBe(71);
    expect(metrics.cycleSample).toBe(2);
  });

  it("ranks the loss reasons", () => {
    expect(metrics.reasons).toEqual([
      { reason: "price", count: 2 },
      { reason: "timing", count: 1 },
    ]);
  });

  it("withholds every money figure when one is withheld", () => {
    const blind = closedMetrics([WON[0]!, deal({ ...WON[1]!, mrr_amount: null })], [], NOW);
    expect(blind.won).toBe(2);
    expect(blind.wonMrr).toBeNull();
    expect(blind.averageWon).toBeNull();
    expect(blind.monthlyWonMrr).toBeNull();
  });

  it("has no rate with nothing closed", () => {
    expect(closedMetrics([], [], NOW).winRate).toBeNull();
    expect(closedMetrics([], [], NOW).medianCycleDays).toBeNull();
  });
});

describe("pipeline cover", () => {
  it("is the open pipeline as a multiple of a month's won MRR", () => {
    expect(pipelineCover({ USD: 36_066 }, { USD: 500 })).toBeCloseTo(72.132, 10);
  });

  it("is nothing without both figures in the same currency", () => {
    expect(pipelineCover({ USD: 36_066 }, null)).toBeNull();
    expect(pipelineCover({ USD: 36_066 }, { GBP: 500 })).toBeNull();
    expect(pipelineCover(null, { USD: 500 })).toBeNull();
    expect(pipelineCover({ USD: 36_066 }, { USD: 0 })).toBeNull();
  });
});
