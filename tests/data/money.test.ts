// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { inventedPdf } from "../../scripts/data/files/walk-seed";
import { WALKER, codeOf, startStack, type RawAnswer, type Stack } from "./helpers";

/**
 * Money's records through the service (ws-notes/duties/spec.md §8.3–§8.5, §8.7): the month
 * lock through the stand-in (an October bill refused, a November payment on it accepted);
 * unique invoice numbers; a cancel refused with a live payment; totals that never add
 * currencies; `recordPayment` and the take-back as the statements module calls them; the
 * pack's files; search; the agenda's `plain` naming no vendor; the starter categories added
 * once; the vendor's shapes and the foreign decision. Every vendor and customer is invented.
 */

let stack: Stack;
const post = (path: string, body: Record<string, unknown> = {}) =>
  stack.ask("POST", path, { by: WALKER, ...body });
const message = (answer: RawAnswer) =>
  String((answer.json?.error as { message?: unknown } | undefined)?.message ?? "");

type BillRow = { bill_id: string; state: string; open_minor: number; currency: string };

let legal = "";
let cloud = "";

beforeAll(async () => {
  stack = await startStack({ modules: ["files", "contacts", "money"] });
  await post("/data/_test/money/duty-rules", {});
  legal = String(
    (
      (
        await post("/data/money/vendors", {
          name: "Walk Legal LLP",
          residency: "resident",
          pan: "ZZZPZ0000Z",
          gstin: "00ZZZPZ0000Z1Z0",
          tds_kind: "professional",
        })
      ).json?.vendor as { vendor_id: string }
    ).vendor_id,
  );
}, 60_000);
afterAll(() => stack.stop());

const addBill = (body: Record<string, unknown>) =>
  post("/data/money/bills", { vendor_id: legal, attempt: crypto.randomUUID(), ...body });

describe("vendors", () => {
  it("checks the shapes, and the GSTIN against the PAN as a check line", async () => {
    const pan = await post("/data/money/vendors", { name: "Walk Shape Co", pan: "ZZZ0000" });
    expect(message(pan)).toBe("Type the PAN as ten letters and digits, such as AAACQ1234Q.");
    const udyam = await post("/data/money/vendors", {
      name: "Walk Shape Co",
      udyam_number: "UDYAM-1",
    });
    expect(message(udyam)).toBe(
      "Type the Udyam number as on the certificate, such as UDYAM-XX-00-0000000.",
    );
    const taken = await post("/data/money/vendors", { name: "walk legal llp" });
    expect(codeOf(taken)).toBe("taken");
    expect(message(taken)).toBe("There is already a vendor named walk legal llp.");
    const notes = await post("/data/money/vendors", {
      name: "Walk Shape Co",
      notes: "Pay to account 123456789012345",
    });
    expect(message(notes)).toBe(
      "Never type a full bank account or card number here: the last four digits are enough.",
    );
    const mismatch = await post("/data/money/vendors", {
      name: "Walk Shape Co",
      pan: "ZZZPZ0000Y",
      gstin: "00ZZZPZ0000Z1Z0",
    });
    expect(mismatch.status).toBe(200);
    expect(mismatch.json?.checks).toContain("The GSTIN's PAN part is not this PAN.");
  });

  it("a vendor abroad: the forms' names wait for the CA, and a decision needs who, role and day", async () => {
    const added = await post("/data/money/vendors", {
      name: "Walk Cloud Inc",
      residency: "non_resident",
      country: "United States",
    });
    cloud = String((added.json?.vendor as { vendor_id: string }).vendor_id);
    expect(added.json?.forms).toMatchObject({
      confirmed_label: null,
      reading: null,
      rule: {
        key: "foreign-forms",
        usable: false,
        readings: ["Forms 145 and 146", "Forms 15CA and 15CB"],
      },
    });
    const half = await post(`/data/money/vendors/${cloud}/foreign`, {
      paid_by: "card",
      card_forex_rate: "2.5",
      decision_tds: "do_not_deduct",
    });
    expect(message(half)).toBe("Say who decided.");
    const rate = await post(`/data/money/vendors/${cloud}/foreign`, { card_forex_rate: "12" });
    expect(message(rate)).toBe("Type the exchange cost as a number from 0 to 10, such as 2.5.");
    const decided = await post(`/data/money/vendors/${cloud}/foreign`, {
      bills_from: "abroad",
      paid_by: "card",
      gst: "not_registered_for_gst",
      card_forex_rate: "2.5",
      decision_tds: "do_not_deduct",
      decision_basis: "Walk CA's note: a subscription paid by card.",
      decision_forms: "none",
      decided_by: "Walk CA",
      decided_role: "CA",
      decided_on: "2026-11-14",
    });
    expect(decided.status).toBe(200);
    expect((decided.json?.vendor as { foreign: unknown }).foreign).toMatchObject({
      card_forex_rate: 2.5,
      decision: { tds: "do_not_deduct", decided_by: "Walk CA", decided_on: "2026-11-14" },
    });
    expect((decided.json?.edits as { verb: string }[]).map((line) => line.verb)).toEqual([
      "added",
      "decision recorded",
    ]);
    const resident = await post(`/data/money/vendors/${legal}/foreign`, { paid_by: "card" });
    expect(codeOf(resident)).toBe("not_abroad");
  });
});

