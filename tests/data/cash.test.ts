// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { grown, scenariosOf, NO_COLLECTIONS } from "../../scripts/data/cash/scenarios";
import { tilesOf, turnoverOf } from "../../scripts/data/cash/tiles";
import { mondayOf, weekLabel, weeksOf } from "../../scripts/data/cash/weeks";
import { standInDutyRules } from "../../scripts/data/duties-contracts";
import { WALKER, startStack, type Stack } from "./helpers";

/**
 * The cash view (duties spec §5.3, §7.6): the weeks by hand; §5.3's 13-week table on Saturday
 * 14 Nov 2026 as the Owner and as an Admin (no stipends row, no item keyed `stipend:`, and
 * the whole answer's text holds neither the walk intern's name nor the stipend's amount); the
 * three scenarios' months and sentences; the break-even case; the tiles; with no Money, no
 * statements and no people ledger, `here` says so and nothing throws; the typed figures and
 * their refusals. Every name is invented.
 */

type Body = Record<string, unknown>;
let stack: Stack;

const DAY = "2026-11-14";
const INTERN = "Walk Intern One";

const view = async (owner: boolean) =>
  (await stack.ask("GET", `/data/_test/cash/view?today=${DAY}${owner ? "&owner=1" : ""}`)).json!;
const rupees = (table: Body) => (table.closing as number[]).map((minor) => minor / 100);

describe("the weeks by hand", () => {
  it("runs Monday to Sunday, week 1 the week of today", () => {
    expect(mondayOf("2026-11-14")).toBe("2026-11-09");
    expect(mondayOf("2026-11-09")).toBe("2026-11-09");
    expect(mondayOf("2026-11-15")).toBe("2026-11-09");
    const weeks = weeksOf(DAY, "2026-10-31");
    expect(weeks).toHaveLength(14);
    expect(weeks.map((week) => week.label).slice(0, 6)).toEqual([
      "Since 31 Oct",
      "9–15 Nov",
      "16–22 Nov",
      "23–29 Nov",
      "30 Nov – 6 Dec",
      "7–13 Dec",
    ]);
    expect(weeks[13]).toMatchObject({ from: "2027-02-01", to: "2027-02-07", label: "1–7 Feb" });
    expect(weeks[0]).toMatchObject({ from: "2026-11-01", to: "2026-11-08" });
    expect(weekLabel("2026-12-28", "2027-01-03")).toBe("28 Dec – 3 Jan");
  });
});

