// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addDays, localDay } from "../../scripts/data/days";
import { pastedDay } from "../../scripts/data/holidays/book";
import { WALKER, codeOf, startStack, type Stack } from "./helpers";

/**
 * The holiday set (duties spec §5.1, §5.3, §7.4): §5.1's working-day rows through the
 * module, with and without holidays and with Sunday the only weekly off day; the national
 * button twice adds three once; the paste and its line refusals (nothing added when a line
 * fails); the checks; the working week's refusals; the agenda; the overview block; the CSV;
 * and `holidays` provided for other units. Every holiday that is not one of the three fixed
 * national days is invented.
 */

type Body = Record<string, unknown>;
let stack: Stack;
const today = () => localDay(new Date());

const count = async (from: string, n: number) =>
  (await stack.ask("GET", `/data/holidays/working-days?from=${from}&count=${n}`)).json!;
const year = async (y: number) => (await stack.ask("GET", `/data/holidays?year=${y}`)).json!;
const add = (on: string, name: string, kind = "company") =>
  stack.ask("POST", "/data/holidays", { on, name, kind, by: WALKER });
const message = (answer: { json: Body | null }) =>
  String(((answer.json?.error ?? {}) as Body).message ?? "");
const idOn = async (on: string) =>
  ((await year(Number(on.slice(0, 4)))).holidays as Body[]).find((row) => row.on === on)!
    .holiday_id as string;

beforeAll(async () => {
  stack = await startStack({ modules: ["files", "contacts", "dates", "calendar", "holidays"] });
}, 60_000);
afterAll(() => stack.stop());

describe("reading a pasted day", () => {
  it("takes 2027-01-26 and 26 Jan 2027, and nothing else", () => {
    expect(pastedDay("2027-01-26")).toBe("2027-01-26");
    expect(pastedDay("26 Jan 2027")).toBe("2027-01-26");
    expect(pastedDay("2 October 2027")).toBe("2027-10-02");
    expect(pastedDay("32 Jan 2027")).toBeNull();
    expect(pastedDay("Jan 26 2027")).toBeNull();
    expect(pastedDay("29 Feb 2027")).toBeNull();
  });
});

describe("working days (§5.1, through the module)", () => {
  it("counts Monday to Friday with nothing recorded, and says so", async () => {
    expect(await count("2026-10-31", 5)).toMatchObject({
      on: "2026-11-06",
      off_between: [],
      fallback: true,
    });
    expect((await year(2026)).checks).toContain(
      "No holidays are recorded for 2026, so working days are counted Monday to Friday.",
    );
    expect((await stack.ask("POST", "/data/_test/need", { name: "holidays" })).json!.found).toBe(
      true,
    );
  });

  it("skips a company holiday, and the first of January when recorded", async () => {
    expect((await add("2026-11-04", "Walk company day")).status).toBe(200);
    expect(await count("2026-10-31", 5)).toMatchObject({
      on: "2026-11-09",
      off_between: [{ on: "2026-11-04", name: "Walk company day", kind: "company" }],
      fallback: false,
    });
    expect((await count("2026-12-31", 5)).on).toBe("2027-01-07");
    expect((await count("2026-12-31", 5)).fallback).toBe(true);
    await add("2027-01-01", "Walk new year day");
    expect((await count("2026-12-31", 5)).on).toBe("2027-01-08");
    expect((await count("2027-01-22", 3)).on).toBe("2027-01-27");
  });

  it("adds the three national days once, however often the button is pressed", async () => {
    const first = await stack.ask("POST", "/data/holidays/national", { year: 2027, by: WALKER });
    expect(first.json).toMatchObject({ added: 3 });
    const again = await stack.ask("POST", "/data/holidays/national", { year: 2027, by: WALKER });
    expect(again.json).toMatchObject({ added: 0 });
    const names = ((await year(2027)).holidays as Body[]).map((row) => [
      row.on,
      row.name,
      row.kind,
    ]);
    expect(names).toEqual(
      expect.arrayContaining([
        ["2027-01-26", "Republic Day", "national"],
        ["2027-08-15", "Independence Day", "national"],
        ["2027-10-02", "Gandhi Jayanti", "national"],
      ]),
    );
    expect((await count("2027-01-22", 3)).on).toBe("2027-01-28");
    expect(
      message(await stack.ask("POST", "/data/holidays/national", { year: 2051, by: WALKER })),
    ).toBe("Choose a year from 2020 to 2040.");
  });

  it("counts Saturdays when Sunday is the only weekly off day", async () => {
    await stack.ask("POST", `/data/holidays/${await idOn("2026-11-04")}/remove`, { by: WALKER });
    const setup = await stack.ask("POST", "/data/holidays/setup", { week_off: [0], by: WALKER });
    expect((setup.json!.setup as Body).week_off).toEqual([0]);
    expect((await count("2026-10-31", 5)).on).toBe("2026-11-06");
    expect((await count("2026-11-06", 1)).on).toBe("2026-11-07");
    await stack.ask("POST", "/data/holidays/setup", { week_off: [0, 6], by: WALKER });
    expect((await count("2026-11-06", 1)).on).toBe("2026-11-09");
    expect(
      message(await stack.ask("POST", "/data/holidays/setup", { week_off: [], by: WALKER })),
    ).toBe("Choose at least one weekly off day, and leave at least one working day.");
    expect(
      message(
        await stack.ask("POST", "/data/holidays/setup", {
          week_off: [0, 1, 2, 3, 4, 5, 6],
          by: WALKER,
        }),
      ),
    ).toBe("Choose at least one weekly off day, and leave at least one working day.");
    expect(
      message(await stack.ask("GET", "/data/holidays/working-days?from=2026-10-31&count=261")),
    ).toBe("Type a whole number of working days from 0 to 260.");
  });
});

