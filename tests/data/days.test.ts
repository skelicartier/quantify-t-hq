// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  addDays,
  addWorkingDays,
  daysBetween,
  isWorkingDay,
  lastDays,
  localDay,
  monthOf,
  workingDayAfter,
} from "../../scripts/data/days";

// vitest runs with TZ=Asia/Kolkata on purpose (vitest.config.ts): the local day is IST's.
describe("the local day", () => {
  it("is this machine's calendar day, as Mail merge counts it", () => {
    expect(process.env.TZ).toBe("Asia/Kolkata");
    expect(localDay("2026-11-10T20:30:00.000Z")).toBe("2026-11-11"); // 02:00 IST the next day
    expect(localDay("2026-11-10T18:29:59.000Z")).toBe("2026-11-10"); // 23:59:59 IST
    expect(localDay("2026-11-09T18:30:00.000Z")).toBe("2026-11-10"); // midnight IST
    expect(localDay(new Date("2026-01-01T00:00:00.000Z"))).toBe("2026-01-01");
  });
});

describe("calendar arithmetic", () => {
  it("adds days without a zone, across month ends and leap days", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-11-10", 14)).toBe("2026-11-24");
    expect(daysBetween("2026-11-01", "2026-11-10")).toBe(9);
    expect(daysBetween("2026-11-10", "2026-11-01")).toBe(-9);
    expect(monthOf("2026-11-10")).toBe("2026-11");
  });

  it("knows working days: Monday to Friday, nothing guessed about holidays", () => {
    expect(isWorkingDay("2026-11-13")).toBe(true); // Friday
    expect(isWorkingDay("2026-11-14")).toBe(false); // Saturday
    expect(isWorkingDay("2026-11-15")).toBe(false); // Sunday
    expect(isWorkingDay("2026-11-16")).toBe(true); // Monday
    expect(workingDayAfter("2026-11-13")).toBe("2026-11-16");
    expect(workingDayAfter("2026-11-14")).toBe("2026-11-16");
    expect(addWorkingDays("2026-11-13", 2)).toBe("2026-11-17");
    expect(addWorkingDays("2026-11-10", 0)).toBe("2026-11-10");
  });

  it("lists the last days oldest first, today last", () => {
    expect(lastDays("2026-11-10", 7)).toEqual([
      "2026-11-04",
      "2026-11-05",
      "2026-11-06",
      "2026-11-07",
      "2026-11-08",
      "2026-11-09",
      "2026-11-10",
    ]);
    expect(lastDays("2026-03-01", 2)).toEqual(["2026-02-28", "2026-03-01"]);
  });
});
