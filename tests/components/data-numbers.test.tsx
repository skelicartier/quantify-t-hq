import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { NumbersTable, namedWords } from "@/components/data/numbers/numbers-table";

/**
 * The Numbers page's six-week table (raise spec §8.7.2), drawn from a fixed answer: the
 * named-buyer row reads "1 of 3", every cell is the count it was given, and there is no
 * bar, meter, target or goal anywhere in it. Every figure is invented.
 */

const WEEKS = [
  { key: "2026-10-05", label: "Week of 5 Oct" },
  { key: "2026-10-12", label: "Week of 12 Oct" },
  { key: "2026-10-19", label: "Week of 19 Oct" },
  { key: "2026-10-26", label: "Week of 26 Oct" },
  { key: "2026-11-02", label: "Week of 2 Nov" },
  { key: "2026-11-09", label: "This week (to 13 Nov)" },
];

const WEEKLY = {
  yeses: [0, 0, 0, 0, 1, 3],
  firms_joined: [0, 0, 1, 0, 1, 3],
  named_buyers: [0, 0, 0, 0, 1, 1],
  calls_booked: [0, 0, 0, 1, 0, 2],
  calls_held: [0, 0, 0, 1, 0, 1],
  pilots_started: [0, 0, 0, 0, 1, 0],
  first_investor_meetings: [0, 0, 0, 0, 2, 3],
};

describe("the six-week table", () => {
  it("shows every count, the named-buyer row as “1 of 3”, and nothing that measures a goal", () => {
    const { container } = render(
      <NumbersTable
        caption="Six weeks"
        periods={WEEKS}
        counts={WEEKLY}
        namedOf={WEEKLY.firms_joined}
      />,
    );
    const table = container.querySelector("#table-six-weeks");
    expect(table).not.toBeNull();
    const headers = [...table!.querySelectorAll("thead th")].map((cell) => cell.textContent);
    expect(headers).toEqual(["Counted", ...WEEKS.map((week) => week.label)]);
    const rows = [...table!.querySelectorAll("tbody tr")].map((row) =>
      [...row.children].map((cell) => cell.textContent),
    );
    expect(rows).toEqual([
      ["People who said yes", "0", "0", "0", "0", "1", "3"],
      ["Firms joined the waitlist", "0", "0", "1", "0", "1", "3"],
      ["Of them, named buyer firms", "0", "0", "0 of 1", "0", "1 of 1", "1 of 3"],
      ["Calls booked", "0", "0", "0", "1", "0", "2"],
      ["Calls held", "0", "0", "0", "1", "0", "1"],
      ["Pilots started", "0", "0", "0", "0", "1", "0"],
      ["First investor meetings", "0", "0", "0", "0", "2", "3"],
    ]);
    expect(within(container).getByText("1 of 3")).toBeTruthy();
    expect(
      container.querySelector('[role="progressbar"], [role="meter"], progress, meter'),
    ).toBeNull();
    expect(container.querySelector(".meter, .bar-chart")).toBeNull();
    expect(container.textContent).not.toMatch(/target|goal|%/i);
    expect(screen.getByRole("region", { name: "Six weeks" })).toBeTruthy();
  });

  it("leaves the first-meetings row out when the investor list is not there", () => {
    const { first_investor_meetings: _left, ...rest } = WEEKLY;
    void _left;
    const { container } = render(
      <NumbersTable
        caption="Six weeks"
        periods={WEEKS}
        counts={rest}
        namedOf={rest.firms_joined}
      />,
    );
    expect(container.querySelectorAll("tbody tr")).toHaveLength(6);
    expect(container.textContent).not.toContain("First investor meetings");
  });

  it("reads a period with no firm joined as a plain count", () => {
    expect(namedWords(0, 0)).toBe("0");
    expect(namedWords(2, 4)).toBe("2 of 4");
  });
});
