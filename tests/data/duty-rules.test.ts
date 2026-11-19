// @vitest-environment node
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { RULES } from "../../scripts/data/company-contracts";
import { DUTY_RULES } from "../../scripts/data/duties-contracts";
import { localDay } from "../../scripts/data/days";
import { CALENDAR_RULES, dutyClockWords } from "../../scripts/data/dates/rules";
import { WALKER, codeOf, startStack, type Stack } from "./helpers";

/**
 * The rule book learns the duty rules (duties spec §7.2, §15): the rules answer lists the
 * company batch's rules and the calendar dates exactly as before, then the 45 duty rules
 * that are not already a calendar date, in the contract's order, with no key twice; a rule
 * the sources disagree on is confirmed as a reading or as his own amount and works nothing
 * out before; changing the amount drops the confirmation; a rule nobody confirms cannot be
 * confirmed; `duty-rules` answers what the book holds; and `tds-deposit`, which is both a
 * calendar date and a duty rule, stays one row whose stored confirmation and dates (as they
 * may be on his real data) read exactly as before. Every name is invented.
 */

type Body = Record<string, unknown>;
const today = () => localDay(new Date());

/**
 * SHA-256 of the rules answer's rows before this batch, `tds-deposit` left out, as
 * `JSON.stringify` writes them: taken from the baseline tree (`9b631c5`) with the modules
 * files, contacts and dates and nothing recorded.
 */
const OLD_ROWS_SHA256 = "c4a38884556775b7cab1b902222ad5ae6a8e378eb0901b51f6e20938c5c790f8";
const OLD_KEYS = [...RULES.map((rule) => rule.key), ...CALENDAR_RULES.map((item) => item.key)];
const OLD_TDS_DEPOSIT = {
  key: "tds-deposit",
  area: "calendar",
  title: "TDS deposit",
  from: "The company holds a TAN and deducted tax last month",
  clock: "7th of the next month; 30 Apr for March",
  amount: null,
  default_amount: null,
  unit: null,
  changed: false,
  verified_on: "2026-11-10",
  confirm_with: "CA",
  confirmed: null,
  confirmation_dropped: false,
  late_words: "",
  only_when_confirmed: false,
  used_by: 0,
  movable: 0,
};
const DUTY_ONLY = DUTY_RULES.map((rule) => rule.key).filter((key) => key !== "tds-deposit");

let stack: Stack;

const rules = async () => (await stack.ask("GET", "/data/dates/rules")).json!;
const rowOf = async (key: string) =>
  ((await rules()).rules as Body[]).find((row) => row.key === key)!;
const stateOf = async (key: string, on = "") =>
  (await stack.ask("GET", `/data/_test/dates/duty-state?key=${key}${on ? `&on=${on}` : ""}`)).json!;
const message = (answer: { json: Body | null }) =>
  String(((answer.json?.error ?? {}) as Body).message ?? "");

