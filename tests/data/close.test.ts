// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeDayOf, dueMonths } from "../../scripts/data/close/due";
import {
  dutyRuleOf,
  dutyStateOf,
  standInHolidays,
  type HolidayView,
} from "../../scripts/data/duties-contracts";
import { WALKER, codeOf, startStack, type Stack } from "./helpers";

/**
 * The month's close (ws-notes/duties/spec.md §5.5, §9.7, §9.12): the seven rows' facts; the
 * lock refused while a row is open, before the pack is sent and before the month is over;
 * the lock, `month-lock` refusing an October change, and reopening with a reason; the
 * close's days of §5.5 through the stand-in holidays; Due's three-month cap. The walk's
 * statement, bill and intern are invented; Money and the people ledger are stand-ins.
 */

const closeBy = dutyStateOf(dutyRuleOf("close-by"), {}, "2026-11-19");
const holiday = (on: string): HolidayView => ({ on, name: "Walk holiday", kind: "company" });

describe("the close's day (§5.5)", () => {
  it("is five working days after the month's last day, moved by holidays", () => {
    const none = standInHolidays();
    expect(closeDayOf("2026-10", none, closeBy)).toBe("2026-11-06");
    expect(closeDayOf("2026-10", standInHolidays([holiday("2026-11-04")]), closeBy)).toBe(
      "2026-11-09",
    );
    expect(closeDayOf("2026-12", none, closeBy)).toBe("2027-01-07");
    expect(closeDayOf("2026-12", standInHolidays([holiday("2027-01-01")]), closeBy)).toBe(
      "2027-01-08",
    );
    expect(closeDayOf("2027-01", none, closeBy)).toBe("2027-02-05");
    // An optional holiday is not a day off.
    expect(
      closeDayOf(
        "2026-10",
        standInHolidays([{ ...holiday("2026-11-04"), kind: "optional" }]),
        closeBy,
      ),
    ).toBe("2026-11-06");
    expect(closeDayOf("2026-10", none, null)).toBeNull();
  });

  it("is owed for the last three months that are over and not locked, never before the first", () => {
    expect(dueMonths("2026-11-19", "2026-01", () => false)).toEqual([
      "2026-10",
      "2026-09",
      "2026-08",
    ]);
    expect(dueMonths("2026-11-19", "2026-09", () => false)).toEqual(["2026-10", "2026-09"]);
    expect(dueMonths("2026-11-19", "2026-01", (period) => period === "2026-09")).toEqual([
      "2026-10",
      "2026-08",
    ]);
    expect(dueMonths("2026-11-19", null, () => false)).toEqual([]);
  });
});

let stack: Stack;
const by = WALKER;

type CloseAnswer = {
  close: {
    items: Record<string, { state: string }>;
    sent: unknown;
    locked: unknown;
    history: { verb: string; why: string }[];
  };
  facts: Record<string, string[]>;
  due_on: string | null;
  can_lock: boolean;
  cannot_lock_because: string[];
  state: string;
};

const read = async (period: string, owner = false) =>
  (await stack.ask("GET", `/data/close/${period}${owner ? "?owner=1" : ""}`))
    .json as unknown as CloseAnswer;

beforeAll(async () => {
  stack = await startStack({ modules: ["files", "numbers", "statements", "close"] });
  const seeded = await stack.ask("POST", "/data/_test/close/seed", { by, statements: true });
  expect(seeded.json).toMatchObject({
    installed: ["duty-rules", "money", "people-pay"],
    statements: { imported: true },
  });
}, 60_000);
afterAll(async () => {
  await stack.stop();
});