describe("the scenarios by hand (§5.3)", () => {
  const input = {
    opening: { minor: 120_000_000, as_of: "2026-10-31" },
    burn_minor: 15_000_000,
    collections_minor: 0,
    growth: 0,
    hire_delay_months: 3,
    events: [
      {
        event_id: "a",
        kind: "money_in" as const,
        name: "Walk raise",
        period: "2027-01",
        amount_minor: 850_000_000,
        flagged: true,
      },
      {
        event_id: "b",
        kind: "monthly_cost" as const,
        name: "Walk hire",
        period: "2027-02",
        amount_minor: 6_000_000,
        flagged: true,
      },
    ],
  };
  const [base, hiring, raise] = scenariosOf(input);
  const at = (scenario: typeof base, period: string) =>
    scenario!.months.find((month) => month.period === period)!.closing_minor / 100;

  it("runs Base as typed", () => {
    expect(base!.months).toHaveLength(24);
    expect(base!.months[0]!.period).toBe("2026-11");
    expect(base!.months[23]!.period).toBe("2028-10");
    expect([
      at(base, "2026-11"),
      at(base, "2026-12"),
      at(base, "2027-01"),
      at(base, "2027-02"),
    ]).toEqual([1_050_000, 900_000, 9_250_000, 9_040_000]);
    expect(at(base, "2027-03")).toBe(9_040_000 - 210_000);
    expect(at(base, "2028-10")).toBe(4_840_000);
    expect(base!.words).toBe("No cash-out in 24 months.");
    expect(base!.cash_out).toBeNull();
  });

  it("delays the raise six months, and the cash runs out in May 2027", () => {
    expect(raise!.label).toBe("Raise delayed six months");
    expect(
      ["2026-11", "2026-12", "2027-01", "2027-02", "2027-03", "2027-04", "2027-05"].map((period) =>
        at(raise, period),
      ),
    ).toEqual([1_050_000, 900_000, 750_000, 540_000, 330_000, 120_000, -90_000]);
    expect(raise!.cash_out).toBe("2027-05");
    expect(raise!.words).toBe("Cash runs out in May 2027.");
  });

  it("delays the hire three months", () => {
    expect(hiring!.label).toBe("Hiring delayed");
    expect(
      ["2027-01", "2027-02", "2027-03", "2027-04", "2027-05"].map((period) => at(hiring, period)),
    ).toEqual([9_250_000, 9_100_000, 8_950_000, 8_800_000, 8_590_000]);
    expect(hiring!.words).toBe("No cash-out in 24 months.");
  });

  it("says break-even is never reached with nothing collected", () => {
    for (const scenario of [base, hiring, raise]) {
      expect(scenario!.break_even).toBeNull();
      expect(scenario!.break_even_words).toBe(NO_COLLECTIONS);
    }
  });

  it("finds break-even in the 16th month with ₹50,000 growing 10 per cent against ₹2,00,000", () => {
    let collected = 5_000_000;
    for (let step = 1; step <= 15; step += 1) collected = grown(collected, 10);
    expect(collected).toBe(20_886_235);
    expect(grown(19_999_999, 0)).toBe(19_999_999);
    const [even] = scenariosOf({
      opening: { minor: 500_000_000, as_of: "2026-10-31" },
      burn_minor: 15_000_000,
      collections_minor: 5_000_000,
      growth: 10,
      hire_delay_months: 3,
      events: [],
    });
    expect(even!.break_even).toBe("2028-02");
    expect(even!.months.findIndex((month) => month.period === "2028-02")).toBe(15);
    expect(even!.break_even_words).toBe("Collections reach the month's costs in February 2028.");
  });
});

describe("the tiles by hand (§5.3)", () => {
  const rules = standInDutyRules(() => DAY);
  it("writes each threshold as a sentence with its rule", () => {
    const tiles = tilesOf({
      today: DAY,
      rules,
      exports: [
        {
          invoice_id: "x1",
          customer: "Walk Customer",
          invoice_number: "WALK-EXP-1",
          invoice_on: "2026-06-01",
          currency: "INR",
          amount_minor: 42_000_000,
          receipts: [],
          href: "/data/money/exports/x1",
        },
        {
          invoice_id: "x2",
          customer: "Walk Customer",
          invoice_number: "WALK-EXP-2",
          invoice_on: "2026-07-01",
          currency: "USD",
          amount_minor: 100_000,
          receipts: [],
          href: "/data/money/exports/x2",
        },
        {
          invoice_id: "x3",
          customer: "Walk Customer",
          invoice_number: "WALK-EXP-3",
          invoice_on: "2026-08-01",
          currency: "USD",
          amount_minor: 100_000,
          receipts: [],
          href: "/data/money/exports/x3",
        },
      ],
      other_sales_minor: 20_000_000,
      headcount: { employees: 0, interns: 2, contractors: 0 },
      caro: { amount_minor: 10_000_000, as_of: "2026-03-31" },
      books: { revenue_limit: 2_500_000, invoice_limit: null },
    });
    const byKey = Object.fromEntries(tiles.map((tile) => [tile.key, tile]));
    expect(byKey.gst).toMatchObject({
      words: "₹6,20,000 this year of the ₹20,00,000 limit: below.",
      beside: "2 invoices are not in rupees yet.",
      rule: { key: "gst-registration", confirm_with: "CA" },
    });
    expect(byKey.pf).toMatchObject({
      words: "0 employees; the limit is 20.",
      beside:
        "2 interns and 0 contractors are not counted here; confirm with your CA whether they should be.",
    });
    expect(byKey.esi!.words).toBe("0 employees; the limit is 10.");
    expect(byKey.caro!.words).toBe("₹1,00,000 on 31 Mar 2026 of the ₹1,00,00,000 limit: below.");
    expect(byKey.books!.words).toBe(
      "₹6,20,000 of the ₹25,00,000 your books software's free plan allows.",
    );
    expect(JSON.stringify(tiles)).not.toContain("%");
    expect(turnoverOf([]).minor).toBe(0);
  });

  it("says what is missing instead of guessing", () => {
    const tiles = tilesOf({
      today: DAY,
      rules: null,
      exports: null,
      other_sales_minor: 0,
      headcount: null,
      caro: null,
      books: null,
    });
    expect(tiles.map((tile) => tile.key)).toEqual(["gst", "pf", "esi", "caro"]);
    expect(tiles[0]!.words).toBe("₹0 this year.");
    expect(tiles[1]!.words).toBe("The people ledger is not loaded here.");
    expect(tiles[3]!.words).toBe("Not typed yet.");
    expect(tiles.every((tile) => tile.rule === null)).toBe(true);
  });
});

