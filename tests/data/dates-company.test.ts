// @vitest-environment node
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { MODULES } from "../../scripts/data/core";
import { addDays, localDay } from "../../scripts/data/days";
import {
  boardEarliest,
  boardHalf,
  catalogueItem,
  firstAgm,
  nextAgm,
  workOut,
  type Facts,
} from "../../scripts/data/dates/catalogue";
import { plainOf } from "../../scripts/data/dates/agenda";
import { kycDue } from "../../scripts/data/dates/facts";
import { firstFyEndOptions } from "../../src/lib/data/labels-company";
import { WALKER, codeOf, startStack, until, type Stack } from "./helpers";

/**
 * Key dates learning the company record (company spec §5.2, §6.5, §6.6, §6.10): the first
 * financial year's ends, the first and next AGM, the AGM-based filings, MGT-7A's title,
 * INC-20A, both board rules, each director's DIR-3 KYC and DSC rows, the rows the facts
 * hide; evidence, in progress, not for us with and without the sign-off, the rule book,
 * `key-dates`, late fees, the CSV's new columns, the migration of today's dates, and the
 * agenda's kinds-only title. Every name and number is invented.
 */

type Body = Record<string, unknown>;
const today = () => localDay(new Date());
const NO: Facts = { agm_on: null };