describe("adding, pasting and the checks", () => {
  it("refuses a second holiday on a day, a bad day and a short name", async () => {
    const twice = await add("2027-01-26", "Walk second holiday");
    expect(twice.status).toBe(409);
    expect(message(twice)).toBe("26 Jan 2027 is already a holiday: Republic Day.");
    expect(message(await add("2041-01-01", "Walk far day"))).toBe(
      "Choose a day from 2020 to 2040.",
    );
    expect(message(await add("2027-02-01", "W"))).toBe("Name the holiday, in 2 to 120 letters.");
    expect(
      message(
        await stack.ask("POST", "/data/holidays", {
          on: "2027-02-01",
          name: "Walk day",
          kind: "festival",
          by: WALKER,
        }),
      ),
    ).toBe("Choose national, state, company or optional.");
  });

  it("adds nothing from a paste with a bad line, and all of a good one", async () => {
    const before = ((await year(2027)).holidays as Body[]).length;
    const bad = await stack.ask("POST", "/data/holidays/bulk", {
      text: "2027-03-08, Walk state day one\n2027-03-09, Walk state day two\n32 Jan 2027, Walk state day three",
      by: WALKER,
    });
    expect(bad.status).toBe(400);
    expect(message(bad)).toBe("Line 3: “32 Jan 2027” is not a day.");
    expect(((await year(2027)).holidays as Body[]).length).toBe(before);
    const twin = await stack.ask("POST", "/data/holidays/bulk", {
      text: "2027-03-08, Walk state day one\n8 Mar 2027, Walk state day again",
      by: WALKER,
    });
    expect(message(twin)).toBe("Line 2: 8 Mar 2027 is already a holiday: Walk state day one.");
    const taken = await stack.ask("POST", "/data/holidays/bulk", {
      text: "26 Jan 2027, Walk clash",
      by: WALKER,
    });
    expect(message(taken)).toBe("Line 1: 26 Jan 2027 is already a holiday: Republic Day.");
    const good = await stack.ask("POST", "/data/holidays/bulk", {
      text: "2027-03-08, Walk state day one\n9 Mar 2027, Walk state day two\n\n2027-03-10, Walk choice day, optional\n2027-03-11, Walk office day, Company",
      by: WALKER,
    });
    expect(good.json).toMatchObject({ added: 4 });
    const rows = (await year(2027)).holidays as Body[];
    expect(rows.find((row) => row.on === "2027-03-09")).toMatchObject({
      name: "Walk state day two",
      kind: "state",
      weekday: "Tuesday",
      on_week_off: false,
    });
    expect(rows.find((row) => row.on === "2027-03-10")!.kind).toBe("optional");
    expect(rows.find((row) => row.on === "2027-03-11")!.kind).toBe("company");
    // An optional day is listed, and is not a day off.
    expect((await count("2027-03-09", 1)).on).toBe("2027-03-10");
    const long = Array.from(
      { length: 61 },
      (_, index) => `2028-01-${String((index % 28) + 1).padStart(2, "0")}, Walk day`,
    );
    expect(
      message(
        await stack.ask("POST", "/data/holidays/bulk", { text: long.join("\n"), by: WALKER }),
      ),
    ).toBe("Paste at most 60 lines at once.");
  });

  it("writes the checks as sentences", async () => {
    await stack.ask("POST", `/data/holidays/${await idOn("2027-10-02")}/remove`, { by: WALKER });
    const page = await year(2027);
    expect(page.checks).toEqual([
      "2 of the 3 national holidays of 2027 are recorded: 2 October is missing.",
      "No minimum typed yet. Your CA confirms which state's rules apply.",
      "Independence Day falls on a Sunday, a weekly off day.",
    ]);
    expect(page.counts).toEqual({ national: 2, state: 2, company: 2, optional: 1 });
    await stack.ask("POST", "/data/holidays/setup", { state_minimum: "10", by: WALKER });
    expect((await year(2027)).checks).toContain(
      "4 state and company holidays in 2027; the minimum you typed is 10.",
    );
    expect(
      message(await stack.ask("POST", "/data/holidays/setup", { state_minimum: 31, by: WALKER })),
    ).toBe("Type the state's minimum as a whole number from 0 to 30, or leave it empty.");
    expect(
      message(await stack.ask("POST", "/data/holidays/setup", { state: "ZZ", by: WALKER })),
    ).toBe("Choose a state from the list.");
    const saved = await stack.ask("POST", "/data/holidays/setup", {
      state: "KA",
      optional_allowance: 2,
      by: WALKER,
    });
    expect(saved.json!.setup).toMatchObject({
      state: "KA",
      state_minimum: 10,
      optional_allowance: 2,
      week_off: [0, 6],
    });
    expect(((await year(2030)).checks as string[])[0]).toBe(
      "No holidays are recorded for 2030, so working days are counted Monday to Friday.",
    );
  });

  it("gives the two rule lines and the years to choose from", async () => {
    const page = await year(2027);
    expect(page.rules).toMatchObject({
      national: { key: "holidays-national", confirm_with: "CA", usable: true, readings: [] },
      state: { key: "holidays-state", confirm_with: "CA" },
    });
    const thisYear = Number(today().slice(0, 4));
    expect(page.years).toEqual(expect.arrayContaining([2026, 2027, thisYear, thisYear + 1]));
  });

  it("changes and removes a holiday, and logs each change", async () => {
    const id = await idOn("2027-03-11");
    const changed = await stack.ask("POST", `/data/holidays/${id}/update`, {
      name: "Walk office day moved",
      on: "2027-03-12",
      by: WALKER,
    });
    expect(changed.json!.holiday).toMatchObject({
      on: "2027-03-12",
      name: "Walk office day moved",
    });
    expect(
      codeOf(
        await stack.ask("POST", `/data/holidays/${id}/update`, { on: "2027-01-26", by: WALKER }),
      ),
    ).toBe("taken");
    expect(
      (await stack.ask("POST", `/data/holidays/${id}/remove`, { by: WALKER })).json,
    ).toMatchObject({
      removed: true,
    });
    expect((await stack.ask("POST", `/data/holidays/${id}/remove`, { by: WALKER })).status).toBe(
      404,
    );
    const events = readFileSync(join(stack.dir, "data", "holidays", "events.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Body);
    expect(events.filter((event) => event.holiday_id === id).map((event) => event.verb)).toEqual([
      "added",
      "changed",
      "removed",
    ]);
  });
});

describe("the calendar, the overview and the CSV", () => {
  it("puts each holiday of the next year in the calendar, never Due", async () => {
    const soon = addDays(today(), 30);
    const far = addDays(today(), 400);
    await add(soon, "Walk soon day", "company");
    await add(far, "Walk far-off day", "state");
    const items = (await stack.ask("GET", "/data/calendar/items")).json!.items as Body[];
    const mine = items.filter((item) => item.kind === "holiday");
    const soonItem = mine.find((item) => item.on === soon)!;
    expect(soonItem).toMatchObject({
      title: "Walk soon day",
      plain: "Holiday",
      sub: "Company holiday",
      remind_days: [],
    });
    expect(String(soonItem.href)).toMatch(/^\/data\/registers\/holidays\?year=\d{4}#holiday-/);
    expect(mine.some((item) => item.on === far)).toBe(false);
    expect(mine.every((item) => String(item.on) >= today())).toBe(true);
    const overview = (await stack.ask("GET", "/data/overview?owner=1")).json!;
    expect(JSON.stringify(overview.due ?? [])).not.toContain("Walk soon day");
    const sources = (await stack.ask("GET", "/data/calendar")).json!.sources as Body[];
    expect(sources.find((source) => source.name === "holidays")).toMatchObject({ here: true });
  });

  it("makes the year's CSV", async () => {
    const started = await stack.ask("POST", "/data/builds", {
      kind: "holidays_csv",
      year: 2027,
      by: WALKER,
    });
    const id = String((started.json!.build as Body).build_id);
    let state = "building";
    for (let tries = 0; tries < 100 && state === "building"; tries += 1) {
      state = String(((await stack.ask("GET", `/data/builds/${id}`)).json!.build as Body).state);
      if (state === "building") await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(state).toBe("ready");
    const bytes = await stack.raw(stack.socket, "GET", `/data/builds/${id}/bytes`);
    const text = bytes.bytes.toString("utf8");
    expect(text.startsWith("﻿day,weekday,holiday,kind,note\r\n")).toBe(true);
    expect(text).toContain("2027-01-26,Tuesday,Republic Day,National holiday,");
  });
});