describe("the view through the stack", () => {
  beforeAll(async () => {
    stack = await startStack({ modules: ["files", "contacts", "dates", "cash"] });
  }, 60_000);
  afterAll(() => stack.stop());

  it("works with nothing loaded: here says so, no opening, nothing throws", async () => {
    const page = (await stack.ask("GET", "/data/cash?owner=1")).json!;
    expect(page.here).toEqual({ money: false, statements: false, people: false });
    const tables = page.tables as Body[];
    expect(tables.map((table) => table.currency)).toEqual(["INR"]);
    expect(tables[0]).toMatchObject({ opening: null, closing: [] });
    expect(page.scenarios).toBeNull();
    expect((page.weeks as Body[])[0]!.label).toBe("Before this week");
    expect((page.tiles as Body[])[0]!.words).toBe("₹0 this year of the ₹20,00,000 limit: below.");
  });

  it("installs the stand-ins and gives §5.3's table as the Owner", async () => {
    const posted = async (path: string, body: Body) =>
      (await stack.ask("POST", path, { ...body, by: WALKER })).json!;
    expect(
      await posted("/data/_test/cash/statements", {
        cash: [
          {
            currency: "INR",
            as_of: "2026-10-31",
            cash_minor: 120_000_000,
            gross_burn_minor: 15_000_000,
            avg_net_burn_minor: 15_000_000,
            months: 3,
            collected_minor: 0,
            uncategorised: 0,
          },
        ],
      }),
    ).toMatchObject({ installed: true });
    await posted("/data/_test/cash/money", {
      bills: [
        {
          bill_id: "walk-bill-1",
          vendor_id: "walk-vendor-1",
          vendor_name: "Walk Legal LLP",
          invoice_number: "WALK-INV-0011",
          invoice_on: "2026-10-20",
          currency: "INR",
          total_minor: 5_900_000,
          payable_minor: 5_900_000,
          open_minor: 5_900_000,
          category_id: null,
          pay_by: "2026-11-18",
          payments: [],
          cancelled: false,
          href: "/data/money/bills/walk-bill-1",
        },
      ],
    });
    await posted("/data/_test/cash/people-pay", {
      owed: [
        {
          person_id: "walk-cash-intern",
          name: INTERN,
          period: "2026-11",
          due_on: "2026-11-30",
          amount_minor: 1_500_000,
          currency: "INR",
        },
      ],
      headcount: { employees: 0, interns: 1, contractors: 0 },
    });
    const line = await stack.ask("POST", "/data/cash/lines", {
      kind: "expected_in",
      on: "2026-12-10",
      currency: "INR",
      amount: "1,00,000",
      name: "Walk Customer One",
      sure: false,
      by: WALKER,
    });
    expect(line.json!.line).toMatchObject({
      amount_minor: 10_000_000,
      counted_at: 20,
      sure: false,
    });
    const page = await view(true);
    expect(page.here).toEqual({ money: true, statements: true, people: true });
    expect(page.stipends_left_out).toBe(false);
    const table = (page.tables as Body[])[0]!;
    expect(table.opening).toEqual({
      minor: 120_000_000,
      as_of: "2026-10-31",
      source: "statements",
    });
    expect((table.rows as Body[]).map((row) => row.key)).toEqual([
      "bills",
      "stipends",
      "other_out",
      "expected_in",
    ]);
    const closing = rupees(table);
    expect(closing).toHaveLength(14);
    expect(closing.slice(0, 6)).toEqual([
      1_200_000, 1_200_000, 1_141_000, 1_141_000, 1_126_000, 1_146_000,
    ]);
    expect(closing[13]).toBe(1_146_000);
    const items = table.items as Body[];
    expect(
      items.find((item) => item.key === "in:" + String((line.json!.line as Body).line_id)),
    ).toMatchObject({
      week: 5,
      minor: 10_000_000,
      counted_minor: 2_000_000,
    });
    expect(items.find((item) => String(item.key).startsWith("stipend:"))).toMatchObject({
      week: 4,
      name: "Walk Intern One's stipend for Nov 2026",
      href: "/data/people/walk-cash-intern",
    });
    expect(items.find((item) => item.key === "bill:walk-bill-1")).toMatchObject({ week: 2 });
  });

  it("leaves every people figure out for an Admin, down to the text", async () => {
    const page = await view(false);
    expect(page.stipends_left_out).toBe(true);
    const table = (page.tables as Body[])[0]!;
    expect((table.rows as Body[]).map((row) => row.key)).not.toContain("stipends");
    expect((table.items as Body[]).some((item) => String(item.key).startsWith("stipend:"))).toBe(
      false,
    );
    const closing = rupees(table);
    expect([closing[4], closing[5], closing[13]]).toEqual([1_141_000, 1_161_000, 1_161_000]);
    const text = JSON.stringify(page);
    expect(text).not.toContain(INTERN);
    expect(text).not.toContain("walk-cash-intern");
    // The stipend's ₹15,000 as a figure of its own (the burn's 15000000 holds the same digits).
    expect(text).not.toMatch(/[^0-9]1500000[^0-9]/);
    // Counts only: the headcount is given either way.
    expect(JSON.stringify((page.tiles as Body[]).find((tile) => tile.key === "pf"))).toContain(
      "1 intern and 0 contractors",
    );
    const live = (await stack.ask("GET", "/data/cash")).json!;
    expect(JSON.stringify(live)).not.toContain(INTERN);
  });

  it("runs the scenarios from the statements' burn, or his own", async () => {
    let page = await view(false);
    expect(page.assumptions).toMatchObject({ burn_minor: 15_000_000, burn_source: "statements" });
    for (const event of [
      { kind: "money_in", name: "Walk raise", period: "2027-01", amount: "8500000", flagged: true },
      { kind: "monthly_cost", name: "Walk hire", period: "2027-02", amount: "60000", flagged: "1" },
    ])
      expect((await stack.ask("POST", "/data/cash/events", { ...event, by: WALKER })).status).toBe(
        200,
      );
    page = await view(false);
    const scenarios = page.scenarios as Body[];
    expect(scenarios.map((scenario) => scenario.words)).toEqual([
      "No cash-out in 24 months.",
      "No cash-out in 24 months.",
      "Cash runs out in May 2027.",
    ]);
    const typed = await stack.ask("POST", "/data/cash/setup", { burn: "200000", by: WALKER });
    expect((typed.json!.setup as Body).burn_minor).toBe(20_000_000);
    page = await view(false);
    expect(page.assumptions).toMatchObject({ burn_minor: 20_000_000, burn_source: "typed" });
    await stack.ask("POST", "/data/cash/setup", { burn: "", by: WALKER });
    expect((await view(false)).assumptions).toMatchObject({ burn_source: "statements" });
  });

  it("refuses what it cannot read", async () => {
    const message = async (path: string, body: Body) =>
      String(
        (((await stack.ask("POST", path, { ...body, by: WALKER })).json?.error ?? {}) as Body)
          .message,
      );
    expect(await message("/data/cash/setup", { growth: "12.25" })).toBe(
      "Type the growth as a number from 0 to 100, with at most one decimal.",
    );
    expect(await message("/data/cash/setup", { hire_delay_months: 13 })).toBe(
      "Type the hire delay as a whole number of months from 1 to 12.",
    );
    expect(
      await message("/data/cash/lines", {
        kind: "other_out",
        on: "2026-12-01",
        amount: "12.345",
        name: "Walk rent",
      }),
    ).toBe("Type the amount as a number, such as 1180.50.");
    expect(
      await message("/data/cash/events", {
        kind: "money_in",
        name: "W",
        period: "2027-01",
        amount: "10",
      }),
    ).toBe("Name it, in 2 to 120 letters.");
    expect(await message("/data/cash/setup", { caro_amount: "100000", caro_as_of: "" })).toBe(
      "Give the figure and the day it is true on, or leave both empty.",
    );
    const caro = await stack.ask("POST", "/data/cash/setup", {
      caro_amount: "100000",
      caro_as_of: "2026-03-31",
      by: WALKER,
    });
    expect((caro.json!.setup as Body).caro).toEqual({
      amount_minor: 10_000_000,
      as_of: "2026-03-31",
    });
  });

  it("withdraws a line, and the week loses it", async () => {
    const out = await stack.ask("POST", "/data/cash/lines", {
      kind: "other_out",
      on: "2026-11-20",
      amount: "10000",
      name: "Walk rent",
      by: WALKER,
    });
    const id = String((out.json!.line as Body).line_id);
    const before = rupees(((await view(false)).tables as Body[])[0]!)[2];
    await stack.ask("POST", `/data/cash/lines/${id}/withdraw`, { by: WALKER });
    const after = rupees(((await view(false)).tables as Body[])[0]!)[2];
    expect(before! + 10_000).toBe(after);
  });

  it("makes the CSV with stipends only for the Owner", async () => {
    const make = async (owner: boolean) => {
      const started = await stack.ask("POST", "/data/builds", {
        kind: "cash_csv",
        owner,
        by: WALKER,
      });
      const id = String((started.json!.build as Body).build_id);
      let state = "building";
      for (let tries = 0; tries < 100 && state === "building"; tries += 1) {
        state = String(((await stack.ask("GET", `/data/builds/${id}`)).json!.build as Body).state);
        if (state === "building") await new Promise((resolve) => setTimeout(resolve, 20));
      }
      return (await stack.raw(stack.socket, "GET", `/data/builds/${id}/bytes`)).bytes.toString(
        "utf8",
      );
    };
    const owner = await make(true);
    expect(owner.split("\r\n")[0]).toBe(
      "﻿currency,week,from,to,bills_to_pay,stipends,other_money_out,expected_money_in,closing_cash",
    );
    const admin = await make(false);
    expect(admin.split("\r\n")[0]).toBe(
      "﻿currency,week,from,to,bills_to_pay,other_money_out,expected_money_in,closing_cash",
    );
    expect(admin).not.toContain(INTERN);
  });

  it("answers `{ installed: false, real: true }` while a real service is there", async () => {
    const real = await stack.ask("POST", "/data/_test/cash/duty-rules", { by: WALKER });
    expect(real.json).toMatchObject({ installed: false, real: true });
    const off = await stack.ask("POST", "/data/_test/cash/money", { on: false, by: WALKER });
    expect(off.json).toMatchObject({ installed: false });
    expect(((await stack.ask("GET", "/data/cash")).json!.here as Body).money).toBe(false);
  });
});