describe("bills", () => {
  it("refuses a second bill with one number from one vendor, and a total that does not add up is a check", async () => {
    expect(
      (
        await addBill({
          invoice_number: "WALK-INV-0101",
          invoice_on: "2026-11-02",
          taxable: "1000",
        })
      ).status,
    ).toBe(200);
    const again = await addBill({
      invoice_number: "walk-inv-0101",
      invoice_on: "2026-11-03",
      taxable: "5",
    });
    expect(codeOf(again)).toBe("taken");
    expect(message(again)).toBe("Walk Legal LLP already has a bill numbered walk-inv-0101.");
    const odd = await addBill({
      invoice_number: "WALK-INV-0102",
      invoice_on: "2026-11-02",
      taxable: "1,000",
      gst: "180",
      total: "1,190.50",
    });
    expect((odd.json?.bill as { checks: string[] }).checks).toContain(
      "The parts add up to ₹1,180, not the total ₹1,190.50.",
    );
    const amount = await addBill({
      invoice_number: "WALK-INV-0103",
      invoice_on: "2026-11-02",
      taxable: "12.345",
    });
    expect(message(amount)).toBe("Type the amount as a number, such as 1180.50.");
  });

  it("the month lock: an October bill is refused, a November payment on it accepted", async () => {
    const october = (
      await addBill({
        invoice_number: "WALK-INV-0110",
        invoice_on: "2026-10-12",
        taxable: "10000",
        gst: "1800",
      })
    ).json?.bill as { bill_id: string };
    expect(
      (await post("/data/_test/money/month-lock", { locked: ["2026-10"] })).json,
    ).toMatchObject({ installed: true });
    const sentence =
      "October 2026 is locked. Reopen it on Month close, with a reason, to change this.";
    const edit = await post(`/data/money/bills/${october.bill_id}/update`, {
      description: "Walk advice",
    });
    expect(edit.status).toBe(409);
    expect(codeOf(edit)).toBe("month_locked");
    expect(message(edit)).toBe(sentence);
    const paidOctober = await post(`/data/money/bills/${october.bill_id}/payments`, {
      paid_on: "2026-10-20",
      amount: "11800",
    });
    expect(message(paidOctober)).toBe(sentence);
    const added = await addBill({
      invoice_number: "WALK-INV-0111",
      invoice_on: "2026-10-30",
      taxable: "1",
    });
    expect(codeOf(added)).toBe("month_locked");
    const page = (await stack.ask("GET", `/data/money/bills/${october.bill_id}`)).json;
    expect(page).toMatchObject({ bill: { locked: true }, lock_words: sentence });
    const november = await post(`/data/money/bills/${october.bill_id}/payments`, {
      paid_on: "2026-11-03",
      amount: "11,800",
      reference: "WALK-UTR-0110",
    });
    expect(november.status).toBe(200);
    expect((november.json?.bill as { state: string }).state).toBe("paid");
    expect((await post("/data/_test/money/month-lock", { on: false })).json).toMatchObject({
      installed: false,
    });
    expect(
      (await post(`/data/money/bills/${october.bill_id}/update`, { description: "Walk advice" }))
        .status,
    ).toBe(200);
  });

  it("a cancel is refused while a payment stands, and goes through once it is taken back", async () => {
    const bill = (
      await addBill({ invoice_number: "WALK-INV-0120", invoice_on: "2026-11-05", taxable: "500" })
    ).json?.bill as { bill_id: string };
    const paid = (
      await post(`/data/money/bills/${bill.bill_id}/payments`, {
        paid_on: "2026-11-06",
        amount: "500",
      })
    ).json?.bill as { payments: { payment_id: string }[] };
    const refused = await post(`/data/money/bills/${bill.bill_id}/cancel`, { why: "Issued twice" });
    expect(message(refused)).toBe("Take the payments back first.");
    expect(message(await post(`/data/money/bills/${bill.bill_id}/cancel`, { why: "no" }))).toBe(
      "Say why, in at least five characters.",
    );
    await post(
      `/data/money/bills/${bill.bill_id}/payments/${paid.payments[0]!.payment_id}/take-back`,
      {
        why: "Paid the wrong bill",
      },
    );
    const cancelled = await post(`/data/money/bills/${bill.bill_id}/cancel`, {
      why: "Issued twice",
    });
    expect((cancelled.json?.bill as { state: string }).state).toBe("cancelled");
  });

  it("totals never add a rupee figure to a dollar figure", async () => {
    await post("/data/money/bills", {
      vendor_id: cloud,
      invoice_number: "WALK-CL-0001",
      invoice_on: "2026-11-01",
      currency: "USD",
      taxable: "120",
      attempt: crypto.randomUUID(),
    });
    const page = (await stack.ask("GET", "/data/money?view=open")).json as {
      totals: { open: Record<string, number> };
      bills: BillRow[];
    };
    expect(Object.keys(page.totals.open).sort()).toEqual(["INR", "USD"]);
    expect(page.totals.open.USD).toBe(12_000);
    const inr = page.bills
      .filter((row) => row.currency === "INR")
      .reduce((sum, row) => sum + row.open_minor, 0);
    expect(page.totals.open.INR).toBe(inr);
    // A payment on a dollar bill needs the rupees that left the bank.
    const usd = page.bills.find((row) => row.currency === "USD")!;
    const noRupees = await post(`/data/money/bills/${usd.bill_id}/payments`, {
      paid_on: "2026-11-02",
      amount: "120",
    });
    expect(message(noRupees)).toBe("Type the rupees that left the bank for this payment.");
    const paid = await post(`/data/money/bills/${usd.bill_id}/payments`, {
      paid_on: "2026-11-02",
      amount: "120",
      inr: "10,560",
      forex: "264",
      method: "card",
    });
    expect((paid.json?.bill as { state: string }).state).toBe("paid");
  });

  it("recordPayment and its take-back, as the statements module calls them", async () => {
    const bill = (
      await addBill({
        invoice_number: "WALK-INV-0130",
        invoice_on: "2026-11-07",
        taxable: "10000",
        gst: "1800",
      })
    ).json?.bill as { bill_id: string };
    const recorded = await post("/data/_test/money/record-payment", {
      bill_id: bill.bill_id,
      paid_on: "2026-11-09",
      amount_minor: 1_180_000,
      reference: "WALK-UTR-0130",
    });
    expect(recorded.status).toBe(200);
    const view = recorded.json?.bill as {
      open_minor: number;
      payable_minor: number;
      payments: { payment_id: string; reference: string; amount_minor: number }[];
      href: string;
    };
    expect(view).toMatchObject({
      open_minor: 0,
      payable_minor: 1_180_000,
      href: `/data/money/bills/${bill.bill_id}`,
      payments: [{ reference: "WALK-UTR-0130", amount_minor: 1_180_000 }],
    });
    const record = (await stack.ask("GET", `/data/money/bills/${bill.bill_id}`)).json?.bill as {
      payments: { from_line: string | null }[];
      edits: { changes: { after: string }[] }[];
    };
    expect(record.payments[0]?.from_line).toBe("statement");
    expect(record.edits[1]?.changes[0]?.after).toBe(
      "₹11,800 on 9 Nov 2026 · WALK-UTR-0130 · Bank transfer · from a statement line",
    );
    await post("/data/_test/money/month-lock", { locked: ["2026-11"] });
    const locked = await post("/data/_test/money/record-payment", {
      bill_id: bill.bill_id,
      paid_on: "2026-11-10",
      amount_minor: 100,
      reference: "x",
    });
    expect(codeOf(locked)).toBe("month_locked");
    const lockedBack = await post("/data/_test/money/take-back-payment", {
      bill_id: bill.bill_id,
      payment_id: view.payments[0]!.payment_id,
      why: "The match was wrong",
    });
    expect(codeOf(lockedBack)).toBe("month_locked");
    await post("/data/_test/money/month-lock", { on: false });
    const back = await post("/data/_test/money/take-back-payment", {
      bill_id: bill.bill_id,
      payment_id: view.payments[0]!.payment_id,
      why: "The match was wrong",
    });
    expect(back.json?.bill).toMatchObject({ open_minor: 1_180_000, payments: [] });
    const service = (
      await stack.ask("GET", "/data/_test/money/service?from=2026-11-07&to=2026-11-07&open=1")
    ).json;
    expect((service?.bills as { bill_id: string }[]).map((item) => item.bill_id)).toEqual([
      bill.bill_id,
    ]);
  });

  it("the month's pack takes each bill's copy, and counts those without one", async () => {
    const copy = Buffer.from(
      await inventedPdf(["Invented for a test: a bill."], "Walk bill"),
    ).toString("base64");
    const withCopy = (
      await addBill({
        invoice_number: "WALK-INV-0140",
        invoice_on: "2026-09-14",
        taxable: "100",
        content: copy,
        name: "walk.pdf",
      })
    ).json?.bill as { bill_id: string; file_id: string };
    await addBill({ invoice_number: "WALK-INV-0141", invoice_on: "2026-09-15", taxable: "100" });
    const pack = (await stack.ask("GET", "/data/_test/money/service?period=2026-09")).json?.pack;
    expect(pack).toMatchObject({
      bills: [
        {
          folder: "Purchase bills",
          name: "2026-09-14 Walk Legal LLP WALK-INV-0140.pdf",
          file_id: withCopy.file_id,
        },
      ],
      bills_count: 2,
      bills_without_copy: 1,
      challans: [],
      export_invoices: [],
      firas: [],
    });
  });
});

