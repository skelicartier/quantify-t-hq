// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { moneyRows, updateCashOf, usedCash } from "../../scripts/data/numbers/count";
import type { MoneyEntry } from "../../scripts/data/numbers/types";
import type { CashNow } from "../../scripts/data/duties-contracts";
import * as numbersApi from "@/lib/data/api/numbers";
import { WALKER, codeOf, startStack, type Stack } from "./helpers";

/**
 * Numbers with the statements (ws-notes/duties/spec.md §9.6, §9.12): `usedCash`'s four
 * branches, the override needing a reason, statements too old to use, and a frozen MIS
 * feeding the frozen month's update. The walk statement is invented; Money and the people
 * ledger are stand-ins.
 */

const TODAY = "2026-11-19";
const STAFF = { staff_id: "walk-owner", name: "Walk Owner" };

const typed = (currency: "INR" | "USD", asOf: string, override = false): MoneyEntry => ({
  entry_id: `${currency}-${asOf}`,
  currency,
  as_of: asOf,
  cash: 1_000_000,
  burn_per_month: 100_000,
  note: override ? "The bank's own figure is newer." : "",
  recorded_at: `${asOf}T06:00:00.000Z`,
  recorded_by: STAFF,
  ...(override ? { override: true as const } : {}),
});

const FEED: CashNow = {
  currency: "INR",
  as_of: "2026-10-31",
  cash_minor: 120_000_000,
  gross_burn_minor: 17_500_000,
  avg_net_burn_minor: 15_033_334,
  months: 3,
  collected_minor: 2_000_000,
  uncategorised: 0,
};

describe("usedCash", () => {
  it("uses an override typed on or after the statements' day", () => {
    const used = usedCash(TODAY, moneyRows([typed("INR", "2026-11-10", true)], TODAY), [FEED]);
    expect(used).toEqual([
      {
        currency: "INR",
        source: "typed",
        cash: 1_000_000,
        burn_per_month: 100_000,
        as_of: "2026-11-10",
        runway_months: 10,
        zero_on: null,
        gross_burn: null,
        months: 0,
      },
    ]);
  });

  it("else the statements, in whole units: cash floored, burn rounded up, runway from the paise", () => {
    // A plain typed entry, and an override older than the statements, both give way.
    for (const entries of [[typed("INR", "2026-11-10")], [typed("INR", "2026-10-20", true)]]) {
      const [used] = usedCash(TODAY, moneyRows(entries, TODAY), [FEED]);
      expect(used).toEqual({
        currency: "INR",
        source: "statements",
        cash: 1_200_000,
        burn_per_month: 150_334,
        as_of: "2026-10-31",
        runway_months: 7.9,
        zero_on: "2027-06-30",
        gross_burn: 175_000,
        months: 3,
      });
    }
  });

  it("else a typed entry as before, when the statements are more than 35 days old", () => {
    const old = { ...FEED, as_of: "2026-09-30" };
    const [used] = usedCash(TODAY, moneyRows([typed("INR", "2026-11-10")], TODAY), [old]);
    expect(used).toMatchObject({ source: "typed", as_of: "2026-11-10" });
  });

  it("else nothing, and the update keeps its old shape without statements", () => {
    expect(
      usedCash(TODAY, moneyRows([typed("INR", "2026-09-01")], TODAY), [
        { ...FEED, as_of: "2026-09-30" },
      ]),
    ).toEqual([]);
    const plain = updateCashOf(
      usedCash(TODAY, moneyRows([typed("USD", "2026-11-10")], TODAY), []),
      null,
    );
    expect(plain).toEqual([
      {
        currency: "USD",
        cash: 1_000_000,
        burn_per_month: 100_000,
        as_of: "2026-11-10",
        runway_months: 10,
        source: "typed",
      },
    ]);
  });
});

// ------------------------------------------------------------------ through the service

let stack: Stack;
const by = WALKER;
const SORT: [string, string][] = [
  ["CLOUD HOSTING", "walk-cat-hosting"],
  ["DATA LICENCE", "walk-cat-data"],
  ["OFFICE RENT", "walk-cat-rent"],
  ["WALK LEGAL LLP", "walk-cat-legal"],
  ["INTERN ONE STIPEND", "walk-cat-stipends"],
  ["SUBSCRIPTION", "walk-cat-subscriptions"],
];

