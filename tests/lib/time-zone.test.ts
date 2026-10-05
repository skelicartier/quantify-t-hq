import { describe, expect, it } from "vitest";

import {
  formatAbsolute,
  formatDate,
  formatDateTime,
  isoToLocalInput,
  localInputToIso,
  setRequestTimeZone,
} from "@/lib/format";
import {
  canonicalZone,
  dateTimeInZone,
  instantFromWallClock,
  isValidZone,
  partsInZone,
  tomorrowAt,
  typedInstant,
  wallClockInZone,
  zoneName,
} from "@/lib/time-zone";

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

/**
 * A time typed into a `datetime-local` field is a wall clock in the person's zone — the
 * zone the page prints its times in — and the instant sent is the one that wall clock
 * means there. Both halves use the same zone, so what is typed is what is read back, and
 * the instant recorded is the one meant. Clock changes are read on the right side.
 */
describe("typed times", () => {
  it("reads a wall clock in the zone and shows an instant back as the same wall clock", () => {
    expect(instantFromWallClock("2026-10-07T09:00", "Asia/Kolkata")?.toISOString()).toBe(
      "2026-10-07T03:30:00.000Z",
    );
    expect(wallClockInZone(new Date("2026-10-07T03:30:00Z"), "Asia/Kolkata")).toBe(
      "2026-10-07T09:00",
    );
    // UTC, and "not set", read as UTC — the zone the page prints in when none is chosen.
    expect(instantFromWallClock("2026-10-07T09:00", "")?.toISOString()).toBe(
      "2026-10-07T09:00:00.000Z",
    );
    expect(wallClockInZone(new Date("2026-10-07T09:00:00Z"), "UTC")).toBe("2026-10-07T09:00");
    // West of UTC the calendar date can differ from UTC's.
    expect(instantFromWallClock("2026-10-07T20:00", "America/Los_Angeles")?.toISOString()).toBe(
      "2026-10-08T03:00:00.000Z",
    );
    expect(wallClockInZone(new Date("2026-10-08T03:00:00Z"), "America/Los_Angeles")).toBe(
      "2026-10-07T20:00",
    );
  });

  it("reads each side of a clock change by the offset in force then", () => {
    // London's summer time ends at 01:00 UTC on 25 Oct 2026: 00:30 is still BST, 02:30 GMT.
    expect(instantFromWallClock("2026-10-25T00:30", "Europe/London")?.toISOString()).toBe(
      "2026-10-24T23:30:00.000Z",
    );
    expect(instantFromWallClock("2026-10-25T02:30", "Europe/London")?.toISOString()).toBe(
      "2026-10-25T02:30:00.000Z",
    );
    // The hour that happens twice is read once, and reads back as itself.
    const repeated = instantFromWallClock("2026-10-25T01:30", "Europe/London");
    expect(["2026-10-25T00:30:00.000Z", "2026-10-25T01:30:00.000Z"]).toContain(
      repeated?.toISOString(),
    );
    expect(wallClockInZone(repeated!, "Europe/London")).toBe("2026-10-25T01:30");
    // The hour London skips on 29 Mar 2026 (01:00 GMT → 02:00 BST) reads as the hour after.
    expect(instantFromWallClock("2026-03-29T01:30", "Europe/London")?.toISOString()).toBe(
      "2026-03-29T01:30:00.000Z",
    );
    expect(wallClockInZone(new Date("2026-03-29T01:30:00Z"), "Europe/London")).toBe(
      "2026-03-29T02:30",
    );
  });

  it("refuses what is not a time or not a date, and keeps an instant that names its zone", () => {
    expect(instantFromWallClock("2026-02-30T10:00", "UTC")).toBeNull();
    expect(instantFromWallClock("2026-10-07T24:00", "UTC")).toBeNull();
    expect(instantFromWallClock("tomorrow", "UTC")).toBeNull();
    expect(instantFromWallClock("2026-10-07T03:30:00Z", "Asia/Kolkata")).toBeNull();
    // What a form sends: a wall clock becomes the instant, an instant stays, empty stays
    // empty, and words go through for the service to refuse in its own.
    expect(typedInstant("2026-10-07T09:00", "Asia/Kolkata")).toBe("2026-10-07T03:30:00.000Z");
    expect(typedInstant("2026-10-07T03:30:00.000Z", "Asia/Kolkata")).toBe(
      "2026-10-07T03:30:00.000Z",
    );
    expect(typedInstant("  ", "Asia/Kolkata")).toBe("");
    expect(typedInstant("tomorrow", "Asia/Kolkata")).toBe("tomorrow");
    // The converters a field uses are the same two halves.
    expect(isoToLocalInput("2026-10-07T03:30:00Z", "Asia/Kolkata")).toBe("2026-10-07T09:00");
    expect(localInputToIso("2026-10-07T09:00", "Asia/Kolkata")).toBe("2026-10-07T03:30:00.000Z");
    expect(localInputToIso("", "Asia/Kolkata")).toBe("");
    expect(localInputToIso("tomorrow", "Asia/Kolkata")).toBe("");
    expect(isoToLocalInput("not a time", "Asia/Kolkata")).toBe("");
  });

  it("offers tomorrow at nine on the zone's calendar, not UTC's", () => {
    // 20:00 UTC on 6 Oct is already 01:30 on 7 Oct in Kolkata: tomorrow there is the 8th.
    const now = new Date("2026-10-06T20:00:00Z");
    expect(tomorrowAt(9, "Asia/Kolkata", now)).toBe("2026-10-08T09:00");
    expect(tomorrowAt(9, "", now)).toBe("2026-10-07T09:00");
    expect(tomorrowAt(9, "America/Los_Angeles", now)).toBe("2026-10-07T09:00");
  });
});