describe("the ledger map", () => {
  it("adds the starter categories once, and counts what is mapped in words", async () => {
    const first = (await post("/data/money/categories/starter")).json as {
      added: number;
      line: string;
    };
    expect(first).toMatchObject({ added: 24, line: "0 of 24 categories are mapped." });
    const again = (await post("/data/money/categories/starter")).json as {
      added: number;
      line: string;
    };
    expect(again).toMatchObject({ added: 0, line: "0 of 24 categories are mapped." });
    const ledger = (await stack.ask("GET", "/data/money/ledger")).json as {
      categories: { category_id: string; name: string; kind: string; people: boolean }[];
    };
    expect(
      ledger.categories
        .filter((item) => item.people)
        .map((item) => item.name)
        .sort(),
    ).toEqual(["Salaries", "Stipends"]);
    const fees = ledger.categories.find((item) => item.name === "Professional fees")!;
    const contractor = ledger.categories.find((item) => item.name === "Contractor fees")!;
    await post(`/data/money/categories/${fees.category_id}/update`, {
      ledger: "Legal and professional",
    });
    const mapped = (
      await post(`/data/money/categories/${contractor.category_id}/update`, {
        ledger: "legal and professional",
      })
    ).json as { line: string; checks: string[] };
    expect(mapped.line).toBe("2 of 24 categories are mapped.");
    expect(mapped.checks).toEqual([
      "Contractor fees and Professional fees point at the one ledger “legal and professional”. Confirm with your CA that they should.",
    ]);
    const checked = (
      await post("/data/money/ledger/checked", { by_name: "Walk CA", on: "2026-11-15" })
    ).json;
    expect(checked?.map_checked).toMatchObject({ by_name: "Walk CA", on: "2026-11-15" });
  });
});