beforeAll(async () => {
  stack = await startStack({
    env: true,
    modules: ["files", "replies", "waitlist", "numbers", "statements", "close"],
  });
  const seeded = await stack.ask("POST", "/data/_test/close/seed", { by, statements: true });
  const accountId = String((seeded.json!.statements as { account_id: string }).account_id);
  for (const month of ["2026-08", "2026-09", "2026-10"]) {
    const answer = await stack.ask(
      "GET",
      `/data/statements/accounts/${accountId}/lines?owner=1&month=${month}&view=all`,
    );
    for (const line of answer.json!.lines as { line_id: string; narration: string }[]) {
      const category = SORT.find(([words]) => line.narration.includes(words))?.[1];
      if (category)
        await stack.ask("POST", `/data/statements/lines/${line.line_id}/category`, {
          by,
          owner: true,
          category_id: category,
        });
    }
  }
}, 60_000);
afterAll(async () => {
  await stack.stop();
});

describe("Numbers, once a statement is imported", () => {
  it("carries the computed cash and what is used, read through the portal's own client", async () => {
    const page = await numbersApi.readNumbers();
    expect(page.money.statements_here).toBe(true);
    expect(page.money.computed).toEqual([
      expect.objectContaining({
        currency: "INR",
        cash_minor: 120_000_000,
        avg_net_burn_minor: 15_000_000,
        runway_months: 8,
        zero_on: "2027-07-01",
        words: "From the statements, on 3 months",
        last_whole: "2026-10",
      }),
    ]);
    expect(page.money.used).toEqual([
      expect.objectContaining({
        source: "statements",
        cash: 1_200_000,
        burn_per_month: 150_000,
        runway_months: 8,
      }),
    ]);
  });

  it("refuses to type over the statements without a reason, and keeps one as an override", async () => {
    const today = String((await stack.ask("GET", "/data/_test/day")).json!.day);
    const bare = await stack.ask("POST", "/data/numbers/money", {
      by,
      currency: "INR",
      cash: "1000000",
      burn_per_month: "100000",
      as_of: today,
      note: "",
    });
    expect([bare.status, codeOf(bare)]).toEqual([400, "invalid"]);
    expect((bare.json!.error as { message: string }).message).toBe(
      "The statements already give this figure. Say why you are typing over it.",
    );
    // USD has no statement: typing it needs no reason, as before.
    const dollars = await stack.ask("POST", "/data/numbers/money", {
      by,
      currency: "USD",
      cash: "20000",
      burn_per_month: "2500",
      as_of: today,
      note: "",
    });
    expect(dollars.status).toBe(200);
    expect(dollars.json!.entry).not.toHaveProperty("override");
    const over = await stack.ask("POST", "/data/numbers/money", {
      by,
      currency: "INR",
      cash: "1000000",
      burn_per_month: "100000",
      as_of: today,
      note: "A large payment cleared after the statement.",
    });
    expect(over.json!.entry).toMatchObject({ override: true });
    const page = await numbersApi.readNumbers();
    expect(page.money.used.find((row) => row.currency === "INR")).toMatchObject({
      source: "typed",
      cash: 1_000_000,
    });
  });

  it("feeds a frozen month's update from its MIS, and the two agree", async () => {
    for (const key of [
      "statements",
      "sales_invoices",
      "bills",
      "stipend_sheet",
      "tds_challans",
      "gst_returns",
      "firas",
    ])
      await stack.ask("POST", `/data/close/2026-10/items/${key}`, { by, state: "ready" });
    await stack.ask("POST", "/data/close/2026-10/sent", {
      by,
      on: "2026-11-06",
      to_name: "Walk CA",
    });
    expect((await stack.ask("POST", "/data/close/2026-10/lock", { by })).status).toBe(200);
    const update = await numbersApi.readUpdate("2026-10");
    expect(update.numbers.cash).toEqual([
      {
        currency: "INR",
        cash: 1_200_000,
        burn_per_month: 150_000,
        as_of: "2026-10-31",
        runway_months: 8,
        source: "mis",
        gross_burn: 175_000,
        zero_on: "2027-07-01",
        months: 3,
      },
    ]);
    const mis = (await stack.ask("GET", "/data/close/2026-10/mis")).json!.mis as {
      burn: { cash_minor: number; avg_net_minor: number; runway_months: number }[];
    };
    expect(update.numbers.cash[0]!.cash * 100).toBe(mis.burn[0]!.cash_minor);
    expect(update.numbers.cash[0]!.burn_per_month * 100).toBe(mis.burn[0]!.avg_net_minor);
    expect(update.numbers.cash[0]!.runway_months).toBe(mis.burn[0]!.runway_months);
    expect(update.text).toContain(
      "- Cash: ₹1,200,000 on 31 Oct 2026, monthly burn ₹150,000, runway 8.0 months",
    );
    await numbersApi.freezeUpdate("2026-10", by);
    expect((await numbersApi.readUpdate("2026-10")).numbers.cash[0]).toMatchObject({
      source: "mis",
    });
  });
});