describe("the rule book with the duty rules", () => {
  beforeAll(async () => {
    stack = await startStack({ modules: ["files", "contacts", "dates"] });
  }, 60_000);
  afterAll(() => stack.stop());

  it("lists the old rows as before, then the 45 duty rows, with no key twice", async () => {
    const answer = await rules();
    const rows = answer.rules as Body[];
    expect(rows).toHaveLength(OLD_KEYS.length + 45);
    expect(OLD_KEYS).toHaveLength(41);
    expect(rows.slice(0, 41).map((row) => row.key)).toEqual(OLD_KEYS);
    expect(rows.slice(41).map((row) => row.key)).toEqual(DUTY_ONLY);
    const keys = rows.map((row) => row.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.filter((key) => key === "tds-deposit")).toHaveLength(1);
    const old = rows.slice(0, 41).filter((row) => row.key !== "tds-deposit");
    expect(createHash("sha256").update(JSON.stringify(old)).digest("hex")).toBe(OLD_ROWS_SHA256);
    for (const row of rows.slice(41)) expect(row.duty, String(row.key)).toBe(true);
    // Six duty rules nobody confirms: four certificate limits, security.txt and the close.
    expect(answer.counts).toEqual({ all: 86, confirmed: 0, changed: 0, confirmable: 80 });
  });

  it("merges the duty into the calendar date `tds-deposit`, changing nothing it had", async () => {
    const row = await rowOf("tds-deposit");
    expect(row).toMatchObject(OLD_TDS_DEPOSIT);
    expect((row.sources as Body[]).map((source) => source.url)).toEqual([
      "https://www.india-briefing.com/news/india-tax-compliance-deadlines-april-may-2026-43913.html",
      "https://taxguru.in/income-tax/income-tax-act-2025-tds-rates-thresholds-compliance-ty-2026-27.html",
    ]);
    expect(row.note).toBe(
      "By the 7th of the next month; by 30 April for March. The day is not moved for a holiday here.",
    );
    expect(row).toMatchObject({
      duty: true,
      sense: "words",
      usable: true,
      starts_on: null,
      reading: null,
      readings: [],
    });
  });

  it("writes each sense's clock in words", async () => {
    const rows = new Map(((await rules()).rules as Body[]).map((row) => [row.key, row]));
    const clock = (key: string) => rows.get(key)!.clock;
    expect(clock("cert-in-report")).toBe(
      "6 hours after noticing the incident, or being told of it",
    );
    expect(clock("close-by")).toBe("5 working days after the end of the month");
    expect(clock("tm-renewal-opens")).toBe("1 year before the expiry");
    expect(clock("tls-life-2026")).toBe("At most 200 days from the day it is issued");
    expect(clock("voucher-retention")).toBe(
      "At least 8 years from the end of the financial year the voucher belongs to",
    );
    expect(clock("pf-headcount")).toBe("20 people or more: the number of employees");
    expect(clock("tds-contractor-year")).toBe(
      "Over ₹1,00,000: one vendor's bills in the financial year",
    );
    expect(clock("tds-rate-professional")).toBe("10 per cent of the amount paid or credited");
    expect(clock("tds-professional-year")).toBe("The sources give ₹50,000 and ₹30,000.");
    expect(clock("export-realisation")).toBe("The sources give 9 months and 15 months.");
    expect(clock("cert-in-contact")).toBe(
      dutyClockWords(DUTY_RULES[1]!, {
        amount: null,
        reading: null,
        confirmed: false,
      }),
    );
    for (const row of rows.values()) expect(String(row.clock), String(row.key)).not.toContain("%");
    expect(rows.get("dpdp-board-report")).toMatchObject({
      starts_on: "2027-05-12",
      usable: today() >= "2027-05-12",
    });
    expect(rows.get("export-realisation")).toMatchObject({
      only_when_confirmed: true,
      usable: false,
      amount: null,
      reading: null,
      readings: [
        { label: "9 months", sources: [{ name: "LKS: RBI trade regulations 2026" }, {}] },
        { label: "15 months" },
      ],
    });
  });

  it("refuses to confirm a disputed rule without a reading, and confirms reading 1", async () => {
    const bare = await stack.ask("POST", "/data/dates/rules/export-realisation/confirm", {
      name: "Walk Bank",
      role: "bank",
      on: today(),
      by: WALKER,
    });
    expect(bare.status).toBe(400);
    expect(message(bare)).toBe(
      "Choose which reading was confirmed, or type your own amount first.",
    );
    expect(
      message(
        await stack.ask("POST", "/data/dates/rules/export-realisation/confirm", {
          name: "Walk Bank",
          role: "bank",
          on: today(),
          reading: 7,
          by: WALKER,
        }),
      ),
    ).toBe("Choose which reading was confirmed, or type your own amount first.");
    expect((await stateOf("export-realisation")).state).toMatchObject({
      amount: null,
      usable: false,
    });
    const done = await stack.ask("POST", "/data/dates/rules/export-realisation/confirm", {
      name: "Walk Bank",
      role: "bank",
      on: today(),
      reading: 1,
      by: WALKER,
    });
    expect(done.status).toBe(200);
    expect(done.json!.rule).toMatchObject({
      clock: "15 months after the invoice date",
      amount: 15,
      reading: 1,
      usable: true,
      confirmed: { name: "Walk Bank", role: "bank", on: today() },
    });
    const asked = await stateOf("export-realisation");
    expect(asked.state).toMatchObject({
      amount: 15,
      reading: 1,
      usable: true,
      confirmed: true,
      confirmed_by: "Walk Bank",
    });
    expect(asked.line).toMatchObject({ readings: [], usable: true, confirm_with: "bank" });
    // Taking the confirmation away keeps the reading chosen, but it stops counting.
    const undone = await stack.ask("POST", "/data/dates/rules/export-realisation/unconfirm", {
      by: WALKER,
    });
    expect(undone.json!.rule).toMatchObject({ reading: 1, usable: false, amount: null });
    const history = readFileSync(join(stack.dir, "data", "dates", "rules-history.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Body);
    expect(history.filter((line) => line.key === "export-realisation")).toMatchObject([
      { amount_before: null, amount_after: 15, confirmed: true, reading: 1 },
      { amount_after: 15, confirmed: false, reading: 1 },
    ]);
  });

  it("takes his own amount, then a confirmation; changing the amount drops it", async () => {
    const typed = await stack.ask("POST", "/data/dates/rules/tds-professional-year/amount", {
      amount: "40,000",
      by: WALKER,
    });
    expect(typed.json!.rule).toMatchObject({
      changed: true,
      confirmed: null,
      usable: false,
      clock: "The sources give ₹50,000 and ₹30,000.",
    });
    expect((await stateOf("tds-professional-year")).state).toMatchObject({ amount: null });
    const confirmed = await stack.ask("POST", "/data/dates/rules/tds-professional-year/confirm", {
      name: "Walk CA",
      role: "CA",
      on: today(),
      by: WALKER,
    });
    expect(confirmed.json!.rule).toMatchObject({
      clock: "Over ₹40,000: one vendor's bills in the financial year",
      amount: 40_000,
      usable: true,
      confirmed: { name: "Walk CA", role: "CA" },
    });
    expect((await stateOf("tds-professional-year")).state).toMatchObject({
      amount: 40_000,
      usable: true,
    });
    const changed = await stack.ask("POST", "/data/dates/rules/tds-professional-year/amount", {
      amount: 45_000,
      by: WALKER,
    });
    expect(changed.json!.rule).toMatchObject({
      confirmed: null,
      confirmation_dropped: true,
      usable: false,
    });
    expect((await stateOf("tds-professional-year")).state).toMatchObject({
      confirmed: false,
      usable: false,
      amount: null,
    });
    // Confirming as a reading clears his own amount: the reading is what counts.
    const asReading = await stack.ask("POST", "/data/dates/rules/tds-professional-year/confirm", {
      name: "Walk CA",
      role: "CA",
      on: today(),
      reading: 0,
      by: WALKER,
    });
    expect(asReading.json!.rule).toMatchObject({ amount: 50_000, changed: false, reading: 0 });
    // His own amount from the confirm form itself.
    const own = await stack.ask("POST", "/data/dates/rules/tm-fee-startup/confirm", {
      name: "Walk Agent",
      role: "agent",
      on: today(),
      amount: "4500",
      by: WALKER,
    });
    expect(own.json!.rule).toMatchObject({
      clock: "₹4,500: each class",
      amount: 4_500,
      reading: null,
      confirmed: { role: "agent" },
    });
  });

  it("changes a plain duty rule's amount within its unit's limits", async () => {
    const close = await stack.ask("POST", "/data/dates/rules/close-by/amount", {
      amount: 4,
      by: WALKER,
    });
    expect(close.json!.rule).toMatchObject({
      clock: "4 working days after the end of the month",
      changed: true,
      amount: 4,
      default_amount: 5,
    });
    expect((await stateOf("close-by")).state).toMatchObject({ amount: 4, unit: "working_days" });
    expect(
      message(
        await stack.ask("POST", "/data/dates/rules/cert-in-report/amount", {
          amount: 721,
          by: WALKER,
        }),
      ),
    ).toBe("Type a whole number from 1 to 720.");
    expect(
      message(
        await stack.ask("POST", "/data/dates/rules/close-by/amount", { amount: 61, by: WALKER }),
      ),
    ).toBe("Type a whole number from 1 to 60.");
    const words = await stack.ask("POST", "/data/dates/rules/cert-in-contact/amount", {
      amount: 3,
      by: WALKER,
    });
    expect(words.status).toBe(409);
    expect(codeOf(words)).toBe("no_amount");
    // Typing the rule's own amount clears his.
    const back = await stack.ask("POST", "/data/dates/rules/close-by/amount", {
      amount: 5,
      by: WALKER,
    });
    expect(back.json!.rule).toMatchObject({ changed: false, amount: 5 });
  });

  it("refuses to confirm a rule nobody confirms, and a company rule by the bank", async () => {
    const industry = await stack.ask("POST", "/data/dates/rules/close-by/confirm", {
      name: "Walk CA",
      role: "CA",
      on: today(),
      by: WALKER,
    });
    expect(industry.status).toBe(409);
    expect(codeOf(industry)).toBe("nobody_confirms");
    expect(message(industry)).toBe(
      "Nobody confirms this one: it is an industry rule, or your own practice.",
    );
    const bank = await stack.ask("POST", "/data/dates/rules/pas-3/confirm", {
      name: "Walk Bank",
      role: "bank",
      on: today(),
      by: WALKER,
    });
    expect(bank.status).toBe(400);
    const agent = await stack.ask("POST", "/data/dates/rules/tm-opposition/confirm", {
      name: "Walk Agent",
      role: "agent",
      on: today(),
      by: WALKER,
    });
    expect(agent.json!.rule).toMatchObject({
      confirmed: { name: "Walk Agent", role: "agent" },
    });
  });

  it("hides the three renewal rows a register covers, keeping dates already added (§7.3)", async () => {
    const page = async () => (await stack.ask("GET", "/data/dates?view=all")).json!;
    const before = await page();
    const keys = (before.suggestions as Body[]).map((row) => row.key);
    expect(keys).toEqual(expect.arrayContaining(["domain", "code-signing", "trademark"]));
    const added = await stack.ask("POST", "/data/dates/suggested/domain/add", {
      due_on: "2027-03-12",
      by: WALKER,
      attempt: "duty-rules-domain-1",
    });
    expect(added.status).toBe(200);
    const fake = await stack.ask("POST", "/data/_test/dates/registers", {
      domains: 1,
      signing: 1,
      marks: 1,
      by: WALKER,
    });
    expect(fake.json).toMatchObject({ installed: true, domains: 1, signing: 1, marks: 1 });
    const after = await page();
    const shown = (after.suggestions as Body[]).map((row) => row.key);
    expect(shown).not.toContain("code-signing");
    expect(shown).not.toContain("trademark");
    expect(shown).not.toContain("domain");
    expect(after.hidden).toEqual(
      expect.arrayContaining([
        {
          key: "code-signing",
          title: "Code-signing certificate",
          why: "Each signing certificate has its own row in Registers.",
        },
        {
          key: "trademark",
          title: "Trademark registration",
          why: "Each mark has its own row in Registers.",
        },
      ]),
    );
    expect((after.dates as Body[]).map((date) => date.from_suggestion)).toContain("domain");
    expect(
      (await stack.ask("POST", "/data/_test/dates/registers", { on: false, by: WALKER })).json,
    ).toMatchObject({ installed: false });
    const back = ((await page()).suggestions as Body[]).map((row) => row.key);
    expect(back).toEqual(expect.arrayContaining(["code-signing", "trademark"]));
  });

  it("moves no date for a duty rule: none is stored", async () => {
    const moved = await stack.ask("POST", "/data/dates/rules/cert-in-report/move", { by: WALKER });
    expect(moved.json).toMatchObject({ moved: 0 });
  });

  it("provides `duty-rules`, answering a day other than today", async () => {
    expect((await stack.ask("POST", "/data/_test/need", { name: "duty-rules" })).json!.found).toBe(
      true,
    );
    expect((await stateOf("dpdp-board-report", "2027-05-11")).state).toMatchObject({
      not_yet: true,
      usable: false,
    });
    expect((await stateOf("dpdp-board-report", "2027-05-12")).state).toMatchObject({
      not_yet: false,
      usable: true,
      amount: 72,
    });
    expect((await stateOf("dpdp-board-report", "2027-05-11")).line).toMatchObject({
      starts_on: "2027-05-12",
    });
    expect((await stack.ask("GET", "/data/_test/dates/duty-state?key=agm")).status).toBe(404);
  });
});

describe("`tds-deposit` as his real data may hold it (spec §15)", () => {
  const confirmedOn = "2026-11-01";
  const stored = {
    format: 1,
    rules: {
      "tds-deposit": {
        confirmed: {
          name: "Walk CA",
          role: "CA",
          on: confirmedOn,
          contact_id: null,
          amount: null,
          at: "2026-11-01T10:00:00.000Z",
          by: WALKER,
        },
      },
    },
  };
  const dates = {
    format: 1,
    facts: { agm_on: null },
    dates: [
      {
        date_id: "33333333-3333-4333-8333-333333333333",
        title: "TDS deposit",
        kind: "tax",
        due_on: "2026-12-07",
        repeats: "monthly",
        entity: "The Indian company",
        handled_by: "Walk CA",
        remind_days: 7,
        notes: "His own note.",
        file_id: null,
        from_suggestion: "tds-deposit",
        state: "coming_up",
        state_note: "",
        history: [],
        created_at: "2026-11-01T10:00:00.000Z",
        created_by: WALKER,
        updated_at: "2026-11-01T10:00:00.000Z",
      },
    ],
  };

  beforeAll(async () => {
    stack = await startStack({ modules: ["files", "contacts", "dates"] });
    mkdirSync(join(stack.dir, "data", "dates"), { recursive: true });
    writeFileSync(join(stack.dir, "data", "dates", "rules.json"), JSON.stringify(stored));
    writeFileSync(join(stack.dir, "data", "dates", "dates.json"), JSON.stringify(dates));
    await stack.ask("POST", "/data/_test/crash", { by: WALKER });
    await stack.data.ready(20_000);
  }, 60_000);
  afterAll(() => stack.stop());

  it("stays confirmed, with his day, as one row read by both the calendar and `duty-rules`", async () => {
    const answer = await rules();
    const rows = (answer.rules as Body[]).filter((row) => row.key === "tds-deposit");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      area: "calendar",
      confirmed: { name: "Walk CA", role: "CA", on: confirmedOn },
      used_by: 1,
      duty: true,
    });
    expect((answer.counts as Body).confirmed).toBe(1);
    expect((await stateOf("tds-deposit")).state).toEqual({
      key: "tds-deposit",
      amount: null,
      unit: null,
      confirmed: true,
      confirmed_by: "Walk CA",
      confirmed_on: confirmedOn,
      reading: null,
      usable: true,
      not_yet: false,
    });
    const page = (await stack.ask("GET", "/data/dates?view=all")).json!;
    const date = (page.dates as Body[]).find((row) => row.date_id === dates.dates[0]!.date_id)!;
    expect(date).toMatchObject({ due_on: "2026-12-07", from_suggestion: "tds-deposit" });
    expect((date.rule as Body).confirmed).toMatchObject({ name: "Walk CA" });
    // The routes keep working on the existing key, as they did.
    const amount = await stack.ask("POST", "/data/dates/rules/tds-deposit/amount", {
      amount: 3,
      by: WALKER,
    });
    expect(codeOf(amount)).toBe("fixed_day");
    expect(
      (await stack.ask("POST", "/data/dates/rules/tds-deposit/move", { by: WALKER })).json,
    ).toMatchObject({ moved: 0 });
    const kept = (await stack.ask("GET", "/data/dates?view=all")).json!;
    expect(
      (kept.dates as Body[]).find((row) => row.date_id === dates.dates[0]!.date_id)!.due_on,
    ).toBe("2026-12-07");
    const file = JSON.parse(
      readFileSync(join(stack.dir, "data", "dates", "rules.json"), "utf8"),
    ) as typeof stored;
    expect(file.rules["tds-deposit"].confirmed).toMatchObject({ name: "Walk CA", on: confirmedOn });
    // A new confirmation lands on the same key, and both readers see it.
    const again = await stack.ask("POST", "/data/dates/rules/tds-deposit/confirm", {
      name: "Walk CA Two",
      role: "CA",
      on: today(),
      by: WALKER,
    });
    expect(again.status).toBe(200);
    expect((await stateOf("tds-deposit")).state).toMatchObject({ confirmed_by: "Walk CA Two" });
    expect(
      ((await rules()).rules as Body[]).filter((row) => row.key === "tds-deposit"),
    ).toHaveLength(1);
  });
});
