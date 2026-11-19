// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { RULES } from "../../scripts/data/company-contracts";
import { CALENDAR_RULES } from "../../scripts/data/dates/rules";
import { addDays } from "../../scripts/data/days";
import { DUTY_RULES, type DutyRuleState } from "../../scripts/data/duties-contracts";
import { inventedPdf } from "../../scripts/data/files/walk-seed";
import { exportClocks } from "../../scripts/data/money/exports";
import {
  WALK_ACCOUNT,
  WALK_FILE_NAME,
  walkStatementCsv,
} from "../../scripts/data/statements/walk-seed";
import { GET as calendarFeedRoute } from "@/app/cal/[token]/route";
import { Scripted } from "./leads-kit";
import { WALKER, codeOf, startStack, until, type RawAnswer, type Stack } from "./helpers";

/**
 * The duties batch's seams with every module loaded (duties spec §3.5, §15). Each unit
 * proved its half against stand-ins; this file proves the halves meet: one rule book (45
 * new rows, `tds-deposit` being the calendar's own row, §15); a disputed rule that works
 * nothing out anywhere until it is confirmed; holidays moving the close; a statement line
 * paying a Money bill and taking it back; a stipend matched only as the Owner; the month
 * lock refusing changes in Money, the people ledger and Statements; the MIS and the frozen
 * update agreeing; a held bill copy in Files; the backup with and without the Owner's
 * parts; the catalogue hiding what the registers hold; search and the calendar; and
 * nothing sent. Every person, vendor, bank line and number is invented (spec §2 rule 6).
 *
 * Where a unit shipped a shape the spec did not say, the shipped one is tested and named:
 * an export invoice may be dated at most 7 days ahead, so the 30 Nov 2026 invoice of case 2
 * is worked out through Money's own `exportClocks` with the merged rule book's state, and
 * the Due and calendar rows are proved on an invoice of 30 Sep 2025 (U3); the edit log's
 * check answers `intact`, not `ok` (U3); emptying the trash keeps a held file (§15 item 3).
 */

type Body = Record<string, unknown>;
type Due = { key: string; kind: string; title: string; sub: string; due_on: string };
type LineRow = {
  line_id: string;
  narration: string;
  posted_on: string;
  match: Body | null;
  suggestions: { kind: string; ref: string; title: string; strength: string }[];
};

const LOCKED = "October 2026 is locked. Reopen it on Month close, with a reason, to change this.";
const INTERN = "Walk Intern One";
const OWNER = { owner: true };

let stack: Stack;
let today = "";
let out = "";
const mail = new Scripted();
const shared = new Scripted();

let legal = "";
let advisers = "";
let personId = "";
let stipendPaymentId = "";
let accountId = "";
let statementId = "";
let bill0007 = "";

const message = (answer: RawAnswer): string =>
  String(((answer.json?.error ?? {}) as { message?: unknown }).message ?? "");

async function ok(path: string, body: Body = {}): Promise<Body> {
  const answer = await stack.ask("POST", path, { by: WALKER, ...body });
  expect(answer.status, `${path}: ${message(answer)}`).toBe(200);
  return answer.json!;
}
const refusal = (path: string, body: Body = {}) => stack.ask("POST", path, { by: WALKER, ...body });

async function get(path: string): Promise<Body> {
  const answer = await stack.ask("GET", path);
  expect(answer.status, `${path}: ${message(answer)}`).toBe(200);
  return answer.json!;
}

/** Every Due row, the later ones past the first 30 included (the lead's merge fix). */
const dueAll = async (owner = true): Promise<Due[]> =>
  (await get(`/data/overview?due=all${owner ? "&owner=1" : ""}`)).due as Due[];
const agenda = async () =>
  (await get("/data/calendar/items")).items as {
    key: string;
    kind: string;
    title: string;
    plain: string;
    on: string;
    href: string;
  }[];
const dutyState = async (key: string): Promise<DutyRuleState> =>
  (await get(`/data/_test/dates/duty-state?key=${key}`)).state as DutyRuleState;

const addBill = async (vendorId: string, body: Body) =>
  (
    (await ok("/data/money/bills", {
      vendor_id: vendorId,
      attempt: crypto.randomUUID(),
      ...body,
    })) as { bill: Body }
  ).bill;