describe("search and the calendar", () => {
  it("finds vendors and bills; the agenda's plain names no vendor", async () => {
    await post("/data/money/vendors", {
      name: "Walk Print Works",
      residency: "resident",
      udyam_class: "micro",
      msme_agreement: "no",
    }).then(async (answer) =>
      post("/data/money/bills", {
        vendor_id: (answer.json?.vendor as { vendor_id: string }).vendor_id,
        invoice_number: "WALK-PW-0001",
        invoice_on: "2026-11-03",
        taxable: "50000",
        gst: "9000",
        description: "Walk brochures",
        attempt: crypto.randomUUID(),
      }),
    );
    const groups = (await stack.ask("GET", "/data/_test/money/search?q=walk%20print")).json
      ?.groups as {
      kind: string;
      count: number;
      hits: { title: string; subtitle: string; href: string }[];
    }[];
    expect(groups.map((group) => group.kind)).toEqual(["vendor", "bill"]);
    expect(groups[0]?.hits[0]).toMatchObject({
      title: "Walk Print Works",
      subtitle: "In India · Micro",
    });
    expect(groups[1]?.hits[0]).toMatchObject({
      title: "WALK-PW-0001",
      subtitle: "Walk Print Works · 3 Nov 2026 · ₹59,000",
    });
    const byGstin = (await stack.ask("GET", "/data/_test/money/search?q=00ZZZPZ0000Z1Z0")).json
      ?.groups as {
      kind: string;
    }[];
    expect(byGstin.map((group) => group.kind)).toEqual(["vendor"]);
    const items = (await stack.ask("GET", "/data/_test/money/agenda")).json?.items as {
      kind: string;
      title: string;
      plain: string;
    }[];
    const bill = items.find((item) => item.title === "Pay Walk Print Works: WALK-PW-0001");
    expect(bill).toMatchObject({ kind: "bill", plain: "Bill to pay" });
    for (const item of items) expect(item.plain).not.toMatch(/Walk/);
    const overview = (await stack.ask("GET", "/data/overview")).json as {
      money?: { open: Record<string, number>; overdue: number };
    };
    expect(overview.money?.open.INR).toBeGreaterThan(0);
    expect(overview.money?.overdue).toBeGreaterThanOrEqual(1);
  });
});

