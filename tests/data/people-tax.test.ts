// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { standInDutyRules } from "../../scripts/data/duties-contracts";
import { taxYearsOf } from "../../scripts/data/people/tax";
import type { Person, StipendPayment } from "../../scripts/data/people/types";
import { EMPTY_TAX } from "../../scripts/data/people/book";
import { WALKER, codeOf, startStack, until, type Stack } from "./helpers";

/**
 * Stipend tax in the people ledger (duties spec §5.3, §7.5), for the Owner only: §5.3's year
 * lines by hand (unconfirmed, then confirmed at ₹50,000 after the third and the fourth
 * payment; salary, exempt and not decided); the same through the stack once the rule is
 * confirmed in the rule book; a classification without who decided refused; the PAN; a
 * certificate with its copy; the challan and its refusals; the Due row, `owner_only`, absent
 * from an Admin's overview; the month lock through the stand-in; `people-pay`'s shapes; the
 * CSV's tax treatment and challan columns; no amount in the events; and, on every path an
 * Admin can reach (the overview's Due, the calendar, search, the cash view, a backup), no name,
 * PAN, challan or amount of the ledger. Every person, PAN and challan is invented.
 */

type Body = Record<string, unknown>;
let stack: Stack;

const payment = (
  paid_on: string,
  amount = 15_000,
  currency: "INR" | "USD" = "INR",
): StipendPayment => ({
  payment_id: `walk-${paid_on}`,
  period: paid_on.slice(0, 7),
  amount,
  currency,
  paid_on,
  reference: `WALK-UTR-${paid_on}`,
  tds_deducted: null,
  note: "",
  at: `${paid_on}T10:00:00.000Z`,
  by: WALKER,
  withdrawn: null,
  challan: null,
});

const walkIntern = (payments: StipendPayment[], classification = "professional_fee") =>
  ({
    payments,
    tax: { ...EMPTY_TAX(), classification },
  }) as unknown as Pick<Person, "payments" | "tax">;

const FOUR = ["2026-11-30", "2026-12-31", "2027-01-31", "2027-02-28"].map((day) => payment(day));
const CONFIRMED = standInDutyRules(() => "2027-03-31", {
  "tds-professional-year": { reading: 0, confirmed: { name: "Walk CA", on: "2026-11-14" } },
});

describe("the year lines by hand (§5.3)", () => {
  it("gives the sum and both readings while the limit is not confirmed", () => {
    const [year] = taxYearsOf(
      walkIntern(FOUR),
      standInDutyRules(() => "2027-03-31"),
      "2027-03-31",
    );
    expect(year).toMatchObject({
      fy: "2026-27",
      paid_minor: 6_000_000,
      words: "₹60,000 paid in 2026-27.",
      rule: { key: "tds-professional-year", usable: false, readings: ["₹50,000", "₹30,000"] },
    });
  });

  it("compares with ₹50,000 once confirmed: below after three, over after the fourth", () => {
    expect(taxYearsOf(walkIntern(FOUR.slice(0, 3)), CONFIRMED, "2027-03-31")[0]!.words).toBe(
      "₹45,000 of ₹50,000 in 2026-27: below the limit.",
    );
    const [year] = taxYearsOf(walkIntern(FOUR), CONFIRMED, "2027-03-31");
    expect(year!.words).toBe(
      "₹60,000 in 2026-27: over the ₹50,000 limit since the payment of 28 Feb 2027.",
    );
    expect(year!.rule).toMatchObject({ usable: true, readings: [], confirmed_by: "Walk CA" });
  });

  it("gives the sum only for a salary, an exemption or nothing decided", () => {
    for (const classification of ["salary", "exempt", ""])
      expect(
        taxYearsOf(walkIntern(FOUR, classification), CONFIRMED, "2027-03-31")[0],
      ).toMatchObject({
        words: "₹60,000 paid in 2026-27. Your CA decides whether tax is deducted.",
        rule: null,
      });
  });

  it("splits by financial year, newest first, and lists dollars beside, never added", () => {
    const years = taxYearsOf(
      walkIntern([...FOUR, payment("2027-04-30"), payment("2027-05-31", 200, "USD")]),
      CONFIRMED,
      "2027-06-30",
    );
    expect(years.map((year) => [year.fy, year.paid_minor, year.other])).toEqual([
      ["2027-28", 1_500_000, { USD: 20_000 }],
      ["2026-27", 6_000_000, {}],
    ]);
    expect(years[0]!.words).toBe(
      "₹15,000 of ₹50,000 in 2027-28: below the limit. Also paid in another currency, not added: $200.",
    );
  });

  it("leaves a withdrawn payment out", () => {
    const withdrawn = {
      ...payment("2027-02-28"),
      withdrawn: { at: "x", by: WALKER, why: "Paid twice." },
    };
    expect(
      taxYearsOf(walkIntern([...FOUR.slice(0, 3), withdrawn]), CONFIRMED, "2027-03-31")[0]!
        .paid_minor,
    ).toBe(4_500_000);
  });
});