const billOf = async (id: string) =>
  (await get(`/data/money/bills/${id}`)).bill as Body & {
    state: string;
    open_minor: number;
    payments: { payment_id: string; reference: string; from_line: string | null }[];
    edits: { verb: string }[];
  };

const october = async (owner = true) =>
  stack.ask(
    "GET",
    `/data/statements/accounts/${accountId}/lines?${owner ? "owner=1&" : ""}month=2026-10&view=all`,
  );
const octoberLines = async () => ((await october()).json as { lines: LineRow[] }).lines;
const lineWith = (lines: LineRow[], words: string) =>
  lines.find((line) => line.narration.includes(words))!;

const close = async (period: string) =>
  (await get(`/data/close/${period}`)) as Body & {
    due_on: string | null;
    state: string;
    close: { history: { verb: string; why: string }[] };
  };

async function markReadyAndSend(period: string) {
  for (const key of ["statements", "bills", "stipend_sheet"])
    await ok(`/data/close/${period}/items/${key}`, { state: "ready" });
  for (const key of ["sales_invoices", "tds_challans", "firas"])
    await ok(`/data/close/${period}/items/${key}`, { state: "none_this_month" });
  await ok(`/data/close/${period}/items/gst_returns`, {
    state: "not_registered",
    note: "Not registered yet.",
  });
  await ok(`/data/close/${period}/sent`, { on: "2026-11-06", to_name: "Walk CA", how: "Email" });
}

const zipEntries = (zip: string): string[] =>
  execFileSync("unzip", ["-Z1", zip], { encoding: "utf8" }).split("\n").filter(Boolean);
const zipEntry = (zip: string, name: string): Buffer => execFileSync("unzip", ["-p", zip, name]);

async function backup(people: boolean): Promise<string> {
  const started = await ok("/data/builds", { kind: "backup", people });
  const buildId = String((started.build as Body).build_id);
  let state = "building";
  await until(
    async () => {
      state = String(((await get(`/data/builds/${buildId}`)).build as Body).state);
      return state !== "building";
    },
    "the backup",
    60_000,
  );
  expect(state).toBe("ready");
  const bytes = await stack.raw(stack.socket, "GET", `/data/builds/${buildId}/bytes`);
  const path = join(out, `backup-${String(people)}-${buildId}.zip`);
  writeFileSync(path, bytes.bytes);
  return path;
}

beforeAll(async () => {
  out = mkdtempSync(join(tmpdir(), "hqdm-"));
  // Every module, as the sender loads them (core.ts MODULES); both providers only record.
  stack = await startStack({
    env: true,
    liveProvider: () => mail,
    shareProvider: () => shared,
  });
  today = String((await get("/data/_test/day")).day);
  await ok("/data/money/categories/starter");
  legal = String(
    (
      (
        await ok("/data/money/vendors", {
          name: "Walk Legal LLP",
          residency: "resident",
          pan: "ZZZPZ0000Z",
          gstin: "00ZZZPZ0000Z1Z0",
          tds_kind: "professional",
        })
      ).vendor as Body
    ).vendor_id,
  );
  advisers = String(
    (
      (
        await ok("/data/money/vendors", {
          name: "Walk Advisers LLP",
          residency: "resident",
          tds_kind: "professional",
        })
      ).vendor as Body
    ).vendor_id,
  );
  // The walk intern of §9.12, paid for October with the statement line's reference.
  personId = String(
    (
      (
        await ok("/data/people", {
          name: INTERN,
          email: "one@walkintern.example",
          kind: "intern",
          role_title: "Research intern",
          starts_on: "2026-08-01",
          ends_on: "2027-01-31",
          mentor: "Walk Mentor",
          stipend: { amount: 15000, currency: "INR", pays_on: "month_end" },
        })
      ).person as Body
    ).person_id,
  );
  await ok(`/data/people/${personId}/tax`, {
    classification: "professional_fee",
    decided_by: "Walk CA",
    decided_role: "CA",
    decided_on: "2026-08-01",
    pan: "ZZZPZ0000Z",
  });
  const paid = await ok(`/data/people/${personId}/payments`, {
    period: "2026-10",
    amount: 15000,
    currency: "INR",
    paid_on: "2026-10-31",
    reference: "WALK-UTR-0015",
  });
  stipendPaymentId = String(
    (((paid.person as Body).payments as Body[]).find((item) => item.period === "2026-10") ?? {})
      .payment_id,
  );
}, 120_000);

