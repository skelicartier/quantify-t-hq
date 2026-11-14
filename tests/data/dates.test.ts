// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addDays, localDay } from "../../scripts/data/days";
import { addMonths, inWindow, nextDue, shownState } from "../../scripts/data/dates/book";
import { CATALOGUE, CHECKED_ON, catalogueItem } from "../../scripts/data/dates/catalogue";
import { WALKER, codeOf, startStack, until, type Stack } from "./helpers";

/**
 * Key dates: the suggested catalogue worked out for 10 Nov 2026 (K1), nothing added until
 * "Add it" (K2), "Done" moving a repeating date on and keeping its history (K3), and a date
 * inside its reminder window in the overview's Due (K4). Every rule here says it was
 * checked on 10 Nov 2026 and is a suggestion to check with the CA.
 */

const DAY = "2026-11-10";
const next = (key: string, today = DAY, agm: string | null = null) =>
  catalogueItem(key)!.next(today, { agm_on: agm });

describe("the suggested catalogue, for 10 Nov 2026 (K1)", () => {
  it("GSTR-1 on 11 Nov, MGT-7A on 29 Nov for an AGM on 30 Sep, the company ITR on 21 Nov", () => {
    expect(next("gstr-1")).toBe("2026-11-11");
    expect(next("mgt-7a", DAY, "2026-09-30")).toBe("2026-11-29");
    expect(next("company-itr")).toBe("2026-11-21");
  });

  it("the other monthly, quarterly and yearly dates", () => {
    expect(next("gstr-3b")).toBe("2026-11-20");
    expect(next("tds-deposit")).toBe("2026-12-07");
    expect(next("advance-tax")).toBe("2026-12-15");
    expect(next("tds-returns")).toBe("2027-01-31");
    expect(next("gstr-3b-quarterly")).toBe("2027-01-24");
    expect(next("gstr-9")).toBe("2026-12-31");
    expect(next("board-second-half")).toBe("2026-12-31");
    expect(next("board-first-half")).toBe("2027-06-30");
    expect(next("agm")).toBe("2027-09-30");
    expect(next("lut")).toBe("2027-03-31");
    expect(next("msme-1-april")).toBe("2027-04-30");
    expect(next("msme-1-october")).toBe("2027-10-31");
    expect(next("dpt-3")).toBe("2027-06-30");
  });

  it("AGM + 15 and + 30 from the AGM, and nothing without it", () => {
    expect(next("adt-1", DAY, "2026-09-30")).toBe("2026-10-15");
    expect(next("aoc-4", DAY, "2026-09-30")).toBe("2026-10-30");
    expect(next("mgt-7a")).toBeNull();
    expect(next("aoc-4")).toBeNull();
  });

  it("DIR-3 KYC every third year: next 30 Jun 2028", () => {
    expect(next("dir-3-kyc")).toBe("2028-06-30");
    expect(next("dir-3-kyc", "2028-07-01")).toBe("2031-06-30");
  });

  it("the TDS deposit for March is due 30 Apr, and the quarter after next", () => {
    expect(next("tds-deposit", "2027-03-08")).toBe("2027-04-30");
    expect(next("tds-deposit", "2027-05-01")).toBe("2027-05-07");
    expect(next("tds-returns", "2027-02-01")).toBe("2027-05-31");
    expect(next("company-itr", "2026-11-22")).toBe("2027-10-31");
  });

  it("renewals are dates he types; every rule says what it is and who it is for", () => {
    for (const key of ["domain", "mailbox", "mail-plan", "director-dsc", "trademark"])
      expect(next(key)).toBeNull();
    for (const item of CATALOGUE) {
      expect(item.key).toMatch(/^[a-z0-9-]+$/);
      expect(item.rule.length).toBeGreaterThan(2);
      expect(item.applies.length).toBeGreaterThan(2);
    }
    expect(CHECKED_ON).toBe("2026-11-10");
    expect(new Set(CATALOGUE.map((item) => item.key)).size).toBe(CATALOGUE.length);
  });
});