describe("the company's days, by hand (§5.2)", () => {
  it("offers the first financial year's ends the law allows", () => {
    expect(firstFyEndOptions("2025-08-14")).toEqual(["2026-03-31"]);
    expect(firstFyEndOptions("2025-12-31")).toEqual(["2026-03-31"]);
    expect(firstFyEndOptions("2026-01-01")).toEqual(["2026-03-31", "2027-03-31"]);
    expect(firstFyEndOptions("2026-02-20")).toEqual(["2026-03-31", "2027-03-31"]);
    expect(firstFyEndOptions("2026-04-01")).toEqual(["2027-03-31"]);
    expect(firstFyEndOptions(null)).toEqual([]);
  });

  it("puts the first AGM 9 months after the first year, and the next one by the earlier rule", () => {
    expect(firstAgm("2026-03-31", NO)).toBe("2026-12-31");
    expect(firstAgm("2027-03-31", NO)).toBe("2027-12-31");
    expect(nextAgm("2026-12-20", NO)).toBe("2027-09-30");
    expect(nextAgm("2027-09-30", NO)).toBe("2028-09-30");
    expect(nextAgm("2027-04-01", NO)).toBe("2028-07-01");
    expect(nextAgm("2028-02-29", NO)).toBe("2028-09-30");
    const agm = catalogueItem("agm")!;
    expect(agm.next("2026-11-13", NO)).toBe("2027-09-30");
    const first = workOut(agm, "2026-11-13", { agm_on: null, first_fy_end: "2026-03-31" });
    expect(first).toMatchObject({
      next: "2026-12-31",
      rule_key: "first-agm",
      from_fact: "From the first financial year ending 31 Mar 2026",
      base_on: "2026-03-31",
    });
    expect(workOut(agm, "2026-11-13", { agm_on: "2026-12-20" }).from_fact).toBe(
      "From the AGM held 20 Dec 2026",
    );
    expect(firstAgm("2026-03-31", { agm_on: null, amounts: { "first-agm": 6 } })).toBe(
      "2026-09-30",
    );
  });

  it("counts AOC-4, MGT-7A and ADT-1 from the last AGM, and names MGT-7A by the small flag", () => {
    const at = (key: string, agm: string, facts: Partial<Facts> = {}) =>
      catalogueItem(key)!.next("2026-11-13", { agm_on: agm, ...facts });
    expect([
      at("adt-1", "2026-09-30"),
      at("aoc-4", "2026-09-30"),
      at("mgt-7a", "2026-09-30"),
    ]).toEqual(["2026-10-15", "2026-10-30", "2026-11-29"]);
    expect([
      at("adt-1", "2026-12-31"),
      at("aoc-4", "2026-12-31"),
      at("mgt-7a", "2026-12-31"),
    ]).toEqual(["2027-01-15", "2027-01-30", "2027-03-01"]);
    expect(at("mgt-7a", "2027-12-31")).toBe("2028-02-29");
    expect([
      at("adt-1", "2026-12-20"),
      at("aoc-4", "2026-12-20"),
      at("mgt-7a", "2026-12-20"),
    ]).toEqual(["2027-01-04", "2027-01-19", "2027-02-18"]);
    expect(at("aoc-4", "2026-12-20", { amounts: { "aoc-4": 45 } })).toBe("2027-02-03");
    const mgt = catalogueItem("mgt-7a")!;
    expect(workOut(mgt, "2026-11-13", { agm_on: null, small: "yes" }).title).toBe(
      "MGT-7A (annual return)",
    );
    expect(workOut(mgt, "2026-11-13", { agm_on: null, small: "no" }).title).toBe(
      "MGT-7 (annual return)",
    );
    expect(workOut(mgt, "2026-11-13", NO).title).toBe("MGT-7A or MGT-7 (annual return)");
  });

  it("puts INC-20A 180 days after incorporation, and not for a company before 2 Nov 2018", () => {
    const inc = catalogueItem("inc-20a")!;
    expect(inc.next("2026-11-13", { agm_on: null, incorporated_on: "2025-08-14" })).toBe(
      "2026-02-10",
    );
    expect(inc.next("2026-11-13", { agm_on: null, incorporated_on: "2027-09-03" })).toBe(
      "2028-03-01",
    );
    expect(inc.next("2026-11-13", NO)).toBeNull();
    expect(workOut(inc, "2026-11-13", NO).needs).toBe("Needs the incorporation day on Company.");
    expect(inc.hidden({ agm_on: null, incorporated_on: "2018-11-01" })).toBe(
      "Incorporated before 2 Nov 2018, so it does not apply.",
    );
    expect(inc.hidden({ agm_on: null, incorporated_on: "2018-11-02" })).toBeNull();
  });

  it("moves the half-year board rows and says the earliest day; four a year for other companies", () => {
    const facts = (last: string): Facts => ({ agm_on: null, last_board_on: last });
    expect(boardHalf("second", "2026-11-13", facts("2026-11-02"))).toBe("2027-12-31");
    expect(boardHalf("first", "2026-11-13", facts("2026-11-02"))).toBe("2027-06-30");
    expect(boardEarliest("first", "2026-11-13", facts("2026-11-02"))).toBe("2027-01-31");
    expect(boardEarliest("second", "2027-05-01", facts("2027-04-20"))).toBe("2027-07-19");
    expect(boardEarliest("second", "2027-06-29", facts("2027-06-28"))).toBe("2027-09-26");
    expect(boardHalf("second", "2026-11-13", NO)).toBe("2026-12-31");
    const other = catalogueItem("board-gap-120")!;
    const company = { agm_on: null, small: "no" as const, startup: "no" as const };
    expect(other.next("2026-11-13", { ...company, last_board_on: "2026-11-02" })).toBe(
      "2027-03-02",
    );
    expect(workOut(other, "2026-11-13", company).needs).toBe(
      "Record your last board meeting in Meetings to work this out.",
    );
    expect(other.hidden(company)).toBeNull();
    expect(other.hidden({ agm_on: null, small: "yes" })).not.toBeNull();
    expect(catalogueItem("board-first-half")!.hidden(company)).toBe(
      "Four board meetings a year apply instead.",
    );
  });

  it("works each director's DIR-3 KYC out by the table", () => {
    const kyc = (last: string | null, allotted: string | null, facts: Facts = NO) =>
      kycDue(
        { name: "Walk Director", kyc: { last_filed_on: last, srn: "" }, din_allotted_on: allotted },
        facts,
      ).due_on;
    expect(kyc("2025-09-15", "2024-01-01")).toBe("2028-06-30");
    expect(kyc("2028-06-10", null)).toBe("2031-06-30");
    expect(kyc(null, "2025-10-01")).toBe("2029-06-30");
    expect(kyc(null, "2026-05-20")).toBe("2030-06-30");
    expect(kyc("2024-09-30", "2025-10-01")).toBeNull();
    expect(kyc(null, "2024-06-01")).toBeNull();
    expect(kyc("2025-09-15", null, { agm_on: null, amounts: { "dir-3-kyc": 2 } })).toBe(
      "2027-06-30",
    );
  });

  it("names no firm in a record's date on the calendar", () => {
    expect(
      plainOf({
        title: "PAS-3: allotment to Walk Fund 281",
        rule_key: "pas-3",
        origin: { key: "closing:x", label: "Allotment to Walk Fund 281", href: "/data" },
      }),
    ).toBe("PAS-3 (return of allotment)");
    expect(plainOf({ title: "Invented filing", rule_key: null, origin: null })).toBe(
      "Invented filing",
    );
    expect(
      plainOf({
        title: "Director's DSC: Walk Director",
        rule_key: null,
        origin: { key: "company:x:dsc", label: "Director: Walk Director", href: "/data" },
      }),
    ).toBe("Director's DSC");
  });
});

