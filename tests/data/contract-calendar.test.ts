// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addDays, localDay } from "../../scripts/data/days";
import {
  makeCalendarLink,
  readCalendar,
  readCalendarFeed,
  readCalendarItems,
  setCalendarDetail,
  turnCalendarOff,
} from "@/lib/data/api/calendar";
import { toIcs } from "@/lib/data/ics";
import { WALKER, startStack, type Stack } from "./helpers";

/**
 * The portal's calendar client against the real stack: every answer passes the portal's
 * own schema, the feed answers only to its token, and the items make a calendar file.
 */

let stack: Stack;
const today = () => localDay(new Date());

beforeAll(async () => {
  stack = await startStack({ env: true });
}, 60_000);
afterAll(() => stack.stop());

describe("the portal and the calendar agree", () => {
  it("on the page, the link, the detail, the items and the feed", async () => {
    const page = await readCalendar();
    expect(page.feed.on).toBe(false);
    expect(page.sources.map((source) => source.name)).toContain("dates");
    await stack.ask("POST", "/data/dates", {
      title: "Walk filing",
      kind: "filing",
      due_on: addDays(today(), 5),
      remind_days: 2,
      by: WALKER,
    });
    const made = await makeCalendarLink(null, WALKER);
    expect(made.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(made.feed).toMatchObject({ on: true, made_by: WALKER, detail: "full" });
    const items = await readCalendarItems();
    expect(items.items.map((item) => item.title)).toContain("Walk filing");
    const feed = await readCalendarFeed(made.token);
    expect(feed.items).toEqual(items.items);
    const text = toIcs({
      items: feed.items,
      today: feed.today,
      detail: feed.detail,
      origin: "http://127.0.0.1:3113",
      stamp: new Date().toISOString(),
    });
    expect(text).toContain("SUMMARY:Walk filing");
    expect((await readCalendar()).feed).toMatchObject({ reads: 1 });
    expect((await setCalendarDetail("plain", WALKER)).feed.detail).toBe("plain");
    await expect(readCalendarFeed("x".repeat(43))).rejects.toMatchObject({
      status: 404,
      code: "not_found",
      message: "Not found.",
    });
    expect((await turnCalendarOff(WALKER)).feed.on).toBe(false);
    await expect(readCalendarFeed(made.token)).rejects.toMatchObject({ status: 404 });
  });
});