describe("tax in the ledger, through the stack", () => {
  let id = "";
  const ok = async (path: string, body: Body = {}) => {
    const answer = await stack.ask("POST", path, { ...body, by: WALKER });
    expect(answer.status, `${path}: ${JSON.stringify(answer.json)}`).toBe(200);
    return answer.json!;
  };
  const refusal = async (path: string, body: Body = {}) => {
    const answer = await stack.ask("POST", path, { ...body, by: WALKER });
    return {
      status: answer.status,
      code: codeOf(answer),
      message: String(((answer.json?.error ?? {}) as Body).message ?? ""),
    };
  };
  const page = async () => (await stack.ask("GET", `/data/people/${id}`)).json!;
  const pay = (period: string, paid_on: string, extra: Body = {}) =>
    ok(`/data/people/${id}/payments`, {
      period,
      amount: 15000,
      currency: "INR",
      paid_on,
      reference: `WALK-UTR-${period}`,
      ...extra,
    });

  beforeAll(async () => {
    stack = await startStack({ modules: ["files", "contacts", "dates", "people"] });
    const added = await ok("/data/people", {
      name: "Walk Intern One",
      email: "one@walkintern.example",
      kind: "intern",
      role_title: "Research intern",
      starts_on: "2025-11-01",
      ends_on: "2026-03-31",
      mentor: "Walk Mentor",
      stipend: { amount: 15000, currency: "INR", pays_on: "month_end" },
    });
    id = String((added.person as Body).person_id);
  }, 60_000);
  afterAll(() => stack.stop());

  it("starts with the empty tax form, and refuses a classification without who decided", async () => {
    const first = await page();
    expect(first.tax).toEqual({
      classification: "",
      decided_by: "",
      decided_role: "",
      decided_on: null,
      decided_note: "",
      pan: "",
      letter_document_id: null,
      certificates: [],
    });
    expect(first.tax_years).toEqual([]);
    const bare = await refusal(`/data/people/${id}/tax`, { classification: "professional_fee" });
    expect(bare).toMatchObject({
      status: 400,
      message: "Say who decided this, their role and the day.",
    });
    expect((await refusal(`/data/people/${id}/tax`, { pan: "ZZZ0000ZZZ" })).message).toBe(
      "Type the PAN as ten letters and digits: five letters, four digits and a letter.",
    );
    expect(
      (await refusal(`/data/people/${id}/tax`, { letter_document_id: "not-a-document" })).status,
    ).toBe(404);
  });

  it("records the decision and the PAN, and the year lines follow the rule book", async () => {
    const saved = await ok(`/data/people/${id}/tax`, {
      classification: "professional_fee",
      decided_by: "Walk CA",
      decided_role: "CA",
      decided_on: "2025-11-15",
      pan: "zzzpz0000z",
    });
    expect((saved.person as Body).tax).toMatchObject({
      classification: "professional_fee",
      decided_by: "Walk CA",
      decided_role: "CA",
      decided_on: "2025-11-15",
      pan: "ZZZPZ0000Z",
    });
    await pay("2025-11", "2025-11-30");
    await pay("2025-12", "2025-12-31");
    await pay("2026-01", "2026-01-31");
    const three = (await page()).tax_years as Body[];
    expect(three[0]).toMatchObject({
      fy: "2025-26",
      paid_minor: 4_500_000,
      words: "₹45,000 paid in 2025-26.",
      rule: { readings: ["₹50,000", "₹30,000"], usable: false },
    });
    await ok("/data/dates/rules/tds-professional-year/confirm", {
      name: "Walk CA",
      role: "CA",
      on: "2025-11-15",
      reading: 0,
    });
    expect(((await page()).tax_years as Body[])[0]!.words).toBe(
      "₹45,000 of ₹50,000 in 2025-26: below the limit.",
    );
    await pay("2026-02", "2026-02-28");
    expect(((await page()).tax_years as Body[])[0]).toMatchObject({
      words: "₹60,000 in 2025-26: over the ₹50,000 limit since the payment of 28 Feb 2026.",
      rule: { confirmed_by: "Walk CA", usable: true },
    });
    const list = (await stack.ask("GET", "/data/people")).json!.people as Body[];
    expect(list.find((row) => row.person_id === id)!.tax_classification).toBe("professional_fee");
  });

  it("keeps a certificate with its copy, and refuses a bad period", async () => {
    expect(
      (
        await refusal(`/data/people/${id}/tax/certificates`, {
          form: "131",
          period: "2025-27",
          issued_on: "2026-05-30",
          number: "WALK-CERT-1",
        })
      ).message,
    ).toBe("Give the period: a financial year such as 2026-27, or a quarter such as 2026-27 Q3.");
    const added = await ok(`/data/people/${id}/tax/certificates`, {
      form: "131",
      period: "2025-26 Q4",
      issued_on: "2026-05-30",
      number: "WALK-CERT-1",
      name: "walk-form-131.pdf",
      content: Buffer.from("%PDF-1.4 invented certificate").toString("base64"),
    });
    const certificate = ((added.person as Body).tax as Body).certificates as Body[];
    expect(certificate[0]).toMatchObject({
      form: "131",
      period: "2025-26 Q4",
      number: "WALK-CERT-1",
    });
    const copyId = String((certificate[0]!.copy as Body).copy_id);
    const copy = await stack.ask("GET", `/data/people/${id}/copies/${copyId}`);
    expect(copy.status).toBe(200);
  });

  it("records a challan only on a payment with tax deducted, and Due asks for it as the Owner only", async () => {
    const before = (await page()).person as Body;
    const plain = (before.payments as Body[])[0]!;
    expect(
      await refusal(`/data/people/${id}/payments/${String(plain.payment_id)}/challan`, {
        number: "WALK-CHALLAN-1",
      }),
    ).toMatchObject({ status: 409, code: "no_tds" });
    // A month with tax deducted and no challan yet.
    await ok(
      `/data/people/${id}/payments/${String((before.payments as Body[])[3]!.payment_id)}/withdraw`,
      {
        why: "Recorded again with the tax deducted.",
      },
    );
    const withTds = await pay("2026-02", "2026-02-28", { tds_deducted: 1500 });
    const payments = (withTds.person as Body).payments as Body[];
    const deducted = payments.find(
      (item) => item.tds_deducted === 1500 && item.withdrawn === null,
    )!;
    const owner = (await stack.ask("GET", "/data/overview?owner=1")).json!.due as Body[];
    const row = owner.find(
      (item) => item.key === `person:${id}:challan:${String(deducted.payment_id)}`,
    )!;
    expect(row).toMatchObject({
      kind: "person",
      owner_only: true,
      title: "Deposit the tax deducted from Walk Intern One's stipend",
      due_on: "2026-03-07",
    });
    const admin = (await stack.ask("GET", "/data/overview")).json!.due as Body[];
    expect(JSON.stringify(admin)).not.toContain("Walk Intern One");
    expect(admin.some((item) => item.kind === "person")).toBe(false);
    expect(((await page()).tax_years as Body[])[0]).toMatchObject({
      tds_deducted_minor: 150_000,
      challans_missing: 1,
    });
    const path = `/data/people/${id}/payments/${String(deducted.payment_id)}/challan`;
    expect((await refusal(path, { number: "WALK-CHALLAN-1", bsr: "12345" })).message).toBe(
      "The BSR code is seven digits.",
    );
    expect((await refusal(path, { number: "pin: 1234" })).message).toBe(
      "Write the challan's number, never a password.",
    );
    const recorded = await ok(path, {
      number: "WALK-CHALLAN-1",
      bsr: "0000000",
      deposited_on: "2026-03-05",
    });
    expect(
      ((recorded.person as Body).payments as Body[]).find(
        (item) => item.payment_id === deducted.payment_id,
      )!.challan,
    ).toEqual({ number: "WALK-CHALLAN-1", bsr: "0000000", deposited_on: "2026-03-05" });
    const after = (await stack.ask("GET", "/data/overview?owner=1")).json!.due as Body[];
    expect(after.some((item) => String(item.key).includes(":challan:"))).toBe(false);
  });

  it("refuses to record or withdraw a payment in a locked month, through the stand-in", async () => {
    const installed = await ok("/data/_test/people/month-lock", { locked: ["2026-01"] });
    expect(installed).toMatchObject({ installed: true });
    const locked = await refusal(`/data/people/${id}/payments`, {
      period: "2026-03",
      amount: 15000,
      currency: "INR",
      paid_on: "2026-01-20",
      reference: "WALK-UTR-LOCKED",
    });
    expect(locked).toMatchObject({
      status: 409,
      code: "month_locked",
      message: "January 2026 is locked. Reopen it on Month close, with a reason, to change this.",
    });
    const january = ((await page()).person as Body).payments as Body[];
    const jan = january.find((item) => item.paid_on === "2026-01-31")!;
    expect(
      await refusal(`/data/people/${id}/payments/${String(jan.payment_id)}/withdraw`, {
        why: "Walk test.",
      }),
    ).toMatchObject({ status: 409, code: "month_locked" });
    // A payment dated in an open month is never blocked.
    await pay("2026-03", "2026-03-31");
    expect((await ok("/data/_test/people/month-lock", { on: false })).installed).toBe(false);
  });

  it("answers `people-pay` with paid, owed and the headcount", async () => {
    const answer = (
      await stack.ask("GET", "/data/_test/people/pay?from=2025-11-01&to=2026-03-31&day=2026-01-15")
    ).json!;
    const paid = answer.paid as Body[];
    expect(paid[0]).toEqual({
      payment_id: expect.any(String),
      person_id: id,
      name: "Walk Intern One",
      kind: "intern",
      period: "2025-11",
      amount_minor: 1_500_000,
      currency: "INR",
      paid_on: "2025-11-30",
      reference: "WALK-UTR-2025-11",
      tds_deducted_minor: null,
    });
    expect(
      paid.every((line) => line.paid_on !== "2026-02-28" || line.tds_deducted_minor === 150_000),
    ).toBe(true);
    expect(paid.map((line) => line.paid_on)).toEqual(
      [...paid.map((line) => String(line.paid_on))].sort(),
    );
    expect(answer.owed).toEqual([]);
    expect(answer.headcount).toEqual({ employees: 0, interns: 1, contractors: 0 });
    const later = (await stack.ask("GET", "/data/_test/people/pay?day=2026-06-01")).json!;
    expect(later.headcount).toEqual({ employees: 0, interns: 0, contractors: 0 });
  });

  it("writes the treatment and the challan into the CSV, and no amount into the events", async () => {
    const started = await stack.ask("POST", "/data/builds", { kind: "stipends_csv", by: WALKER });
    const buildId = String((started.json!.build as Body).build_id);
    let state = "building";
    for (let tries = 0; tries < 100 && state === "building"; tries += 1) {
      state = String(
        ((await stack.ask("GET", `/data/builds/${buildId}`)).json!.build as Body).state,
      );
      if (state === "building") await new Promise((resolve) => setTimeout(resolve, 20));
    }
    const text = (
      await stack.raw(stack.socket, "GET", `/data/builds/${buildId}/bytes`)
    ).bytes.toString("utf8");
    const lines = text.slice(1).trim().split("\r\n");
    expect(lines[0]!.endsWith(",tax_treatment,withdrawn,challan_number,challan_deposited_on")).toBe(
      true,
    );
    expect(
      lines.some((line) => line.endsWith(",Professional fee,,WALK-CHALLAN-1,2026-03-05")),
    ).toBe(true);
    const events = readFileSync(join(stack.dir, "data", "people", "events.jsonl"), "utf8");
    expect(events).not.toContain("15000");
    expect(events).not.toContain("1500");
    expect(events).not.toContain("ZZZPZ0000Z");
  });
});