describe("a date's next due day and state, worked by hand", () => {
  it("monthly on the day it was first due, quarterly and yearly by their step (K3)", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    const date = { repeats: "monthly" as const, from_suggestion: null, history: [] };
    expect(nextDue({ ...date, due_on: "2026-11-11" }, { agm_on: null })).toBe("2026-12-11");
    expect(
      nextDue(
        { ...date, due_on: "2026-02-28", history: [{ due_on: "2026-01-31" }] as never },
        { agm_on: null },
      ),
    ).toBe("2026-03-31");
    expect(nextDue({ ...date, repeats: "quarterly", due_on: "2026-11-30" }, { agm_on: null })).toBe(
      "2027-02-28",
    );
    expect(nextDue({ ...date, repeats: "yearly", due_on: "2026-11-21" }, { agm_on: null })).toBe(
      "2027-11-21",
    );
    expect(
      nextDue({ ...date, repeats: "never", due_on: "2026-11-21" }, { agm_on: null }),
    ).toBeNull();
  });

  it("a suggested rule works its own next date out", () => {
    const tds = { repeats: "monthly" as const, from_suggestion: "tds-deposit", history: [] };
    expect(nextDue({ ...tds, due_on: "2027-03-07" }, { agm_on: null })).toBe("2027-04-30");
    const itr = { repeats: "yearly" as const, from_suggestion: "company-itr", history: [] };
    expect(nextDue({ ...itr, due_on: "2026-11-21" }, { agm_on: null })).toBe("2027-10-31");
    const mgt = { repeats: "yearly" as const, from_suggestion: "mgt-7a", history: [] };
    expect(nextDue({ ...mgt, due_on: "2026-11-29" }, { agm_on: "2026-09-30" })).toBe("2027-11-29");
  });

  it("due this week within seven days, and in the reminder window from its first day", () => {
    const date = (due_on: string, remind_days: 0 | 2 | 7 | 14 = 7) => ({
      state: "coming_up" as const,
      due_on,
      remind_days,
    });
    expect(shownState(date("2026-11-16"), DAY)).toBe("due_this_week");
    expect(shownState(date("2026-11-17"), DAY)).toBe("coming_up");
    expect(shownState(date("2026-11-01"), DAY)).toBe("due_this_week");
    expect(inWindow(date("2026-11-17"), DAY)).toBe(true);
    expect(inWindow(date("2026-11-18"), DAY)).toBe(false);
    expect(inWindow(date("2026-11-10", 0), DAY)).toBe(true);
    expect(inWindow(date("2026-11-11", 0), DAY)).toBe(false);
    expect(inWindow({ ...date("2026-11-11"), state: "done" as never }, DAY)).toBe(false);
  });
});