describe("the CSVs for the CA", () => {
  it("the purchase register: one row a bill, with the PAN, the rule sources and the payments", async () => {
    const started = await post("/data/builds", { kind: "money_bills_csv", fy: "2026-27" });
    const id = String((started.json?.build as { build_id: string }).build_id);
    let state = "building";
    for (let tries = 0; tries < 100 && state === "building"; tries += 1) {
      state = String(
        ((await stack.ask("GET", `/data/builds/${id}`)).json?.build as { state: string }).state,
      );
      if (state === "building") await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(state).toBe("ready");
    const bytes = await stack.ask("GET", `/data/builds/${id}/bytes`);
    const text = bytes.bytes.toString("utf8");
    expect(text.startsWith("﻿vendor,pan,gstin,invoice_number,invoice_on,")).toBe(true);
    const row = text.split("\r\n").find((line) => line.includes("WALK-INV-0110"));
    expect(row).toContain(
      "Walk Legal LLP,ZZZPZ0000Z,00ZZZPZ0000Z1Z0,WALK-INV-0110,2026-10-12,INR,10000,1800,11800",
    );
    expect(row).toContain("WALK-UTR-0110");
    expect(row).toContain("https://taxguru.in/");
    for (const kind of ["money_vendors_csv", "money_ledger_csv", "money_exports_csv"]) {
      const made = await post("/data/builds", { kind });
      expect(made.status, kind).toBe(200);
    }
  });
});