describe("the Owner rule on every path (duties spec §2 rule 1)", () => {
  let all: Stack;
  let day = "";
  const NAME = "Walk Tax Owner";
  const PAN = "ZZZPZ0000Z";
  const leaks = (text: string) =>
    text.includes(NAME) || text.includes(PAN) || text.includes("WALK-CHALLAN-OWNER");

  beforeAll(async () => {
    all = await startStack({
      modules: [
        "files",
        "contacts",
        "dates",
        "people",
        "calendar",
        "search",
        "holidays",
        "cash",
        "backup",
      ],
    });
    day = String((await all.ask("GET", "/data/_test/day")).json?.day ?? "");
    const ask = async (path: string, body: Body) => {
      const answer = await all.ask("POST", path, { ...body, by: WALKER });
      expect(answer.status, `${path}: ${JSON.stringify(answer.json)}`).toBe(200);
      return answer.json!;
    };
    const shift = (count: number) => {
      const [y = 0, m = 1, d = 1] = day.split("-").map(Number);
      const moved = new Date(Date.UTC(y, m - 1, d + count));
      return moved.toISOString().slice(0, 10);
    };
    const added = await ask("/data/people", {
      name: NAME,
      email: "owner-paths@walkintern.example",
      kind: "intern",
      role_title: "Research intern",
      starts_on: shift(-40),
      ends_on: shift(60),
      mentor: "Walk Mentor",
      stipend: { amount: 17345, currency: "INR", pays_on: "month_end" },
    });
    const id = String((added.person as Body).person_id);
    await ask(`/data/people/${id}/tax`, {
      classification: "professional_fee",
      decided_by: "Walk CA",
      decided_role: "CA",
      decided_on: day,
      pan: PAN,
    });
    const paid = await ask(`/data/people/${id}/payments`, {
      period: shift(-40).slice(0, 7),
      amount: 17345,
      currency: "INR",
      paid_on: day,
      reference: "WALK-UTR-OWNER",
      tds_deducted: 1734,
    });
    const payment = ((paid.person as Body).payments as Body[])[0]!;
    await ask(`/data/people/${id}/tax/certificates`, {
      form: "131",
      period: "2026-27 Q3",
      issued_on: day,
      number: "WALK-CERT-OWNER",
    });
    // A second payment with tax and no challan, paid last month: a Due row for the Owner.
    await ask(`/data/people/${id}/payments`, {
      period: shift(-10).slice(0, 7),
      amount: 17345,
      currency: "INR",
      paid_on: shift(-25),
      reference: "WALK-UTR-OWNER-2",
      tds_deducted: 1734,
    });
    await ask(`/data/people/${id}/payments/${String(payment.payment_id)}/challan`, {
      number: "WALK-CHALLAN-OWNER",
      bsr: "0000000",
      deposited_on: day,
    });
    // An Owner's cash CSV, made before the Admin's backup.
    await ask("/data/builds", { kind: "cash_csv", owner: true });
  }, 60_000);
  afterAll(() => all.stop());

  it("keeps the ledger out of an Admin's Due, calendar, search and cash view", async () => {
    const owner = (await all.ask("GET", "/data/overview?owner=1")).json!;
    expect(
      (owner.due as Body[]).some(
        (row) =>
          row.owner_only === true && String(row.title).startsWith("Deposit the tax deducted"),
      ),
    ).toBe(true);
    for (const path of [
      "/data/overview",
      "/data/calendar/items",
      `/data/search?q=${encodeURIComponent("Walk Tax")}`,
      `/data/search?q=${PAN}`,
      "/data/cash",
      "/data/holidays",
    ]) {
      const answer = await all.ask("GET", path);
      expect(answer.status, path).toBe(200);
      // Search echoes the words asked for: only what it found is checked.
      const { query, ...found } = answer.json ?? {};
      void query;
      if (path.startsWith("/data/search")) expect(found.total, path).toBe(0);
      expect(leaks(JSON.stringify(found)), path).toBe(false);
      expect(JSON.stringify(answer.json), path).not.toContain("1734500");
    }
    // The Owner's cash view does carry the stipend: the flag is the only difference.
    const cash = JSON.stringify((await all.ask("GET", "/data/cash?owner=1")).json);
    expect(cash).toContain(NAME);
  });

  it("holds the tax fields and challans only in a backup the Owner makes", async () => {
    const out = mkdtempSync(join(tmpdir(), "hqtax-"));
    try {
      const made = async (people: boolean): Promise<string> => {
        const started = await all.ask("POST", "/data/builds", {
          kind: "backup",
          people,
          by: WALKER,
        });
        const buildId = String((started.json!.build as Body).build_id);
        await until(
          async () =>
            ((await all.ask("GET", `/data/builds/${buildId}`)).json!.build as Body).state ===
            "ready",
          "the backup",
          30_000,
        );
        const file = await all.raw(all.socket, "GET", `/data/builds/${buildId}/bytes`);
        const path = join(out, `tax-${String(people)}.zip`);
        writeFileSync(path, file.bytes);
        return path;
      };
      const list = (zip: string) =>
        execFileSync("unzip", ["-Z1", zip], { encoding: "utf8" }).split("\n").filter(Boolean);
      const read = (zip: string, name: string) => execFileSync("unzip", ["-p", zip, name]);
      const owners = await made(true);
      const ledger = read(owners, "data/people/people.json").toString();
      expect(ledger).toContain(PAN);
      expect(ledger).toContain("WALK-CHALLAN-OWNER");
      const others = await made(false);
      const names = list(others);
      expect(names.some((name) => name.startsWith("data/people/"))).toBe(false);
      for (const name of names)
        expect(leaks(read(others, name).toString("latin1")), name).toBe(false);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });
});
