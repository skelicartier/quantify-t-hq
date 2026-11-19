import { describe, expect, it } from "vitest";

import {
  addHours,
  fyWords,
  istInstant,
  istParts,
  istWords,
  minorInput,
  minorOf,
  minorWords,
  minorWordsBy,
  minutesBetween,
  periodWords,
  rateWords,
  shareOf,
  spanWords,
} from "@/lib/data/labels-duties";

/**
 * The shared words of the duties batch (ws-notes/duties/spec.md §3.2, §5.1): every row of
 * §5.1 for money in minor units, months and years, and IST minutes, with the example's
 * numbers exactly. Pure: no clock, no zone of this Mac.
 */

describe("money in minor units", () => {
  it("minorOf reads typed amounts and refuses the rest", () => {
    expect(minorOf("1,180.50")).toBe(118050);
    expect(minorOf("1180.5")).toBe(118050);
    expect(minorOf("₹ 25,00,000")).toBe(250000000);
    expect(minorOf("12.345")).toBeNull();
    expect(minorOf("-5")).toBeNull();
    expect(minorOf("")).toBeNull();
    expect(minorOf(1180.5)).toBe(118050);
  });

  it("minorWords prints one figure in its currency, decimals only when not whole", () => {
    expect(minorWords(118050, "INR")).toBe("₹1,180.50");
    expect(minorWords(250000000, "INR")).toBe("₹25,00,000");
    expect(minorWords(1250000, "USD")).toBe("$12,500");
    expect(minorWords(-118050, "INR")).toBe("−₹1,180.50");
  });

  it("minorWordsBy keeps currencies apart, by code; minorInput types an amount back", () => {
    expect(minorWordsBy({ USD: 1250000, INR: 118050 })).toBe("₹1,180.50 · $12,500");
    expect(minorWordsBy({})).toBe("");
    expect(minorInput(118050)).toBe("1180.50");
    expect(minorInput(250000000)).toBe("2500000");
  });

  it("shareOf rounds down to a paisa; rateWords never uses a per cent sign", () => {
    expect(shareOf(1000000, 10)).toBe(100000);
    expect(shareOf(5500000, 10)).toBe(550000);
    expect(shareOf(2800000, 1)).toBe(28000);
    expect(shareOf(333, 10)).toBe(33);
    expect(rateWords(10)).toBe("10 per cent");
    expect(rateWords(0.1)).toBe("0.1 per cent");
    expect(rateWords(10)).not.toContain("%");
  });
});

describe("months and financial years", () => {
  it("periodWords and fyWords", () => {
    expect(periodWords("2026-11")).toBe("November 2026");
    expect(fyWords("2026-11-12")).toBe("2026-27");
    expect(fyWords("2027-03-31")).toBe("2026-27");
    expect(fyWords("2027-04-01")).toBe("2027-28");
  });
});

describe("IST minutes", () => {
  it("istInstant: 21:40 IST on 13 Nov 2026 is 16:10 UTC; malformed is null", () => {
    expect(istInstant("2026-11-13", "21:40")).toBe("2026-11-13T16:10:00.000Z");
    expect(istInstant("2026-11-13", "9:40")).toBeNull();
    expect(istInstant("2026-11-13", "24:00")).toBeNull();
    expect(istInstant("13 Nov 2026", "21:40")).toBeNull();
  });

  it("istParts and istWords read an instant in India, never this Mac's zone", () => {
    expect(istParts("2026-11-13T22:10:00.000Z")).toEqual({ day: "2026-11-14", time: "03:40" });
    expect(istWords("2026-11-13T22:10:00.000Z")).toBe("03:40 IST, 14 Nov 2026");
    expect(istParts("2026-12-31T18:40:00.000Z")).toEqual({ day: "2027-01-01", time: "00:10" });
  });

  it("addHours and minutesBetween", () => {
    expect(addHours("2026-11-13T16:10:00.000Z", 6)).toBe("2026-11-13T22:10:00.000Z");
    expect(minutesBetween("2026-11-13T17:30:00.000Z", "2026-11-13T22:10:00.000Z")).toBe(280);
    expect(minutesBetween("2026-11-13T22:10:00.000Z", "2026-11-13T17:30:00.000Z")).toBe(-280);
  });

  it("spanWords: 320 · 60 · 20 · 1500 · 0", () => {
    expect(spanWords(320)).toBe("5 hours 20 minutes");
    expect(spanWords(60)).toBe("1 hour");
    expect(spanWords(20)).toBe("20 minutes");
    expect(spanWords(1500)).toBe("1 day 1 hour");
    expect(spanWords(0)).toBe("0 minutes");
  });
});
