import { describe, expect, it } from "vitest";

import { dueState, formatMoney, formatMrr, formatWait } from "@/lib/format";

describe("money", () => {
  it("rounds to whole units in the currency's own symbol", () => {
    expect(formatMoney(1234.5, "USD")).toBe("$1,235");
    expect(formatMoney(0, "USD")).toBe("$0");
    expect(formatMrr(199, "USD")).toBe("$199/mo");
  });

  it("never invents a figure", () => {
    expect(formatMoney(Number.NaN)).toBe("Not available");
    // Null is a figure the role may not see, drawn as the tables draw one.
    expect(formatMrr(null)).toBe("—");
    expect(formatMoney(undefined)).toBe("—");
  });

  it("falls back to dollars for a code that is not one", () => {
    expect(formatMoney(10, "dollars")).toBe("$10");
  });
});

describe("waits", () => {
  it("reads like a clock at each scale", () => {
    expect(formatWait(0)).toBe("0m");
    expect(formatWait(45)).toBe("45m");
    expect(formatWait(125)).toBe("2h 05m");
    expect(formatWait(1_440)).toBe("1d");
    expect(formatWait(3_000)).toBe("2d 2h");
  });

  it("says nothing rather than something wrong", () => {
    expect(formatWait(null)).toBe("—");
    expect(formatWait(-5)).toBe("—");
  });
});

describe("due dates", () => {
  it("compares calendar days, not instants", () => {
    expect(dueState("2026-09-26", "2026-09-27")).toBe("overdue");
    expect(dueState("2026-09-27", "2026-09-27")).toBe("today");
    expect(dueState("2026-09-27T00:00:00Z", "2026-09-27")).toBe("today");
    expect(dueState("2026-10-01", "2026-09-27")).toBe("upcoming");
    expect(dueState("", "2026-09-27")).toBe("none");
    expect(dueState(null, "2026-09-27")).toBe("none");
  });
});