describe("Key dates on the real stack", () => {
  let stack: Stack;
  const today = () => localDay(new Date());
  type Body = Record<string, unknown>;

  beforeAll(async () => {
    stack = await startStack();
  }, 60_000);
  afterAll(() => stack.stop());

  const dates = async (view = "upcoming") =>
    (await stack.ask("GET", `/data/dates?view=${view}`)).json!;

  it("starts with no dates and every suggestion, none of them added (K2)", async () => {
    const page = await dates("all");
    expect(page.dates).toEqual([]);
    const suggestions = page.suggestions as {
      key: string;
      next: string | null;
      checked_on: string;
    }[];
    expect(suggestions).toHaveLength(CATALOGUE.length);
    expect(suggestions.every((item) => item.checked_on === "2026-11-10")).toBe(true);
    expect(suggestions.find((item) => item.key === "gstr-1")!.next).toBe(next("gstr-1", today()));
    const overview = (await stack.ask("GET", "/data/overview")).json!;
    expect((overview.due as Body[]).filter((item) => item.kind === "key_date")).toEqual([]);
  });

  it("adds a suggestion only when asked, and it leaves the suggestions", async () => {
    const added = await stack.ask("POST", "/data/dates/suggested/gstr-1/add", { by: WALKER });
    expect(added.status).toBe(200);
    expect(added.json!.date).toMatchObject({
      title: "GSTR-1 (monthly filers)",
      kind: "filing",
      repeats: "monthly",
      from_suggestion: "gstr-1",
      due_on: next("gstr-1", today()),
      entity: "The Indian company",
    });
    const again = await stack.ask("POST", "/data/dates/suggested/gstr-1/add", { by: WALKER });
    expect(codeOf(again)).toBe("already_added");
    const keys = ((await dates()).suggestions as { key: string }[]).map((item) => item.key);
    expect(keys).not.toContain("gstr-1");
    expect(keys).toContain("gstr-3b");
  });

  it("works the AGM-based dates out from the AGM date", async () => {
    const without = await stack.ask("POST", "/data/dates/suggested/mgt-7a/add", { by: WALKER });
    expect(without.status).toBe(400);
    const facts = await stack.ask("POST", "/data/dates/facts", {
      agm_on: "2026-09-30",
      by: WALKER,
    });
    expect(facts.json!.facts).toEqual({ agm_on: "2026-09-30" });
    const mgt = ((await dates()).suggestions as { key: string; next: string | null }[]).find(
      (item) => item.key === "mgt-7a",
    );
    expect(mgt!.next).toBe("2026-11-29");
    const future = await stack.ask("POST", "/data/dates/facts", {
      agm_on: addDays(today(), 3),
      by: WALKER,
    });
    expect(future.status).toBe(400);
  });

  it("puts a date inside its reminder window in Due, and Done moves a monthly one on (K3, K4)", async () => {
    const soon = addDays(today(), 3);
    const added = await stack.ask("POST", "/data/dates", {
      title: "Invented monthly filing",
      kind: "filing",
      due_on: soon,
      repeats: "monthly",
      entity: "The Indian company",
      handled_by: "The CA",
      remind_days: 7,
      notes: "Invented for the test.",
      attempt: crypto.randomUUID(),
      by: WALKER,
    });
    expect(added.status).toBe(200);
    const date = added.json!.date as Body;
    expect(date).toMatchObject({ shown_state: "due_this_week", reminding: true, overdue: false });
    const due = (await stack.ask("GET", "/data/overview")).json!.due as Body[];
    expect(due).toContainEqual(
      expect.objectContaining({
        kind: "key_date",
        title: "Invented monthly filing",
        due_on: soon,
        sub: "Filing · The Indian company · The CA",
        href: `/data/dates#date-${String(date.date_id)}`,
      }),
    );
    const far = await stack.ask("POST", "/data/dates", {
      title: "Invented far filing",
      kind: "filing",
      due_on: addDays(today(), 30),
      repeats: "never",
      remind_days: 14,
      by: WALKER,
    });
    expect(far.status).toBe(200);
    const due2 = (await stack.ask("GET", "/data/overview")).json!.due as Body[];
    expect(due2.some((item) => item.title === "Invented far filing")).toBe(false);

    const done = await stack.ask("POST", `/data/dates/${String(date.date_id)}/done`, {
      note: "Filed by the CA.",
      by: WALKER,
    });
    expect(done.status).toBe(200);
    const rolled = done.json!.date as Body;
    expect(rolled).toMatchObject({ state: "coming_up", due_on: addMonths(soon, 1) });
    expect(rolled.history).toEqual([
      expect.objectContaining({ due_on: soon, note: "Filed by the CA.", by: WALKER }),
    ]);
  });

  it("a one-off Done stays done; Not for us, putting it back, editing and deleting", async () => {
    const one = (
      await stack.ask("POST", "/data/dates", {
        title: "Invented one-off",
        kind: "other",
        due_on: addDays(today(), 10),
        repeats: "never",
        remind_days: 2,
        by: WALKER,
      })
    ).json!.date as Body;
    const path = `/data/dates/${String(one.date_id)}`;
    const done = (await stack.ask("POST", `${path}/done`, { by: WALKER })).json!.date as Body;
    expect(done).toMatchObject({ state: "done", shown_state: "done" });
    expect(((await dates("done")).dates as Body[]).map((item) => item.title)).toContain(
      "Invented one-off",
    );
    const again = await stack.ask("POST", `${path}/done`, { by: WALKER });
    expect(again.status).toBe(409);
    const back = (await stack.ask("POST", `${path}/update`, { state: "coming_up", by: WALKER }))
      .json!.date as Body;
    expect(back.state).toBe("coming_up");
    const edited = (
      await stack.ask("POST", `${path}/update`, {
        title: "Invented one-off, renamed",
        handled_by: "Walk Owner",
        by: WALKER,
      })
    ).json!.date as Body;
    expect(edited).toMatchObject({ title: "Invented one-off, renamed", handled_by: "Walk Owner" });
    const nope = (
      await stack.ask("POST", `${path}/not-for-us`, { note: "No GST yet.", by: WALKER })
    ).json!.date as Body;
    expect(nope).toMatchObject({ state: "not_for_us", state_note: "No GST yet." });
    expect((await stack.ask("POST", `${path}/delete`, { by: WALKER })).status).toBe(200);
    expect((await stack.ask("POST", `${path}/done`, { by: WALKER })).status).toBe(404);
  });

  it("refuses what is not a date, a key in the notes, and an unknown file", async () => {
    const add = (body: Body) => stack.ask("POST", "/data/dates", { by: WALKER, ...body });
    expect((await add({ kind: "filing", due_on: today() })).status).toBe(400);
    expect((await add({ title: "X", kind: "filing", due_on: "2026-02-30" })).status).toBe(400);
    expect(
      (await add({ title: "X", kind: "filing", due_on: today(), remind_days: 3 })).status,
    ).toBe(400);
    expect(
      codeOf(await add({ title: "X", kind: "filing", due_on: today(), notes: "xkeysib-abc" })),
    ).toBe("secret");
    expect(
      (await add({ title: "X", kind: "filing", due_on: today(), file_id: "not-a-file" })).status,
    ).toBe(400);
  });

  it("downloads the dates as a CSV, the sheet for the CA", async () => {
    const made = await stack.ask("POST", "/data/builds", { kind: "dates_csv", by: WALKER });
    const buildId = String((made.json!.build as Body).build_id);
    await until(
      async () =>
        ((await stack.ask("GET", `/data/builds/${buildId}`)).json!.build as Body).state === "ready",
      "the CSV",
    );
    const file = await stack.raw(stack.socket, "GET", `/data/builds/${buildId}/bytes`);
    const lines = file.bytes.toString("utf8").split("\r\n").filter(Boolean);
    expect(lines[0]).toBe(
      "﻿due_on,what,kind,repeats,company,handled_by,remind_days_before,state,notes,file,suggested_rule,last_done,rule,source,checked_on,confirmed_by,owner,srn,challan,filed_on,fee_paid,filed_copy,not_for_us_signed_off_by,from_record",
    );
    expect(lines.some((line) => line.includes("GSTR-1 (monthly filers)"))).toBe(true);
  });
});
