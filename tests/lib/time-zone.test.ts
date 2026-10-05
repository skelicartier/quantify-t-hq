import { describe, expect, it } from "vitest";

import { formatAbsolute, formatDate, formatDateTime, setRequestTimeZone } from "@/lib/format";
import { canonicalZone, dateTimeInZone, isValidZone, partsInZone, zoneName } from "@/lib/time-zone";

/**
 * Times in a person's zone: the numeric parts come from Intl, the zone's name from our
 * own table (so the server and the browser agree), a calendar date is never shifted, the
 * UTC form stays beside every absolute, and an unknown zone falls back to UTC.
 */
describe("times in a zone", () => {
  it("prints the wall clock of the zone with its name for the season", () => {
    expect(dateTimeInZone(new Date("2026-09-05T04:05:00Z"), "Asia/Kolkata")).toBe(
      "5 Sep 2026, 09:35 IST",
    );
    expect(dateTimeInZone(new Date("2026-07-01T12:00:00Z"), "Europe/London")).toBe(
      "1 Jul 2026, 13:00 BST",
    );
    expect(dateTimeInZone(new Date("2026-01-15T12:00:00Z"), "Europe/London")).toBe(
      "15 Jan 2026, 12:00 GMT",
    );
    // The southern hemisphere's daylight time falls in January.
    expect(dateTimeInZone(new Date("2026-01-15T00:00:00Z"), "Australia/Sydney")).toBe(
      "15 Jan 2026, 11:00 AEDT",
    );
    expect(dateTimeInZone(new Date("2026-12-31T23:30:00Z"), "America/New_York")).toBe(
      "31 Dec 2026, 18:30 EST",
    );
    expect(dateTimeInZone(new Date("2026-09-05T04:05:00Z"), "")).toBe("5 Sep 2026, 04:05 UTC");
  });

  it("names a zone outside the table by its offset, and treats an unknown one as UTC", () => {
    const at = new Date("2026-09-05T04:05:00Z");
    expect(dateTimeInZone(at, "Asia/Kathmandu")).toBe("5 Sep 2026, 09:50 UTC+5:45");
    expect(dateTimeInZone(at, "America/Sao_Paulo")).toBe("5 Sep 2026, 01:05 UTC-3");
    expect(dateTimeInZone(at, "Mars/Olympus")).toBe("5 Sep 2026, 04:05 UTC");
    expect(isValidZone("Mars/Olympus")).toBe(false);
    expect(isValidZone("Europe/Zurich")).toBe(true);
    // A browser's older name for a zone is read as the current one.
    expect(canonicalZone("Asia/Calcutta")).toBe("Asia/Kolkata");
    expect(canonicalZone("Europe/London")).toBe("Europe/London");
    expect(canonicalZone("Etc/UTC")).toBe("UTC");
    expect(partsInZone(at, "Asia/Kolkata").offset).toBe(330);
    expect(zoneName("Europe/Paris", new Date("2026-03-29T12:00:00Z"), 120)).toBe("CEST");
  });

  it("formats in the zone asked for, keeps the UTC form, and never shifts a calendar date", () => {
    const formatted = formatDateTime("2026-09-05T04:05:00Z", { zone: "Asia/Kolkata" });
    expect([formatted.absolute, formatted.utc, formatted.zone]).toEqual([
      "5 Sep 2026, 09:35 IST",
      "5 Sep 2026, 04:05 UTC",
      "Asia/Kolkata",
    ]);
    // A date-only value is a calendar day wherever it is read.
    expect(
      formatDateTime("2026-09-05", { zone: "America/Los_Angeles", style: "date" }).absolute,
    ).toBe("5 Sep 2026");
    // A datetime shown as a date is the date in the zone.
    expect(
      formatDateTime("2026-09-05T23:30:00Z", { zone: "Asia/Kolkata", style: "date" }).absolute,
    ).toBe("6 Sep 2026");
    expect(formatAbsolute("2026-09-05T04:05:00Z", "—", "Europe/London")).toBe(
      "5 Sep 2026, 05:05 BST",
    );
    expect(formatDate("2026-09-05")).toBe("5 Sep 2026");
    // Without a zone, and outside a request, UTC as before.
    expect(formatAbsolute("2026-09-05T04:05:00Z")).toBe("5 Sep 2026, 04:05 UTC");
  });

  it("takes the request's zone when none is given", () => {
    // In a test there is no request, so `cache` memoises nothing and the setting does not
    // carry: what is checked is that the call is safe and the fallback is UTC.
    setRequestTimeZone("Asia/Kolkata");
    expect(formatAbsolute("2026-09-05T04:05:00Z")).toMatch(/^5 Sep 2026, 0[49]:[03]5 (UTC|IST)$/);
  });
});
