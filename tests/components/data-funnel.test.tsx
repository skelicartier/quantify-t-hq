import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FunnelView } from "@/components/data/investors/funnel-view";
import type { Funnel } from "@/lib/data/api/investors";

/**
 * The Funnel view (raise spec §5.6.2) from a fixed summary, the spec's worked example
 * (§5.5): each stage "of" the stage before as "9 of 11", money in each currency's own
 * column and never added, the splits "of" the column before, and nothing drawn as a bar,
 * a meter or a percentage. Every firm is invented.
 */

const split = (
  key: string,
  label: string,
  [firms, written, replied, meeting, met, soft]: number[],
) => ({
  key,
  label,
  firms: firms ?? 0,
  written: written ?? 0,
  replied: replied ?? 0,
  meeting: meeting ?? 0,
  met: met ?? 0,
  soft_or_later: soft ?? 0,
});

const FUNNEL: Funnel = {
  today: "2026-11-13",
  week_from: "2026-11-09",
  firms: 12,
  not_written: 1,
  first_send_on: "2026-10-26",
  days_since_first_send: 18,
  first_meetings_this_week: 3,
  first_meeting_days: ["2026-11-06", "2026-11-07", "2026-11-09", "2026-11-10", "2026-11-13"],
  stages: [
    { stage: "written", now: 2, reached: 11, of: 12 },
    { stage: "replied", now: 1, reached: 9, of: 11 },
    { stage: "meeting", now: 1, reached: 5, of: 9 },
    { stage: "met", now: 1, reached: 4, of: 5 },
    { stage: "diligence", now: 1, reached: 3, of: 4 },
    { stage: "soft", now: 1, reached: 2, of: 3 },
    { stage: "signed", now: 0, reached: 1, of: 2 },
    { stage: "money_in", now: 1, reached: 1, of: 1 },
  ],
  exits: [
    { stage: "set_aside", now: 1 },
    { stage: "passed", now: 2 },
    { stage: "do_not_pitch", now: 0 },
  ],
  money: {
    INR: { asked: { amount: 2_500_000, firms: 1 } },
    USD: { soft: { amount: 25_000, firms: 1 }, money_in: { amount: 50_000, firms: 1 } },
  },
  passed: 2,
  pass_reasons: [
    { reason: "Not our sector", firms: 1 },
    { reason: "Too early", firms: 1 },
  ],
  stale_days: 14,
  time_in_stage: [
    { stage: "written", firms: 2, stale: 0, longest_days: 7 },
    { stage: "replied", firms: 1, stale: 1, longest_days: 16 },
    { stage: "meeting", firms: 1, stale: 0, longest_days: 0 },
    { stage: "met", firms: 1, stale: 0, longest_days: 1 },
    { stage: "diligence", firms: 1, stale: 0, longest_days: 1 },
    { stage: "soft", firms: 1, stale: 0, longest_days: 1 },
    { stage: "signed", firms: 0, stale: 0, longest_days: 0 },
  ],
  stale: [
    {
      investor_id: "f12",
      firm: "F12 Mu",
      stage: "replied",
      days: 16,
      next_step: "Book a meeting",
      next_step_on: "2026-10-29",
    },
  ],
  by_wave: [
    split("Wave 1", "Wave 1", [8, 8, 7, 5, 4, 2]),
    split("Wave 2", "Wave 2", [2, 2, 1, 0, 0, 0]),
    split("", "No wave", [2, 1, 1, 0, 0, 0]),
  ],
  by_intro: [
    split("warm", "Introduced", [3, 3, 3, 3, 3, 2]),
    split("cold", "Not introduced", [9, 8, 6, 2, 1, 0]),
  ],
};