afterAll(async () => {
  await stack.stop();
  rmSync(out, { recursive: true, force: true });
});

describe("the duties batch, merged (duties spec §3.5)", () => {
  it("1. the rule book is one: the company and calendar rules, then 45 new duty rows (tds-deposit is the calendar's own, §15); every stand-in route declines", async () => {
    const answer = await get("/data/dates/rules");
    const keys = (answer.rules as { key: string }[]).map((row) => row.key);
    const old = [...RULES.map((rule) => rule.key), ...CALENDAR_RULES.map((rule) => rule.key)];
    const dutyOnly = DUTY_RULES.map((rule) => rule.key).filter((key) => key !== "tds-deposit");
    // §15: 46 duty rules in the contract, one of them the calendar's `tds-deposit` row.
    expect(DUTY_RULES).toHaveLength(46);
    expect(old).toContain("tds-deposit");
    expect(dutyOnly).toHaveLength(45);
    expect(keys).toEqual([...old, ...dutyOnly]);
    expect(new Set(keys).size).toBe(keys.length);
    expect((answer.counts as Body).all).toBe(old.length + 45);

    const routes: [string, Body][] = [
      ["/data/_test/incidents/duty-rules", {}],
      ["/data/_test/marks/duty-rules", {}],
      ["/data/_test/domains/duty-rules", {}],
      ["/data/_test/money/duty-rules", {}],
      ["/data/_test/money/month-lock", { locked: ["2026-10"] }],
      ["/data/_test/statements/money", {}],
      ["/data/_test/statements/people-pay", {}],
      ["/data/_test/statements/duty-rules", {}],
      ["/data/_test/close/holidays", { days: [] }],
      ["/data/_test/close/duty-rules", {}],
      ["/data/_test/cash/money", {}],
      ["/data/_test/cash/people-pay", {}],
      ["/data/_test/cash/statements", {}],
      ["/data/_test/cash/duty-rules", {}],
      ["/data/_test/people/month-lock", { locked: ["2026-10"] }],
      ["/data/_test/people/duty-rules", {}],
      ["/data/_test/dates/registers", { domains: 1, signing: 1, marks: 1 }],
    ];
    for (const [path, body] of routes)
      expect((await ok(path, body)) as Body, path).toMatchObject({ installed: false, real: true });
  });

  it("2. a conflict stays silent until confirmed, everywhere: export realisation and the professional-fee limit", async () => {
    // Shipped shape (U3): an invoice may be dated at most 7 days ahead, so this one is older.
    const invoice = (
      (await ok("/data/money/exports", {
        customer: "Walk Customer Inc",
        country: "United States",
        invoice_number: "WALK-EXP-0930",
        invoice_on: "2025-09-30",
        currency: "USD",
        amount: "5000",
        tax_treatment: "under_lut",
        purpose_code: "P0802",
        attempt: crypto.randomUUID(),
      })) as { invoice: Body }
    ).invoice;
    const id = String(invoice.invoice_id);
    const realiseKey = `export:${id}:realise`;
    const read = async () =>
      ((await get(`/data/money/exports/${id}`)) as { invoice: Body }).invoice;
    expect(await read()).toMatchObject({ realise_by: null, readings: ["9 months", "15 months"] });
    expect((await dueAll()).some((row) => row.key === realiseKey)).toBe(false);
    expect((await agenda()).some((item) => item.key === realiseKey)).toBe(false);
    // The 30 Nov 2026 invoice of §3.5, through Money's own clocks and the merged rule book.
    const unconfirmed = await dutyState("export-realisation");
    expect(exportClocks("2026-11-30", () => unconfirmed).realise_by).toBeNull();

    // The vendor's year-to-date line, before the professional-fee limit is confirmed.
    for (const [number, on, taxable, gst] of [
      ["WALK-ADV-0005", "2026-06-10", "20000", "3600"],
      ["WALK-ADV-0006", "2026-09-05", "25000", "4500"],
      ["WALK-ADV-0007", "2026-11-12", "10000", "1800"],
    ] as const)
      await addBill(advisers, { invoice_number: number, invoice_on: on, taxable, gst });
    const year = async () =>
      (
        (await get(`/data/money/vendors/${advisers}`)).years as {
          fy: string;
          line: string;
          rule: { readings: readonly string[]; usable: boolean } | null;
        }[]
      )[0]!;
    const before = await year();
    expect(before).toMatchObject({
      fy: "2026-27",
      line: "₹55,000 billed in 2026-27.",
      rule: { readings: ["₹50,000", "₹30,000"], usable: false },
    });

    const cashBefore = await get("/data/cash?owner=1");
    await ok("/data/dates/rules/export-realisation/confirm", {
      name: "Walk CA",
      role: "CA",
      on: today,
      reading: 1,
    });
    const confirmed = await dutyState("export-realisation");
    expect(confirmed).toMatchObject({ amount: 15, usable: true, confirmed: true });
    expect(exportClocks("2026-11-30", () => confirmed).realise_by).toBe("2028-02-29");
    expect(await read()).toMatchObject({ realise_by: "2026-12-30", readings: [] });
    const row = (await dueAll()).find((item) => item.key === realiseKey);
    expect(row).toMatchObject({ kind: "export", due_on: "2026-12-30" });
    expect((await agenda()).find((item) => item.key === realiseKey)).toMatchObject({
      kind: "export",
      on: "2026-12-30",
    });
    // The cash view does not change: a realisation day is not money in.
    const cashAfter = await get("/data/cash?owner=1");
    for (const part of ["weeks", "tables", "tiles", "scenarios"])
      expect(JSON.stringify(cashAfter[part]), part).toBe(JSON.stringify(cashBefore[part]));

    await ok("/data/dates/rules/tds-professional-year/confirm", {
      name: "Walk CA",
      role: "CA",
      on: today,
      reading: 0,
    });
    const after = await year();
    expect(after.line).toMatch(/^₹55,000 in 2026-27: over the ₹50,000 limit/);
    expect(after.rule).toMatchObject({ usable: true, readings: [] });
  });

  it("3. holidays move the close: 6 Nov 2026 with none, 9 Nov 2026 after a company holiday on 4 Nov, and the Due row moves", async () => {
    expect((await close("2026-10")).due_on).toBe("2026-11-06");
    const dueRow = async () => (await dueAll()).find((row) => row.key === "close:2026-10");
    expect((await dueRow())?.due_on).toBe("2026-11-06");
    await ok("/data/holidays", { on: "2026-11-04", name: "Walk company day", kind: "company" });
    expect((await close("2026-10")).due_on).toBe("2026-11-09");
    expect((await dueRow())?.due_on).toBe("2026-11-09");
  });

  it("4. a statement line pays a bill: suggested as sure, matched through money.recordPayment, taken back, the edit log intact", async () => {
    bill0007 = String(
      (
        await addBill(legal, {
          invoice_number: "WALK-INV-0007",
          invoice_on: "2026-10-02",
          taxable: "10000",
          gst: "1800",
        })
      ).bill_id,
    );
    accountId = String(
      ((await ok("/data/statements/accounts", { ...OWNER, ...WALK_ACCOUNT })).account as Body)
        .account_id,
    );
    const preview = (
      await ok(`/data/statements/accounts/${accountId}/preview`, {
        ...OWNER,
        name: WALK_FILE_NAME,
        content: Buffer.from(walkStatementCsv(), "utf8").toString("base64"),
      })
    ).preview as Body;
    expect(preview.import_id).toEqual(expect.any(String));
    const imported = await ok(`/data/statements/accounts/${accountId}/import`, {
      ...OWNER,
      import_id: preview.import_id,
    });
    statementId = String((imported.statement as Body).statement_id);

    const legalLine = lineWith(await octoberLines(), "WALK LEGAL LLP WALK-INV-0007");
    expect(legalLine.suggestions[0]).toMatchObject({
      kind: "bill",
      ref: `bill:${bill0007}`,
      title: "Walk Legal LLP WALK-INV-0007",
      strength: "sure",
    });
    const matched = await ok(`/data/statements/lines/${legalLine.line_id}/match`, {
      ...OWNER,
      ref: `bill:${bill0007}`,
    });
    expect((matched.line as LineRow).match).toMatchObject({
      kind: "bill_payment",
      bill_id: bill0007,
      made_here: true,
    });
    const paid = await billOf(bill0007);
    expect(paid.state).toBe("paid");
    expect(paid.payments).toHaveLength(1);
    expect(paid.payments[0]).toMatchObject({ reference: "WALK-UTR-0007", from_line: "statement" });

    await ok(`/data/statements/lines/${legalLine.line_id}/unmatch`, {
      ...OWNER,
      why: "Matched to the wrong bill.",
    });
    const open = await billOf(bill0007);
    expect(open.open_minor).toBe(1_180_000);
    expect(open.state).not.toBe("paid");
    expect(open.edits.map((line) => line.verb)).toEqual(["added", "paid", "payment taken back"]);
    expect(await get("/data/money/edits/verify")).toMatchObject({ intact: true, broken_at: null });

    // "Accept the sure matches" pays it again, for the cases that follow.
    const accepted = await ok(`/data/statements/accounts/${accountId}/accept-sure`, {
      ...OWNER,
      month: "2026-10",
    });
    expect(accepted).toMatchObject({ accepted: 1 });
    expect((await billOf(bill0007)).state).toBe("paid");
  });

  it("5. a stipend is matched only as the Owner, and Numbers carries the cash with no line, name or narration", async () => {
    const stipend = lineWith(await octoberLines(), "INTERN ONE STIPEND");
    expect(stipend.suggestions).toEqual([
      expect.objectContaining({
        kind: "stipend",
        ref: `stipend:${personId}:${stipendPaymentId}`,
        title: `Stipend: ${INTERN}, October 2026`,
        strength: "sure",
      }),
    ]);
    const bare = await october(false);
    expect([bare.status, codeOf(bare)]).toEqual([403, "owner_only"]);
    const linked = await ok(`/data/statements/lines/${stipend.line_id}/match`, {
      ...OWNER,
      ref: `stipend:${personId}:${stipendPaymentId}`,
    });
    expect((linked.line as LineRow).match).toEqual({
      kind: "stipend",
      person_id: personId,
      payment_id: stipendPaymentId,
    });
    const numbers = await get("/data/numbers");
    const money = numbers.money as { computed: Body[]; statements_here: boolean };
    expect(money.statements_here).toBe(true);
    expect(money.computed[0]).toMatchObject({ currency: "INR", cash_minor: 120_000_000 });
    const text = JSON.stringify(numbers);
    for (const word of ["NEFT", "STIPEND", INTERN, "WALK-UTR", "WALK LEGAL", "narration"])
      expect(text.includes(word), word).toBe(false);
  });

  it("6. the lock holds across units: a bill, a payment, a stipend payment and a statement refused; a November payment accepted; reopened with a reason", async () => {
    const twelfth = String(
      (
        await addBill(legal, {
          invoice_number: "WALK-INV-0012",
          invoice_on: "2026-10-12",
          taxable: "5000",
          gst: "900",
        })
      ).bill_id,
    );
    await markReadyAndSend("2026-10");
    await ok("/data/close/2026-10/lock");
    expect((await close("2026-10")).state).toBe("locked");

    const refusals = {
      bill: await refusal(`/data/money/bills/${twelfth}/update`, { description: "Walk advice" }),
      payment: await refusal(`/data/money/bills/${twelfth}/payments`, {
        paid_on: "2026-10-20",
        amount: "5900",
      }),
      stipend: await refusal(`/data/people/${personId}/payments/${stipendPaymentId}/withdraw`, {
        why: "Recorded twice by mistake.",
      }),
      statement: await refusal(`/data/statements/${statementId}/withdraw`, {
        ...OWNER,
        why: "A test of the lock.",
      }),
    };
    for (const [what, answer] of Object.entries(refusals)) {
      expect([answer.status, codeOf(answer)], what).toEqual([409, "month_locked"]);
      expect(message(answer), what).toBe(LOCKED);
    }
    const november = await ok(`/data/money/bills/${twelfth}/payments`, {
      paid_on: "2026-11-03",
      amount: "5,900",
      reference: "WALK-UTR-0012",
    });
    expect((november.bill as Body).state).toBe("paid");

    expect((await refusal("/data/close/2026-10/reopen", { why: "no" })).status).toBe(400);
    await ok("/data/close/2026-10/reopen", {
      why: "The advice bill was booked to the wrong month.",
    });
    const edited = await ok(`/data/money/bills/${twelfth}/update`, { description: "Walk advice" });
    expect((edited.bill as Body).description).toBe("Walk advice");
    const history = (await close("2026-10")).close.history;
    expect(history.at(-1)).toMatchObject({
      verb: "reopened",
      why: "The advice bill was booked to the wrong month.",
    });
  });

  it("7. the MIS and the frozen update agree once October is locked, and stay equal after a November statement", async () => {
    // The customers' money sorted as Money's own "Customer receipts", so net burn is §5.5's.
    const receipts = (
      (await get("/data/money/ledger")).categories as { category_id: string; name: string }[]
    ).find((category) => category.name === "Customer receipts")!.category_id;
    for (const month of ["2026-08", "2026-10"]) {
      const lines = (
        (await get(
          `/data/statements/accounts/${accountId}/lines?owner=1&month=${month}&view=all`,
        )) as { lines: LineRow[] }
      ).lines;
      for (const line of lines.filter((item) => item.narration.includes("SUBSCRIPTION")))
        await ok(`/data/statements/lines/${line.line_id}/category`, {
          ...OWNER,
          category_id: receipts,
        });
    }
    await ok("/data/close/2026-10/lock");
    const agree = async () => {
      const update = (await get("/data/numbers/updates/2026-10")) as {
        numbers: { cash: Body[] };
      };
      const mis = ((await get("/data/close/2026-10/mis")) as { mis: { burn: Body[] } }).mis;
      const cash = update.numbers.cash.find((row) => row.currency === "INR")!;
      const burn = mis.burn.find((row) => row.currency === "INR")!;
      expect(cash).toMatchObject({ source: "mis", as_of: "2026-10-31" });
      expect(Number(cash.cash) * 100).toBe(burn.cash_minor);
      expect(Number(cash.burn_per_month) * 100).toBe(burn.avg_net_minor);
      expect(cash.runway_months).toBe(burn.runway_months);
      expect(cash.zero_on).toBe(burn.zero_on);
      return { cash, burn };
    };
    const first = await agree();
    expect(first.burn).toMatchObject({ cash_minor: 120_000_000, avg_net_minor: 15_000_000 });

    const november = walkStatementCsv(
      [
        ["02/11/2026", "NEFT WALK CLOUD HOSTING NOV", "WALK-REF-1101", 40_000, 0],
        ["05/11/2026", "WALK CUSTOMER ONE SUBSCRIPTION", "WALK-REF-1102", 0, 10_000],
      ],
      1_200_000,
    );
    const preview = (
      await ok(`/data/statements/accounts/${accountId}/preview`, {
        ...OWNER,
        name: "walk-bank-current-2026-11.csv",
        content: Buffer.from(november, "utf8").toString("base64"),
      })
    ).preview as Body;
    await ok(`/data/statements/accounts/${accountId}/import`, {
      ...OWNER,
      import_id: preview.import_id,
      from: "2026-11-01",
      to: "2026-11-05",
    });
    const computed = ((await get("/data/numbers")).money as { computed: Body[] }).computed[0]!;
    expect(computed.cash_minor).toBe(117_000_000);
    const second = await agree();
    expect(second).toEqual(first);
  });

  it("8. the hold: a bill's PDF in Files' trash is refused forever until 31 Mar 2035, kept when the trash is emptied; a loose file goes", async () => {
    const pdf = Buffer.from(
      await inventedPdf(["Invented for a test: Walk Legal LLP, WALK-INV-0108."], "Walk bill"),
    ).toString("base64");
    const bill = await addBill(legal, {
      invoice_number: "WALK-INV-0108",
      invoice_on: "2026-11-12",
      taxable: "1000",
      content: pdf,
      name: "walk-inv-0108.pdf",
    });
    const fileId = String(bill.file_id);
    expect(bill.held_until).toBe("2035-03-31");
    const loose = String(
      (
        (await ok("/data/_test/files/put", {
          title: "Walk loose note",
          name: "walk-loose.txt",
          base64: Buffer.from("Invented").toString("base64"),
        })) as { file: Body }
      ).file.file_id,
    );
    await ok(`/data/files/${loose}/trash`);
    await ok(`/data/files/${fileId}/trash`);
    const refused = await refusal(`/data/files/${fileId}/delete-forever`);
    expect([refused.status, codeOf(refused)]).toEqual([409, "held"]);
    expect(message(refused)).toBe(
      "A bill from Walk Legal LLP, 12 Nov 2026 is kept until 31 Mar 2035, so it cannot be deleted. It can stay in the trash.",
    );
    // §15 item 3: emptying the trash deletes what is not held and keeps the held one.
    const asked = await refusal("/data/trash/empty", { confirm: "0" });
    const count = /Type ([\d,]+) to delete/.exec(message(asked))?.[1] ?? "";
    const emptied = await ok("/data/trash/empty", { confirm: count });
    expect(emptied).toMatchObject({ kept: 1 });
    expect(Number(emptied.deleted)).toBe(Number(count.replace(/,/g, "")) - 1);
    expect((await stack.ask("GET", `/data/files/${fileId}`)).status).toBe(200);
    expect((await stack.ask("GET", `/data/files/${loose}`)).status).toBe(404);
  });

  it("9. the backup: the Owner's holds statements, their files, the people ledger with tax, money and the close; the Admin's holds none of the Owner's parts and says so", async () => {
    const listed = (await get("/data/statements?owner=1")) as {
      accounts: { statements: { statement_id: string; file: { stored: string } }[] }[];
    };
    const stored = listed.accounts[0]!.statements[0]!.file.stored;
    const owners = await backup(true);
    const ownerNames = zipEntries(owners);
    expect(ownerNames).toContain("data/statements/accounts.json");
    expect(ownerNames).toContain(`data/statements/files/${stored}`);
    expect(stored).toMatch(/\.csv$/);
    expect(ownerNames).toContain("data/people/people.json");
    expect(zipEntry(owners, "data/people/people.json").toString()).toContain(
      '"classification":"professional_fee"',
    );
    expect(ownerNames.some((name) => name.startsWith("data/money/"))).toBe(true);
    expect(ownerNames).toContain("data/close/months/2026-10.json");
    expect(ownerNames).toContain("data/close/owner/2026-10.json");

    const admins = await backup(false);
    const adminNames = zipEntries(admins);
    for (const folder of ["data/statements/", "data/people/", "data/close/owner/"])
      expect(
        adminNames.some((name) => name.startsWith(folder)),
        folder,
      ).toBe(false);
    expect(adminNames.some((name) => name.startsWith("data/money/"))).toBe(true);
    expect(adminNames).toContain("data/close/mis/2026-10.json");
    for (const name of adminNames) {
      const bytes = zipEntry(admins, name);
      expect(
        bytes.includes("NEFT WALK") || bytes.includes(INTERN) || bytes.includes("WALK-UTR-0015"),
        name,
      ).toBe(false);
    }
    expect(zipEntry(admins, "README.txt").toString()).toContain(
      "- data/people/ is left out: only a backup the Owner makes holds the people ledger. data/statements/ and data/close/owner/ are left out too: only a backup the Owner makes holds the bank statements and the MIS's people figures.",
    );
  }, 120_000);

  it("10. the catalogue hides the domain, the signing certificate and the trademark once Registers holds one of each; a date already added stays", async () => {
    const before = (await get("/data/dates")).suggestions as { key: string }[];
    for (const key of ["domain", "code-signing", "trademark"])
      expect(
        before.some((row) => row.key === key),
        key,
      ).toBe(true);
    const added = (
      (await ok("/data/dates/suggested/domain/add", { due_on: addDays(today, 30) })) as {
        date: Body;
      }
    ).date;
    await ok("/data/domains", {
      name: "walk.example",
      purpose: "main",
      registrar: "Walk Registrar",
      account_holder: "Walk Owner",
      expires_on: addDays(today, 30),
      auto_renew: "no",
    });
    await ok("/data/domains/signing", {
      name: "Walk Mac signing",
      platform: "mac",
      issuer: "Walk Test Authority",
      issued_on: "2026-06-01",
      expires_on: "2027-09-04",
      kept: "A token in the office safe",
    });
    const mark = (
      (await ok("/data/marks", {
        name: "WALK MARK",
        class_number: "9",
        application_number: "WALK-0000001",
        applied_on: addDays(today, -40),
        agent: "Walk Agent",
      })) as { mark: Body }
    ).mark;
    await ok(`/data/marks/${String(mark.mark_id)}/step`, {
      step: "exam_report",
      on: addDays(today, -5),
    });
    const after = await get("/data/dates");
    const keys = (after.suggestions as { key: string }[]).map((row) => row.key);
    for (const key of ["domain", "code-signing", "trademark"])
      expect(keys.includes(key), key).toBe(false);
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
    // The domain's own row was added before, so it is not "hidden": it is his date, and stays.
    const dates = (await get("/data/dates?view=all")).dates as { date_id: string }[];
    expect(dates.some((date) => date.date_id === added.date_id)).toBe(true);
  });

  it("11. search has Incidents, Trademarks, Domains, Vendors and Bills and nothing of statements or people; the calendar has each duty kind, and kinds only names no vendor", async () => {
    await ok("/data/incidents", {
      title: "Walk phishing message",
      kind: "phishing",
      severity: "high",
      aware_day: today,
      aware_time: "00:01",
    });
    await ok("/data/holidays", {
      on: addDays(today, 20),
      name: "Walk company day two",
      kind: "company",
    });
    await addBill(advisers, {
      invoice_number: "WALK-ADV-0011",
      invoice_on: addDays(today, -1),
      taxable: "1000",
      pay_by: addDays(today, 10),
    });
    const groups = (await get("/data/search?q=walk")).groups as {
      kind: string;
      label: string;
      hits: { title: string }[];
    }[];
    const labels = groups.map((group) => group.label);
    expect(labels).toEqual(
      expect.arrayContaining(["Incidents", "Trademarks", "Domains", "Vendors", "Bills"]),
    );
    expect(groups.map((group) => group.kind)).not.toContain("person");
    const found = JSON.stringify(groups);
    for (const word of [INTERN, "NEFT", "STIPEND", "WALK-UTR-0015"])
      expect(found.includes(word), word).toBe(false);
    expect((await get("/data/search?q=intern")).groups).toEqual([]);

    const items = await agenda();
    for (const kind of ["holiday", "mark", "domain", "bill", "close"])
      expect(
        items.some((item) => item.kind === kind),
        kind,
      ).toBe(true);
    expect(items.some((item) => item.kind === "bill" && item.title.includes("Walk Advisers"))).toBe(
      true,
    );
    const duty = items.filter((item) =>
      ["holiday", "mark", "domain", "bill", "export", "close"].includes(item.kind),
    );
    for (const item of duty)
      expect(/Walk (Legal|Advisers|Customer)/.test(item.plain), item.key).toBe(false);

    await ok("/data/calendar/detail", { detail: "plain" });
    const token = String((await ok("/data/calendar/link")).token);
    const response = await calendarFeedRoute(
      new NextRequest(`http://127.0.0.1:3140/cal/${token}`),
      {
        params: Promise.resolve({ token }),
      },
    );
    expect(response.status).toBe(200);
    const ics = (await response.text()).replace(/\r\n[ \t]/g, "").replace(/\\,/g, ",");
    expect(ics).toContain("SUMMARY:Bill to pay");
    for (const word of ["Walk Legal", "Walk Advisers", "Walk Customer", INTERN])
      expect(ics.includes(word), word).toBe(false);
  });

  it("12. nothing was sent: no mail, no share, and the written log is empty", async () => {
    expect(mail.sent).toEqual([]);
    expect(shared.sent).toEqual([]);
    const overview = await get("/data/overview");
    expect(overview.sent_today).toBe(0);
    expect((overview.week as { sent: number }[]).every((day) => day.sent === 0)).toBe(true);
  });
});