describe("the seven rows", () => {
  it("lists the months from the first statement, October due on 6 Nov 2026", async () => {
    const months = (await stack.ask("GET", "/data/close")).json as {
      months: { period: string; due_on: string | null; state: string; ready: number }[];
      fallback_days: boolean;
    };
    const october = months.months.find((month) => month.period === "2026-10");
    expect(october).toMatchObject({ due_on: "2026-11-06", state: "open", ready: 0 });
    expect(months.months.at(-1)?.period).toBe("2026-08");
    expect(months.fallback_days).toBe(true);
  });

  it("shows each row's facts, the stipend's figures to the Owner only", async () => {
    const owner = await read("2026-10", true);
    expect(owner.facts).toEqual({
      statements: ["1 of 1 account is covered for the whole month.", "6 lines have no category."],
      sales_invoices: ["0 export invoices recorded."],
      bills: ["1 bill, 1 without a copy."],
      stipend_sheet: ["1 payment, ₹15,000."],
      tds_challans: ["0 challans."],
      gst_returns: [],
      firas: ["0 FIRAs."],
    });
    const admin = await read("2026-10");
    expect(admin.facts.stipend_sheet).toEqual([
      "In the people ledger, which is for the Owner only.",
    ]);
    expect(JSON.stringify(admin)).not.toContain("15,000");
    expect(JSON.stringify(admin)).not.toContain("Walk Intern One");
  });
});

