import { describe, expect, it } from "vitest";

import { foldLine, toIcs, type IcsItem } from "@/lib/data/ics";

/**
 * The calendar file (raise spec §7.3.3), by hand: today is 13 Nov 2026, the stamp 05:00
 * UTC, HQ on 127.0.0.1:3000. Every person and firm is invented.
 */

const TODAY = "2026-11-13";
const STAMP = "2026-11-13T05:00:00.000Z";
const ORIGIN = "http://127.0.0.1:3000";

const KEY_DATE: IcsItem = {
  key: "key_date:d1",
  kind: "key_date",
  title: "Company income-tax return",
  plain: "Company income-tax return",
  sub: "Filing · The Indian company",
  on: "2026-11-21",
  remind_days: [7],
  href: "/data/dates#date-d1",
};

const FOLLOW_UP: IcsItem = {
  key: "follow_up:f1",
  kind: "follow_up",
  title: "Write to Asha again",
  plain: "Follow-up",
  sub: "Asha Walk · Walk Fund 1",
  on: "2026-11-10",
  remind_days: [0],
  href: "/data/leads/abc",
};

const ics = (items: IcsItem[], detail: "full" | "plain" = "full") =>
  toIcs({ items, today: TODAY, detail, origin: ORIGIN, stamp: STAMP });

/** The events, each as its unfolded lines. */
function events(text: string): string[][] {
  const unfolded = text.replace(/\r\n /g, "").split("\r\n");
  const found: string[][] = [];
  let current: string[] | null = null;
  for (const line of unfolded) {
    if (line === "BEGIN:VEVENT") current = [];
    else if (line === "END:VEVENT" && current) {
      found.push(current);
      current = null;
    } else current?.push(line);
  }
  return found;
}

describe("toIcs", () => {
  it("writes a calendar of CRLF lines with its name and an hourly refresh", () => {
    const text = ics([]);
    expect(text.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(text).toContain("PRODID:-//Quantify Terminal//HQ Data//EN\r\n");
    expect(text).toContain("METHOD:PUBLISH\r\n");
    expect(text).toContain("X-WR-CALNAME:HQ: what is due\r\n");
    expect(text).toContain("REFRESH-INTERVAL;VALUE=DURATION:PT1H\r\n");
    expect(text).toContain("X-PUBLISHED-TTL:PT1H\r\n");
    expect(text.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(text.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });

  it("gives a key date its day, the day after, and a reminder 7 days before", () => {
    const [event] = events(ics([KEY_DATE]));
    expect(event).toEqual(
      expect.arrayContaining([
        "UID:key_date-d1@hq.data",
        "DTSTAMP:20261113T050000Z",
        "DTSTART;VALUE=DATE:20261121",
        "DTEND;VALUE=DATE:20261122",
        "SUMMARY:Company income-tax return",
        "DESCRIPTION:Filing · The Indian company\\nOpen in HQ: http://127.0.0.1:3000/data/dates#date-d1",
        "URL:http://127.0.0.1:3000/data/dates#date-d1",
        "CATEGORIES:Key date",
        "TRANSP:TRANSPARENT",
        "TRIGGER:-P7D",
      ]),
    );
  });

  it("puts an overdue item on today, says since when, and reminds at 9 on the day", () => {
    const [full] = events(ics([FOLLOW_UP]));
    expect(full).toContain("DTSTART;VALUE=DATE:20261113");
    expect(full).toContain("SUMMARY:Overdue since 10 Nov: Write to Asha again");
    expect(full!.filter((line) => line.startsWith("TRIGGER:"))).toEqual(["TRIGGER:PT9H"]);
    const [plain] = events(ics([FOLLOW_UP], "plain"));
    expect(plain).toContain("SUMMARY:Overdue since 10 Nov: Follow-up");
    expect(plain).toContain("DESCRIPTION:Open HQ to see it.");
    expect(plain!.some((line) => line.startsWith("URL:"))).toBe(false);
    expect(plain!.join("\n")).not.toContain("Asha");
  });

  it("leaves out a reminder that would fall before today", () => {
    const soon = { ...KEY_DATE, key: "key_date:d2", on: "2026-11-15", remind_days: [7, 2, 0] };
    const [event] = events(ics([soon]));
    expect(event!.filter((line) => line.startsWith("TRIGGER:"))).toEqual([
      "TRIGGER:-P2D",
      "TRIGGER:PT9H",
    ]);
  });

  it("escapes commas, semicolons and backslashes in text", () => {
    const [event] = events(
      ics([{ ...FOLLOW_UP, on: "2026-11-20", title: "Call Asha, then Ben; done" }]),
    );
    expect(event).toContain("SUMMARY:Call Asha\\, then Ben\\; done");
    const [slash] = events(ics([{ ...FOLLOW_UP, on: "2026-11-20", title: "A\\B" }]));
    expect(slash).toContain("SUMMARY:A\\\\B");
  });

  it("keeps an item on today + 400 days and leaves out the day after", () => {
    const text = ics([
      { ...KEY_DATE, key: "key_date:in", on: "2027-12-18" },
      { ...KEY_DATE, key: "key_date:out", on: "2027-12-19" },
    ]);
    expect(text).toContain("UID:key_date-in@hq.data");
    expect(text).not.toContain("UID:key_date-out@hq.data");
  });

  it("makes every character outside letters, digits, hyphens and underscores a hyphen in the UID", () => {
    const text = ics([{ ...KEY_DATE, key: "waitlist:e1:look-again" }]);
    expect(text).toContain("UID:waitlist-e1-look-again@hq.data");
  });

  it("folds long lines at 75 octets without splitting a character", () => {
    const title = `${"₹".repeat(60)}`;
    const text = ics([{ ...FOLLOW_UP, title }]);
    const physical = text.split("\r\n").filter(Boolean);
    const encoder = new TextEncoder();
    const decoder = new TextDecoder("utf-8", { fatal: true });
    for (const line of physical) {
      const bytes = encoder.encode(line);
      expect(bytes.length).toBeLessThanOrEqual(75);
      expect(() => decoder.decode(bytes)).not.toThrow();
    }
    const summary = physical.findIndex((line) => line.startsWith("SUMMARY:"));
    expect(physical[summary + 1]!.startsWith(" ")).toBe(true);
    expect(physical[summary + 1]!.startsWith("  ")).toBe(false);
    const [event] = events(text);
    expect(event).toContain(`SUMMARY:Overdue since 10 Nov: ${title}`);
  });

  it("folds a plain long line and unfolds it to the original", () => {
    const line = `DESCRIPTION:${"a".repeat(200)}`;
    const folded = foldLine(line);
    for (const part of folded.split("\r\n")) expect(part.length).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, "")).toBe(line);
  });
});
