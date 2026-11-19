// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { standInDutyRules } from "../../scripts/data/duties-contracts";
import { msmePayBy, paidLateWords } from "../../scripts/data/money/msme";
import type { RuleAsk } from "../../scripts/data/money/tds";
import { WALKER, startStack, type Stack } from "./helpers";

/**
 * The MSME pay-by day (ws-notes/duties/spec.md §5.4): §5.4's rows by hand; a class change on
 * the vendor moves its open bills' day on the next read; the paid-late words; the Due row and
 * the bill's "Pay by" short words. Every vendor is invented ("Walk Print Works",
 * `UDYAM-ZZ-00-0000000`).
 */

const service = standInDutyRules(() => "2026-11-19");
const rules: RuleAsk = (key) => service.state(key);
const none: RuleAsk = () => null;

describe("§5.4's rows, by hand", () => {
  const base = "2026-11-03";
  it("no written agreement: 15 days", () => {
    expect(
      msmePayBy({ udyam: "micro", agreement: { has: "no", days: null }, base, rules }),
    ).toMatchObject({
      applies: true,
      pay_by: "2026-11-18",
      words: "Micro supplier, no written agreement: pay by 18 Nov 2026.",
      note: "",
      short: "(15-day limit)",
      rule: { key: "msme-no-agreement", confirm_with: "CA" },
    });
  });
  it("an agreement of 30 days", () => {
    expect(
      msmePayBy({ udyam: "small", agreement: { has: "yes", days: 30 }, base, rules }),
    ).toMatchObject({
      pay_by: "2026-12-03",
      words: "Small supplier, written agreement: pay by 3 Dec 2026.",
      short: "(agreed 30 days)",
      rule: { key: "msme-agreement" },
    });
  });
  it("an agreement of 60 days is held to 45", () => {
    expect(
      msmePayBy({ udyam: "micro", agreement: { has: "yes", days: 60 }, base, rules }),
    ).toMatchObject({
      pay_by: "2026-12-18",
      note: "Agreed 60 days; the limit is 45.",
      short: "(45-day limit)",
    });
  });
  it("a medium enterprise: none", () => {
    expect(
      msmePayBy({ udyam: "medium", agreement: { has: "yes", days: 30 }, base, rules }),
    ).toMatchObject({
      applies: false,
      pay_by: null,
      words: "The limit covers micro and small suppliers only.",
    });
    expect(
      msmePayBy({ udyam: "not_registered", agreement: { has: "", days: null }, base, rules }),
    ).toBeNull();
    expect(msmePayBy({ udyam: "", agreement: { has: "", days: null }, base, rules })).toBeNull();
  });
  it("no rule book: nothing worked out", () => {
    expect(
      msmePayBy({ udyam: "micro", agreement: { has: "no", days: null }, base, rules: none }),
    ).toMatchObject({
      applies: true,
      pay_by: null,
      rule: null,
    });
  });
  it("paid late", () => {
    expect(paidLateWords("2026-11-18", "2026-11-25")).toBe(
      "Paid 7 days after the limit. Confirm with your CA how this year's deduction is affected.",
    );
    expect(paidLateWords("2026-11-18", "2026-11-19")).toBe(
      "Paid 1 day after the limit. Confirm with your CA how this year's deduction is affected.",
    );
    expect(paidLateWords("2026-11-18", "2026-11-18")).toBe("");
  });
});

let stack: Stack;
const post = (path: string, body: Record<string, unknown> = {}) =>
  stack.ask("POST", path, { by: WALKER, ...body });

beforeAll(async () => {
  stack = await startStack({ modules: ["files", "contacts", "money"] });
  await post("/data/_test/money/duty-rules", {});
}, 60_000);
afterAll(() => stack.stop());

type Bill = {
  bill_id: string;
  pay_by: string | null;
  pay_by_short: string;
  state: string;
  paid_late_words: string;
  msme: { words: string; note: string } | null;
};