describe("Key dates and the company record on the real stack", () => {
  let stack: Stack;
  beforeAll(async () => {
    // Every module but meetings, as in the copy this was written in: the fake `meetings` of
    // `POST /data/_test/dates/meetings` installs only while the real one is absent. The real
    // meetings module's path is checked in company-merged.test.ts.
    stack = await startStack({ modules: MODULES.filter((name) => name !== "meetings") });
  }, 60_000);
  afterAll(() => stack.stop());

  const datesPage = async (view = "upcoming") =>
    (await stack.ask("GET", `/data/dates?view=${view}`)).json!;
  const suggestion = async (key: string) =>
    ((await datesPage()).suggestions as Body[]).find((row) => row.key === key);
  const message = (answer: { json: Body | null }) =>
    String(((answer.json?.error ?? {}) as Body).message ?? "");
  const testCall = (call: string, args: unknown[]) =>
    stack.ask("POST", "/data/_test/key-dates", { call, args, by: WALKER });

  it("with no facts, every row as before, nothing worked out from the record", async () => {
    const page = await datesPage();
    expect(page.facts_known).toBe(false);
    expect(page.hidden).toEqual([]);
    const agm = (page.suggestions as Body[]).find((row) => row.key === "agm")!;
    expect(agm).toMatchObject({ group: "yearly", from_fact: null, rule_key: "agm" });
    expect(agm.source_url).toMatch(/^https:\/\//);
    expect((page.suggestions as Body[]).some((row) => row.key === "board-gap-120")).toBe(false);
  });

  it("works the first AGM, INC-20A and each director's rows out once the facts are in", async () => {
    await stack.ask("POST", "/data/company/facts", {
      group: "dates",
      incorporated_on: "2025-08-14",
      first_fy_end: "2026-03-31",
      by: WALKER,
    });
    await stack.ask("POST", "/data/company/facts", {
      group: "class",
      small: "yes",
      gst_registered: "no",
      by: WALKER,
    });
    await stack.ask("POST", "/data/_test/company/seed", { by: WALKER });
    const page = await datesPage();
    expect(page.facts_known).toBe(true);
    const rows = page.suggestions as Body[];
    expect(rows.find((row) => row.key === "agm")).toMatchObject({
      group: "company",
      next: "2026-12-31",
      rule_key: "first-agm",
      from_fact: "From the first financial year ending 31 Mar 2026",
      confirm_with: "CS",
      confirmed: null,
    });
    expect(rows.find((row) => row.key === "inc-20a")).toMatchObject({
      group: "company",
      next: "2026-02-10",
    });
    expect(rows.find((row) => row.title === "DIR-3 KYC: Walk Director")).toMatchObject({
      group: "company",
      next: "2029-06-30",
      rule_key: "dir-3-kyc",
    });
    const dsc = rows.find((row) => row.title === "Director's DSC: Walk Director")!;
    expect(dsc).toMatchObject({ next: addDays(today(), 40), rule_key: null });
    const hidden = page.hidden as Body[];
    expect(hidden).toContainEqual({
      key: "dir-3-kyc",
      title: "DIR-3 KYC, each director",
      why: "Each director has their own row below.",
    });
    expect(hidden).toContainEqual({
      key: "director-dsc",
      title: "Director's DSC (Class 3)",
      why: "Each director has their own row below.",
    });
    expect(hidden.find((row) => row.key === "gstr-1")?.why).toBe("Registered for GST is No.");
    expect(rows.some((row) => row.key === "gstr-1")).toBe(false);
  });

  it("moves an added DSC date when its expiry changes", async () => {
    const dsc = (await datesPage()).suggestions as Body[];
    const row = dsc.find((item) => item.title === "Director's DSC: Walk Director")!;
    const added = await stack.ask("POST", `/data/dates/suggested/${String(row.key)}/add`, {
      by: WALKER,
    });
    expect(added.json!.date).toMatchObject({
      due_on: addDays(today(), 40),
      kind: "renewal",
      statutory: false,
      origin: { key: "company:walk-director:dsc" },
    });
    const later = addDays(today(), 400);
    await stack.ask("POST", "/data/company/directors/walk-director/update", {
      by: WALKER,
      dsc_expires_on: later,
    });
    const moved = ((await datesPage("all")).dates as Body[]).find(
      (date) => date.date_id === (added.json!.date as Body).date_id,
    );
    expect(moved).toMatchObject({
      due_on: later,
      from_suggestion: `director-dsc-walk-director-${later.replace(/-/g, "")}`,
    });
    expect(
      ((await datesPage()).suggestions as Body[]).some((item) =>
        String(item.title).startsWith("Director's DSC"),
      ),
    ).toBe(false);
  });

  it("counts AOC-4 and the AGM from a fake meeting later than the typed AGM, and the board rows", async () => {
    const typed = addDays(today(), -60);
    await stack.ask("POST", "/data/dates/facts", { agm_on: typed, by: WALKER });
    expect((await suggestion("aoc-4"))?.from_fact).toBe(
      `From the AGM held ${new Date(`${typed}T00:00:00Z`).getUTCDate()} ${
        ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][
          Number(typed.slice(5, 7)) - 1
        ]
      } ${typed.slice(0, 4)}`,
    );
    const held = addDays(today(), -20);
    const board = addDays(today(), -10);
    const installed = await stack.ask("POST", "/data/_test/dates/meetings", {
      by: WALKER,
      held: [
        { kind: "agm", held_on: held, title: "Invented AGM" },
        { kind: "board", held_on: board, title: "Invented board meeting" },
      ],
    });
    expect(installed.json!.installed).toBe(true);
    expect((await suggestion("aoc-4"))?.next).toBe(addDays(held, 30));
    expect((await suggestion("mgt-7a"))?.next).toBe(addDays(held, 60));
    expect((await suggestion("adt-1"))?.next).toBe(addDays(held, 15));
    expect((await suggestion("mgt-7a"))?.title).toBe("MGT-7A (annual return)");
    const company = (await stack.ask("GET", "/data/company")).json!;
    expect(company.last_agm).toEqual({ on: held, from: "meetings" });
    const half = board.slice(5, 7) >= "07" ? "board-second-half" : "board-first-half";
    const row = (await suggestion(half))!;
    expect(String(row.from_fact)).toMatch(/^From the last board meeting, /);
    expect(row.next).not.toBe(
      `${board.slice(0, 4)}-${half === "board-second-half" ? "12-31" : "06-30"}`,
    );
    await stack.ask("POST", "/data/_test/dates/meetings", { by: WALKER, on: false });
    expect((await suggestion("aoc-4"))?.next).toBe(addDays(typed, 30));
  });

  it("refuses Not for us on a statutory date without the sign-off, takes it with one, and a typed date as before", async () => {
    const added = await stack.ask("POST", "/data/dates/suggested/agm/add", { by: WALKER });
    const agm = added.json!.date as Body;
    expect(agm).toMatchObject({ statutory: true, rule_key: "agm" });
    const path = `/data/dates/${String(agm.date_id)}`;
    const bare = await stack.ask("POST", `${path}/not-for-us`, { note: "No.", by: WALKER });
    expect(message(bare)).toBe(
      "Say which professional confirmed it does not apply, their role and the day.",
    );
    const half = await stack.ask("POST", `${path}/not-for-us`, {
      note: "No.",
      sign_off_name: "Walk CS",
      by: WALKER,
    });
    expect(half.status).toBe(400);
    const signed = await stack.ask("POST", `${path}/not-for-us`, {
      note: "Held already.",
      sign_off_name: "Walk CS",
      sign_off_role: "CS",
      sign_off_on: today(),
      by: WALKER,
    });
    expect(signed.json!.date).toMatchObject({
      state: "not_for_us",
      sign_off: { name: "Walk CS", role: "CS", on: today(), contact_id: null },
    });
    const typed = (
      await stack.ask("POST", "/data/dates", {
        title: "Walk renewal",
        kind: "renewal",
        due_on: addDays(today(), 50),
        by: WALKER,
      })
    ).json!.date as Body;
    const nope = await stack.ask("POST", `/data/dates/${String(typed.date_id)}/not-for-us`, {
      note: "Let it lapse.",
      by: WALKER,
    });
    expect(nope.json!.date).toMatchObject({ state: "not_for_us", sign_off: null });
    expect(
      message(
        await stack.ask("POST", `/data/dates/${String(typed.date_id)}/sign-off`, {
          by: WALKER,
          sign_off_name: "Walk CA",
        }),
      ),
    ).toBe("Say which professional confirmed it does not apply, their role and the day.");
    const later = await stack.ask("POST", `/data/dates/${String(typed.date_id)}/sign-off`, {
      by: WALKER,
      sign_off_name: "Walk CA",
      sign_off_role: "CA",
      sign_off_on: today(),
    });
    expect((later.json!.date as Body).sign_off).toMatchObject({ name: "Walk CA", role: "CA" });
  });

  it("keeps the evidence on done: a repeating date keeps it in history and moves on", async () => {
    const monthly = (
      await stack.ask("POST", "/data/dates", {
        title: "Walk monthly filing",
        kind: "filing",
        due_on: addDays(today(), 3),
        repeats: "monthly",
        remind_days: 7,
        by: WALKER,
      })
    ).json!.date as Body;
    const path = `/data/dates/${String(monthly.date_id)}`;
    expect(
      message(await stack.ask("POST", `${path}/done`, { fee_paid: "three hundred", by: WALKER })),
    ).toBe("Type the fee in rupees, such as 300.");
    expect(
      message(
        await stack.ask("POST", `${path}/done`, { filed_on: addDays(today(), 2), by: WALKER }),
      ),
    ).toBe("That day is in the future.");
    const done = await stack.ask("POST", `${path}/done`, {
      note: "Filed by the CA.",
      srn: "WALK-SRN-3",
      challan: "WALK-CH-3",
      filed_on: today(),
      fee_paid: "300",
      content: Buffer.from("%PDF-1.4\n% invented filed copy\n").toString("base64"),
      name: "walk-filed.pdf",
      by: WALKER,
    });
    expect(done.status).toBe(200);
    const after = done.json!.date as Body;
    expect(after.state).toBe("coming_up");
    expect(after.evidence).toMatchObject({ srn: "", fee_paid: null });
    const line = (after.history as Body[])[0]!;
    expect(line.evidence).toMatchObject({
      srn: "WALK-SRN-3",
      challan: "WALK-CH-3",
      filed_on: today(),
      fee_paid: 300,
      note: "Filed by the CA.",
    });
    const fileId = String((line.evidence as Body).filed_file_id);
    const files = (await stack.ask("GET", `/data/files/${fileId}`)).json!;
    expect(JSON.stringify(files)).toContain("09 MCA filings and compliance");
    expect(JSON.stringify(files)).toContain("Filed copy of “Walk monthly filing”, in Key dates");
  });

  it("puts an in-progress date in Due, and back to coming up", async () => {
    const soon = (
      await stack.ask("POST", "/data/dates", {
        title: "Walk in-progress filing",
        kind: "filing",
        due_on: addDays(today(), 2),
        remind_days: 7,
        by: WALKER,
      })
    ).json!.date as Body;
    const path = `/data/dates/${String(soon.date_id)}`;
    const moving = await stack.ask("POST", `${path}/in-progress`, {
      note: "With the CA.",
      by: WALKER,
    });
    expect(moving.json!.date).toMatchObject({
      state: "in_progress",
      shown_state: "in_progress",
      state_note: "With the CA.",
    });
    expect(codeOf(await stack.ask("POST", `${path}/in-progress`, { by: WALKER }))).toBe("invalid");
    const due = (await stack.ask("GET", "/data/overview")).json!.due as Body[];
    expect(due.some((item) => item.title === "Walk in-progress filing")).toBe(true);
    const back = await stack.ask("POST", `${path}/update`, { state: "coming_up", by: WALKER });
    expect((back.json!.date as Body).state).toBe("coming_up");
    const owner = await stack.ask("POST", `${path}/owner`, {
      owner_role: "ca",
      handled_by: "Walk CA",
      by: WALKER,
    });
    expect(owner.json!.date).toMatchObject({ owner_role: "ca", handled_by: "Walk CA" });
    expect(
      message(await stack.ask("POST", `${path}/owner`, { owner_role: "boss", by: WALKER })),
    ).toBe("Choose who files it.");
  });

  it("keeps the rule book: an amount, a dropped confirmation, a move, a fixed day, a calendar rule", async () => {
    const rule = async (key: string) =>
      ((await stack.ask("GET", "/data/dates/rules")).json!.rules as Body[]).find(
        (row) => row.key === key,
      )!;
    expect(await rule("pas-3")).toMatchObject({
      clock: "15 days after the allotment",
      amount: 15,
      default_amount: 15,
      changed: false,
      confirmed: null,
      confirm_with: "CS",
    });
    await testCall("add", [
      [
        {
          origin: { key: "walk:allot-1", label: "Allotment to Walk Fund 281", href: "/data" },
          rule_key: "pas-3",
          base_on: today(),
          title: "PAS-3: allotment to Walk Fund 281",
        },
      ],
    ]);
    const confirm = await stack.ask("POST", "/data/dates/rules/pas-3/confirm", {
      name: "Walk CS",
      role: "CS",
      on: today(),
      by: WALKER,
    });
    expect((confirm.json!.rule as Body).confirmed).toEqual({
      name: "Walk CS",
      role: "CS",
      on: today(),
    });
    const changed = await stack.ask("POST", "/data/dates/rules/pas-3/amount", {
      amount: "30",
      by: WALKER,
    });
    expect(changed.json!.rule).toMatchObject({
      clock: "30 days after the allotment",
      changed: true,
      confirmed: null,
      confirmation_dropped: true,
      used_by: 1,
      movable: 1,
    });
    expect(
      (await stack.ask("POST", "/data/dates/rules/pas-3/move", { by: WALKER })).json!.moved,
    ).toBe(1);
    const links = (await testCall("linksFor", ["walk:allot-1"])).json!.result as Body[];
    expect(links[0]!.due_on).toBe(addDays(today(), 30));
    expect(
      (await stack.ask("POST", "/data/dates/rules/pas-3/amount", { amount: 15, by: WALKER })).json!
        .rule,
    ).toMatchObject({ changed: false });
    expect(
      message(await stack.ask("POST", "/data/dates/rules/pas-3/amount", { amount: 0, by: WALKER })),
    ).toBe("Type a whole number from 1 to 3,650.");
    const fixed = await stack.ask("POST", "/data/dates/rules/fla/amount", {
      amount: 10,
      by: WALKER,
    });
    expect(fixed.status).toBe(409);
    expect(codeOf(fixed)).toBe("fixed_day");
    expect(
      message(
        await stack.ask("POST", "/data/dates/rules/gstr-1/confirm", {
          name: "Walk CA",
          by: WALKER,
        }),
      ),
    ).toBe("Say who confirmed it, their role and the day.");
    const calendar = await stack.ask("POST", "/data/dates/rules/gstr-1/confirm", {
      name: "Walk CA",
      role: "CA",
      on: today(),
      by: WALKER,
    });
    expect(calendar.json!.rule).toMatchObject({
      area: "calendar",
      amount: null,
      confirmed: { name: "Walk CA" },
    });
    const removed = await stack.ask("POST", "/data/dates/rules/gstr-1/unconfirm", { by: WALKER });
    expect((removed.json!.rule as Body).confirmed).toBeNull();
    expect(
      (await stack.ask("POST", "/data/dates/rules/not-a-rule/confirm", { by: WALKER })).status,
    ).toBe(404);
    const counts = (await stack.ask("GET", "/data/dates/rules")).json!.counts as Body;
    expect(counts.all).toBeGreaterThan(29);
  });

  it("answers as `key-dates` should: add, again, only once confirmed, rebase, done, take back", async () => {
    const origin = { key: "walk:money-1", label: "Money from Walk Fund 282", href: "/data" };
    const base = addDays(today(), -5);
    const first = (
      await testCall("add", [
        [
          { origin, rule_key: "allotment", base_on: base, title: "Allot shares to Walk Fund 282" },
          { origin, rule_key: "firms-registration", base_on: base, title: "FIRMS: Walk Fund 282" },
          {
            origin,
            rule_key: "advance-receipt",
            base_on: base,
            title: "Advance receipt: Walk Fund 282",
          },
        ],
      ])
    ).json!.result as Body[];
    expect(first.map((link) => [link.rule_key, link.due_on])).toEqual([
      ["firms-registration", addDays(base, 7)],
      ["allotment", addDays(base, 60)],
    ]);
    const again = (
      await testCall("add", [
        [{ origin, rule_key: "allotment", base_on: base, title: "Allot shares to Walk Fund 282" }],
      ])
    ).json!.result as Body[];
    expect(again).toHaveLength(2);
    await stack.ask("POST", "/data/dates/rules/advance-receipt/confirm", {
      name: "Walk CS",
      role: "CS",
      on: today(),
      by: WALKER,
    });
    const confirmed = (
      await testCall("add", [
        [
          {
            origin,
            rule_key: "advance-receipt",
            base_on: base,
            title: "Advance receipt: Walk Fund 282",
          },
        ],
      ])
    ).json!.result as Body[];
    expect(confirmed.map((link) => link.rule_key)).toContain("advance-receipt");
    const done = (
      await testCall("done", [
        origin.key,
        "firms-registration",
        { srn: "WALK-FIRMS-1", filed_on: today() },
      ])
    ).json!.result as Body;
    expect(done).toMatchObject({ state: "done", evidence: { srn: "WALK-FIRMS-1" } });
    const moved = (await testCall("rebase", [origin.key, today()])).json!.result as Body[];
    expect(moved.find((link) => link.rule_key === "allotment")?.due_on).toBe(addDays(today(), 60));
    expect(moved.find((link) => link.rule_key === "firms-registration")?.due_on).toBe(
      addDays(base, 7),
    );
    const back = (await testCall("takeBack", [origin.key, "The money was refunded."])).json!
      .result as Body[];
    expect(back.find((link) => link.rule_key === "allotment")?.state).toBe("taken_back");
    expect(back.find((link) => link.rule_key === "firms-registration")?.state).toBe("done");
    const row = ((await datesPage("all")).dates as Body[]).find(
      (date) => date.title === "Allot shares to Walk Fund 282",
    );
    expect(row).toMatchObject({ state: "taken_back", state_note: "The money was refunded." });
  });

  it("counts AOC-4's late fee open and filed late, and the CSV's new columns", async () => {
    const origin = { key: "walk:agm-late", label: "Invented AGM", href: "/data" };
    const [late] = (
      await testCall("add", [
        [
          {
            origin,
            rule_key: "aoc-4",
            base_on: addDays(today(), -44),
            title: "AOC-4: invented year",
          },
        ],
      ])
    ).json!.result as Body[];
    const row = ((await datesPage()).dates as Body[]).find(
      (date) => date.date_id === late!.date_id,
    )!;
    expect(row.late).toMatchObject({ days: 14, amount: 1400 });
    expect(row.overdue).toBe(true);
    const due = (await stack.ask("GET", "/data/overview")).json!.due as Body[];
    expect(String(due.find((item) => item.title === "AOC-4: invented year")?.sub)).toContain(
      "₹1,400 late fee so far",
    );
    const filed = await stack.ask("POST", `/data/dates/${String(late!.date_id)}/done`, {
      filed_on: addDays(today(), -4),
      srn: "WALK-SRN-4",
      by: WALKER,
    });
    expect((filed.json!.date as Body).late).toMatchObject({ days: 10, amount: 1000 });
    const made = await stack.ask("POST", "/data/builds", { kind: "dates_csv", by: WALKER });
    const buildId = String((made.json!.build as Body).build_id);
    await until(
      async () =>
        ((await stack.ask("GET", `/data/builds/${buildId}`)).json!.build as Body).state === "ready",
      "the CSV",
    );
    const text = (
      await stack.raw(stack.socket, "GET", `/data/builds/${buildId}/bytes`)
    ).bytes.toString("utf8");
    const [header, ...lines] = text.split("\r\n").filter(Boolean);
    expect(header).toContain(
      ",rule,source,checked_on,confirmed_by,owner,srn,challan,filed_on,fee_paid,filed_copy,not_for_us_signed_off_by,from_record",
    );
    const aoc = lines.find((line) => line.includes("AOC-4: invented year"))!;
    expect(aoc).toContain("WALK-SRN-4");
    expect(aoc).toContain("Invented AGM");
    expect(aoc).toContain("https://taxguru.in/");
    const signed = lines.find((line) => line.includes("Annual general meeting"))!;
    expect(signed).toContain("Walk CS (CS)");
  });
});

describe("dates written before this batch read as they were", () => {
  let stack: Stack;
  const old = {
    format: 1,
    facts: { agm_on: "2026-09-30" },
    dates: [
      {
        date_id: "11111111-1111-4111-8111-111111111111",
        title: "GSTR-1 (monthly filers)",
        kind: "filing",
        due_on: "2026-11-11",
        repeats: "monthly",
        entity: "The Indian company",
        handled_by: "The CA",
        remind_days: 7,
        notes: "Invented.",
        file_id: null,
        from_suggestion: "gstr-1",
        state: "coming_up",
        state_note: "",
        history: [
          {
            due_on: "2026-10-11",
            done_at: "2026-10-10T10:00:00.000Z",
            by: WALKER,
            note: "Filed.",
          },
        ],
        created_at: "2026-10-01T10:00:00.000Z",
        created_by: WALKER,
        updated_at: "2026-10-10T10:00:00.000Z",
      },
      {
        date_id: "22222222-2222-4222-8222-222222222222",
        title: "Invented domain renewal",
        kind: "renewal",
        due_on: "2027-01-05",
        repeats: "yearly",
        entity: "The Indian company",
        handled_by: "",
        remind_days: 14,
        notes: "",
        file_id: null,
        from_suggestion: null,
        state: "not_for_us",
        state_note: "We let it go.",
        history: [],
        created_at: "2026-10-01T10:00:00.000Z",
        created_by: WALKER,
        updated_at: "2026-10-02T10:00:00.000Z",
      },
    ],
  };

  beforeAll(async () => {
    stack = await startStack();
    mkdirSync(join(stack.dir, "data", "dates"), { recursive: true });
    writeFileSync(join(stack.dir, "data", "dates", "dates.json"), JSON.stringify(old));
    await stack.ask("POST", "/data/_test/crash", { by: WALKER });
    await stack.data.ready(20_000);
  }, 60_000);
  afterAll(() => stack.stop());

  it("keeps every stored field and gives the new ones their defaults", async () => {
    const page = (await stack.ask("GET", "/data/dates?view=all")).json!;
    expect(page.facts).toEqual({ agm_on: "2026-09-30" });
    const rows = page.dates as Body[];
    const gst = rows.find((row) => row.date_id === old.dates[0]!.date_id)!;
    for (const [key, value] of Object.entries(old.dates[0]!)) {
      if (key === "history") continue;
      expect(gst[key], key).toEqual(value);
    }
    expect(gst).toMatchObject({
      rule_key: null,
      statutory: true,
      origin: null,
      base_on: null,
      owner_role: "",
      sign_off: null,
      evidence: {
        srn: "",
        challan: "",
        filed_on: null,
        fee_paid: null,
        filed_file_id: null,
        note: "",
      },
    });
    expect((gst.history as Body[])[0]).toMatchObject({
      ...old.dates[0]!.history[0],
      evidence: { srn: "", fee_paid: null },
    });
    const nope = rows.find((row) => row.date_id === old.dates[1]!.date_id)!;
    expect(nope).toMatchObject({
      state: "not_for_us",
      state_note: "We let it go.",
      statutory: false,
      sign_off: null,
    });
  });
});