const rowsOf = (caption: string): string[][] => {
  const table = document.getElementById(
    `table-${caption.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
  )!;
  return [...table.querySelectorAll("tbody tr")].map((row) =>
    [...row.querySelectorAll("td")].map((cell) => cell.textContent ?? ""),
  );
};

describe("the Funnel view", () => {
  it("gives each stage its count and each the stage before's “of”", () => {
    render(<FunnelView funnel={FUNNEL} />);
    expect(rowsOf("Funnel")).toEqual([
      ["Written to", "2", "11", "11 of 12"],
      ["Replied", "1", "9", "9 of 11"],
      ["Meeting booked", "1", "5", "5 of 9"],
      ["Met", "1", "4", "4 of 5"],
      ["Diligence", "1", "3", "3 of 4"],
      ["Soft commit", "1", "2", "2 of 3"],
      ["Signed", "0", "1", "1 of 2"],
      ["Money in", "1", "1", "1 of 1"],
    ]);
    const tiles = screen.getByRole("list", { name: "The raise" });
    expect(within(tiles).getByText("18")).toBeTruthy();
    expect(tiles.textContent).toContain("since 26 Oct");
    expect(tiles.textContent).toContain("since Mon 9 Nov");
    expect(screen.getByRole("link", { name: "Not written to yet 1" }).getAttribute("href")).toBe(
      "/data/investors?stage=not_written",
    );
    expect(screen.getByRole("link", { name: "Passed 2" })).toBeTruthy();
  });

  it("keeps each currency in its own column and never adds them", () => {
    render(<FunnelView funnel={FUNNEL} />);
    expect(rowsOf("Amounts by state")).toEqual([
      ["Asked", "₹2,500,000 · 1 firm", "None"],
      ["Soft", "None", "$25,000 · 1 firm"],
      ["Signed", "None", "None"],
      ["Money in", "None", "$50,000 · 1 firm"],
    ]);
    const heads = [...document.querySelectorAll("#table-amounts-by-state thead th")].map(
      (cell) => cell.textContent,
    );
    expect(heads).toEqual(["State", "INR", "USD"]);
  });

  it("writes the splits “of” the column before, and the stale firm with its next step", () => {
    render(<FunnelView funnel={FUNNEL} />);
    expect(rowsOf("By wave")).toEqual([
      ["Wave 1", "8", "8", "7 of 8", "5 of 7", "4 of 5", "2 of 4"],
      ["Wave 2", "2", "2", "1 of 2", "0 of 1", "0 of 0", "0 of 0"],
      ["No wave", "2", "1", "1 of 1", "0 of 1", "0 of 0", "0 of 0"],
    ]);
    expect(rowsOf("By introduction")[1]).toEqual([
      "Not introduced",
      "9",
      "8",
      "6 of 8",
      "2 of 6",
      "1 of 2",
      "0 of 1",
    ]);
    expect(rowsOf("Stale firms")[0]?.slice(0, 3)).toEqual(["F12 Mu", "Replied", "16"]);
    expect(rowsOf("Pass reasons")).toEqual([
      ["Not our sector", "1"],
      ["Too early", "1"],
    ]);
  });

  it("draws no bar, no meter and no percentage", () => {
    const { container } = render(<FunnelView funnel={FUNNEL} />);
    expect(container.querySelectorAll('[role="progressbar"], [role="meter"]')).toHaveLength(0);
    expect(container.querySelectorAll("progress, meter")).toHaveLength(0);
    expect(container.textContent).not.toContain("%");
    expect(container.textContent).not.toMatch(/target|goal/i);
  });

  it("says so when nothing is recorded yet", () => {
    render(
      <FunnelView
        funnel={{
          ...FUNNEL,
          days_since_first_send: null,
          first_send_on: null,
          money: {},
          pass_reasons: [],
          passed: 0,
          stale: [],
          by_wave: [split("", "No wave", [12, 11, 9, 5, 4, 2])],
        }}
      />,
    );
    expect(screen.getByText("Not sent yet")).toBeTruthy();
    expect(screen.getByText("No amounts recorded yet.")).toBeTruthy();
    expect(screen.getByText("No firm has passed.")).toBeTruthy();
    expect(screen.getByText("No firm has waited 14 days or more.")).toBeTruthy();
    expect(
      screen.getByText("No firm has a wave yet. Set one under More on the Firms view."),
    ).toBeTruthy();
  });
});