describe("through the service", () => {
  it("a class change moves the open bill's day; Due carries it; paid late says so", async () => {
    const vendor = (
      await post("/data/money/vendors", {
        name: "Walk Print Works",
        residency: "resident",
        udyam_class: "micro",
        udyam_number: "UDYAM-ZZ-00-0000000",
        msme_agreement: "no",
        tds_kind: "none",
      })
    ).json?.vendor as { vendor_id: string };
    const added = await post("/data/money/bills", {
      vendor_id: vendor.vendor_id,
      invoice_number: "WALK-PW-0001",
      invoice_on: "2026-11-01",
      accepted_on: "2026-11-03",
      taxable: "50000",
      gst: "9000",
      attempt: crypto.randomUUID(),
    });
    const bill = added.json?.bill as Bill;
    expect(bill).toMatchObject({
      pay_by: "2026-11-18",
      pay_by_short: "(15-day limit)",
      msme: { words: "Micro supplier, no written agreement: pay by 18 Nov 2026." },
    });
    const due = (await stack.ask("GET", "/data/overview")).json?.due as {
      key: string;
      kind: string;
      title: string;
      sub: string;
      due_on: string;
    }[];
    expect(due.find((row) => row.key === `bill:${bill.bill_id}:pay`)).toEqual(
      expect.objectContaining({
        kind: "bill",
        title: "Pay Walk Print Works: WALK-PW-0001",
        sub: "₹59,000 · micro supplier, 15-day limit",
        due_on: "2026-11-18",
      }),
    );

    // An agreement of 30 days moves it to 3 Dec on the next read, with nothing stored.
    await post(`/data/money/vendors/${vendor.vendor_id}/update`, {
      msme_agreement: "yes",
      msme_days: "30",
    });
    const read = async () =>
      (await stack.ask("GET", `/data/money/bills/${bill.bill_id}`)).json?.bill as Bill;
    expect(await read()).toMatchObject({ pay_by: "2026-12-03", pay_by_short: "(agreed 30 days)" });
    await post(`/data/money/vendors/${vendor.vendor_id}/update`, { udyam_class: "medium" });
    expect(await read()).toMatchObject({
      pay_by: null,
      msme: { words: "The limit covers micro and small suppliers only." },
    });
    await post(`/data/money/vendors/${vendor.vendor_id}/update`, {
      udyam_class: "micro",
      msme_agreement: "no",
      msme_days: "",
    });
    expect((await read()).pay_by).toBe("2026-11-18");

    // Paid in full the day after the limit (today or earlier is all the service allows).
    const paid = await post(`/data/money/bills/${bill.bill_id}/payments`, {
      paid_on: "2026-11-19",
      amount: "59,000",
      reference: "WALK-UTR-0002",
    });
    expect(paid.json?.bill).toMatchObject({
      state: "paid_late",
      paid_late_words:
        "Paid 1 day after the limit. Confirm with your CA how this year's deduction is affected.",
    });
    const after = (await stack.ask("GET", "/data/overview")).json?.due as { key: string }[];
    expect(after.some((row) => row.key === `bill:${bill.bill_id}:pay`)).toBe(false);
  });

  it("a pay-by day he typed, when no limit applies", async () => {
    const vendor = (
      await post("/data/money/vendors", { name: "Walk Paper Co", residency: "resident" })
    ).json?.vendor as { vendor_id: string };
    const bill = (
      await post("/data/money/bills", {
        vendor_id: vendor.vendor_id,
        invoice_number: "WALK-PC-1",
        invoice_on: "2026-11-10",
        taxable: "1000",
        pay_by: "2026-11-30",
        attempt: crypto.randomUUID(),
      })
    ).json?.bill as Bill;
    expect(bill).toMatchObject({ pay_by: "2026-11-30", pay_by_short: "(your date)", msme: null });
  });
});