describe("the lock", () => {
  it("is refused while a row is open, before the pack is sent, and before the month is over", async () => {
    const first = await read("2026-10");
    expect(first.can_lock).toBe(false);
    expect(first.cannot_lock_because).toEqual([
      "Statements for every bank and card account is still open.",
      "Sales invoices is still open.",
      "Purchase bills is still open.",
      "Stipend sheet is still open.",
      "TDS challans is still open.",
      "GST returns is still open.",
      "FIRAs is still open.",
      "Record that the pack was sent first.",
    ]);
    const refused = await stack.ask("POST", "/data/close/2026-10/lock", { by });
    expect([refused.status, codeOf(refused)]).toEqual([409, "cannot_lock"]);
    for (const key of ["statements", "bills", "stipend_sheet"])
      await stack.ask("POST", `/data/close/2026-10/items/${key}`, { by, state: "ready" });
    for (const key of ["sales_invoices", "tds_challans", "firas"])
      await stack.ask("POST", `/data/close/2026-10/items/${key}`, { by, state: "none_this_month" });
    const gst = await stack.ask("POST", "/data/close/2026-10/items/gst_returns", {
      by,
      state: "not_registered",
      note: "Not registered yet.",
    });
    expect((gst.json as { ready: number }).ready).toBe(7);
    expect((await read("2026-10")).cannot_lock_because).toEqual([
      "Record that the pack was sent first.",
    ]);
    const early = await stack.ask("POST", "/data/close/2026-10/acknowledged", {
      by,
      on: "2026-11-07",
      by_name: "Walk CA",
    });
    expect(early.status).toBe(409);
    const future = await stack.ask("POST", "/data/close/2026-10/sent", {
      by,
      on: "2099-01-01",
      to_name: "Walk CA",
    });
    expect(future.status).toBe(400);
    const sent = await stack.ask("POST", "/data/close/2026-10/sent", {
      by,
      on: "2026-11-06",
      to_name: "Walk CA",
      how: "Email",
    });
    expect((sent.json as { state: string }).state).toBe("sent");
    const november = await read("2026-11");
    expect(november.cannot_lock_because).toContain("November 2026 is not over yet.");
  });

  it("locks October: month-lock refuses its lines and statements; a reason reopens it", async () => {
    const locked = await stack.ask("POST", "/data/close/2026-10/lock", { by });
    expect(locked.status).toBe(200);
    expect((await read("2026-10")).state).toBe("locked");
    const words =
      "October 2026 is locked. Reopen it on Month close, with a reason, to change this.";
    const changed = await stack.ask("POST", "/data/close/2026-10/items/bills", {
      by,
      note: "late",
    });
    expect([changed.status, codeOf(changed)]).toEqual([409, "month_locked"]);
    const listed = (await stack.ask("GET", "/data/statements?owner=1")).json as {
      accounts: { account_id: string; statements: { statement_id: string }[] }[];
    };
    const account = listed.accounts[0]!;
    const withdraw = await stack.ask(
      "POST",
      `/data/statements/${account.statements[0]!.statement_id}/withdraw`,
      { by, owner: true, why: "A test of the lock." },
    );
    expect([withdraw.status, codeOf(withdraw)]).toEqual([409, "month_locked"]);
    expect(JSON.stringify(withdraw.json)).toContain(words);
    const lines = (
      await stack.ask(
        "GET",
        `/data/statements/accounts/${account.account_id}/lines?owner=1&month=2026-10&view=all`,
      )
    ).json as {
      lines: { line_id: string; suggestions: unknown[] }[];
      locked: boolean;
      lock_words: string;
    };
    expect(lines).toMatchObject({ locked: true, lock_words: words });
    expect(lines.lines.every((line) => line.suggestions.length === 0)).toBe(true);
    const category = await stack.ask(
      "POST",
      `/data/statements/lines/${lines.lines[0]!.line_id}/category`,
      {
        by,
        owner: true,
        category_id: "walk-cat-hosting",
      },
    );
    expect([category.status, codeOf(category)]).toEqual([409, "month_locked"]);
    // September is not locked.
    const september = (
      await stack.ask(
        "GET",
        `/data/statements/accounts/${account.account_id}/lines?owner=1&month=2026-09&view=all`,
      )
    ).json as { lines: { line_id: string }[] };
    const ok = await stack.ask(
      "POST",
      `/data/statements/lines/${september.lines[0]!.line_id}/category`,
      {
        by,
        owner: true,
        category_id: "walk-cat-hosting",
      },
    );
    expect(ok.status).toBe(200);

    const bare = await stack.ask("POST", "/data/close/2026-10/reopen", { by, why: "oops" });
    expect(bare.status).toBe(400);
    const reopened = await stack.ask("POST", "/data/close/2026-10/reopen", {
      by,
      why: "The hosting bill was booked to the wrong month.",
    });
    expect(reopened.status).toBe(200);
    const after = await read("2026-10");
    expect(after.state).toBe("sent");
    expect(after.close.history.map((line) => line.verb)).toEqual(["sent", "locked", "reopened"]);
    expect(after.close.history.at(-1)?.why).toBe("The hosting bill was booked to the wrong month.");
    const now = await stack.ask(
      "POST",
      `/data/statements/lines/${lines.lines[0]!.line_id}/category`,
      {
        by,
        owner: true,
        category_id: "walk-cat-hosting",
      },
    );
    expect(now.status).toBe(200);
  });

  it("moves October's close with a holiday on 4 Nov 2026", async () => {
    const days = await stack.ask("POST", "/data/_test/close/holidays", {
      by,
      days: [{ on: "2026-11-04", name: "Walk holiday", kind: "company" }],
    });
    expect(days.json).toMatchObject({ installed: true });
    expect((await read("2026-10")).due_on).toBe("2026-11-09");
    await stack.ask("POST", "/data/_test/close/holidays", { by, on: false });
    expect((await read("2026-10")).due_on).toBe("2026-11-06");
  });

  it("gives Due one row a month that is over and not locked, never naming anyone", async () => {
    const overview = await stack.ask("GET", "/data/overview?owner=1");
    const due = (
      overview.json!.due as { kind: string; title: string; sub: string; due_on: string }[]
    ).filter((item) => item.kind === "close");
    expect(due.map((item) => item.title)).toEqual([
      "Close August 2026 and send the CA's pack",
      "Close September 2026 and send the CA's pack",
      "Close October 2026 and send the CA's pack",
    ]);
    expect(due.find((item) => item.title.includes("October"))?.sub).toBe("7 of 7 ready");
    expect(JSON.stringify(due)).not.toMatch(/Walk Intern|15,000|%/);
  });
});
