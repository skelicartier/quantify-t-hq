// @vitest-environment node
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { inventedPdf } from "../../scripts/data/files/walk-seed";
import {
  addBill,
  addCategory,
  addExport,
  addLut,
  addStarterCategories,
  addVendor,
  approveBill,
  attachBillCopy,
  attachExportCopy,
  cancelBill,
  cancelExport,
  readBill,
  readBills,
  readEdits,
  readExport,
  readExports,
  readLedger,
  readVendor,
  readVendors,
  recordBillPayment,
  recordChallan,
  recordDeduction,
  recordEdf,
  recordForeign,
  recordMapChecked,
  recordReceipt,
  retireCategory,
  retireVendor,
  takeBackBillPayment,
  takeBackReceipt,
  updateBill,
  updateCategory,
  updateExport,
  updateReceipt,
  updateVendor,
  verifyEdits,
  type BillInput,
} from "@/lib/data/api/money";
import { readDataOverview } from "@/lib/data/api/overview";
import { DataRequestError } from "@/lib/data/socket";
import { WALKER, startStack, type Stack } from "./helpers";

/**
 * The portal's Money client against the real stack (ws-notes/duties/spec.md §8.7): every
 * function's answer passes its schema, the overview parses with "bill" and "export" rows in
 * Due, and a refusal reaches the portal as the service's own sentence. Every vendor and
 * customer is invented.
 */

let stack: Stack;

beforeAll(async () => {
  stack = await startStack({ env: true, modules: ["files", "contacts", "money"] });
  await stack.ask("POST", "/data/_test/money/duty-rules", { by: WALKER });
}, 60_000);
afterAll(() => stack.stop());

const bill = (vendorId: string, change: Partial<BillInput> = {}): BillInput => ({
  vendor_id: vendorId,
  invoice_number: "WALK-INV-0007",
  invoice_on: "2026-11-12",
  accepted_on: "",
  description: "Walk advice",
  currency: "INR",
  taxable: "10,000",
  gst: "1,800",
  total: "",
  gst_treatment: "charged_on_the_bill",
  category_id: "",
  tds_kind: "",
  pay_by: "",
  ...change,
});

describe("the portal and Money agree", () => {
  it("on every ledger and vendor call", async () => {
    const starter = await addStarterCategories(WALKER);
    expect(starter.line).toBe("0 of 24 categories are mapped.");
    const added = await addCategory(
      {
        name: "Walk research",
        kind: "expense",
        ledger: "",
        schedule_line: "",
        people: false,
        note: "",
      },
      WALKER,
      randomUUID(),
    );
    const id = added.category!.category_id;
    await updateCategory(id, { ledger: "Research" }, WALKER);
    await recordMapChecked({ by_name: "Walk CA", on: "2026-11-15", note: "" }, WALKER);
    await retireCategory(id, WALKER);
    const ledger = await readLedger();
    expect(ledger.map_checked?.by_name).toBe("Walk CA");

    const made = await addVendor(
      {
        name: "Walk Legal LLP",
        residency: "resident",
        pan: "ZZZPZ0000Z",
        tds_kind: "professional",
      },
      WALKER,
      randomUUID(),
    );
    await updateVendor(
      made.vendor.vendor_id,
      { udyam_class: "micro", msme_agreement: "no" },
      WALKER,
    );
    const abroad = await addVendor(
      { name: "Walk Cloud Inc", residency: "non_resident" },
      WALKER,
      randomUUID(),
    );
    const pdf = Buffer.from(await inventedPdf(["Invented: the CA's note."], "Walk note")).toString(
      "base64",
    );
    const decided = await recordForeign(
      abroad.vendor.vendor_id,
      {
        bills_from: "abroad",
        paid_by: "card",
        gst: "not_registered_for_gst",
        card_forex_rate: "2.5",
        decision_tds: "do_not_deduct",
        decision_basis: "Walk basis",
        decision_forms: "none",
        decided_by: "Walk CA",
        decided_role: "CA",
        decided_on: "2026-11-14",
        content: pdf,
        name: "walk-note.pdf",
      },
      WALKER,
    );
    expect(decided.decision_file?.title).toBe("Walk Cloud Inc – the CA's decision");
    expect(decided.forms.rule?.readings).toEqual(["Forms 145 and 146", "Forms 15CA and 15CB"]);
    await retireVendor(abroad.vendor.vendor_id, WALKER);
    const vendors = await readVendors();
    expect(vendors.vendors.map((row) => row.name)).toEqual(["Walk Legal LLP", "Walk Cloud Inc"]);
    expect((await readVendor(made.vendor.vendor_id)).vendor.udyam.class).toBe("micro");
  });

  it("on every bill call", async () => {
    const vendorId = (await readVendors()).vendors[0]!.vendor_id;
    const { bill: added } = await addBill(bill(vendorId), WALKER, randomUUID());
    const id = added.bill_id;
    expect(added).toMatchObject({ total_minor: 1_180_000, pay_by: "2026-11-27" });
    await updateBill(id, { description: "Walk advice, November" }, WALKER);
    await approveBill(id, WALKER);
    const deducted = await recordDeduction(
      id,
      { deducted: "1000", deducted_on: "2026-11-12", kind: "" },
      WALKER,
    );
    expect(deducted.bill.deposit?.by).toBe("2026-12-07");
    await recordChallan(
      id,
      { number: "WALK-CH-0001", bsr: "0000000", deposited_on: "2026-11-14" },
      WALKER,
    );
    const pdf = Buffer.from(await inventedPdf(["Invented: a bill."], "Walk bill")).toString(
      "base64",
    );
    await attachBillCopy(id, { content: pdf, name: "walk-inv-0007.pdf" }, WALKER);
    const paid = await recordBillPayment(
      id,
      {
        paid_on: "2026-11-14",
        amount: "10,800",
        reference: "WALK-UTR-0001",
        method: "bank",
        inr: "",
        forex: "",
      },
      WALKER,
      randomUUID(),
    );
    expect(paid.bill.state).toBe("paid");
    const page = await readBill(id);
    expect(page.bill.held_until).toBe("2035-03-31");
    expect(page.bill.edits.length).toBe(7);
    await takeBackBillPayment(id, page.bill.payments[0]!.payment_id, "Paid by mistake", WALKER);
    await cancelBill(id, "Issued twice by the vendor", WALKER);
    const list = await readBills({ view: "cancelled" });
    expect(list.bills.map((row) => row.bill_id)).toEqual([id]);
    expect(list.counts.cancelled).toBe(1);

    const open = await addBill(
      bill(vendorId, { invoice_number: "WALK-INV-0008", invoice_on: "2026-11-03" }),
      WALKER,
      randomUUID(),
    );
    const overview = await readDataOverview();
    expect(overview.due.find((row) => row.key === `bill:${open.bill.bill_id}:pay`)).toMatchObject({
      kind: "bill",
      due_on: "2026-11-18",
    });
    const edits = await readEdits({ record: "bill", id });
    expect(edits.total).toBe(9);
    expect((await verifyEdits()).intact).toBe(true);
  });

  it("on every export call", async () => {
    const { invoice } = await addExport(
      {
        customer: "Walk Customer Inc",
        country: "United States",
        invoice_number: "WALK-EXP-0001",
        invoice_on: "2026-10-20",
        currency: "USD",
        amount: "5,000",
        tax_treatment: "under_lut",
        purpose_code: "P0802",
        rail: "Bank transfer",
        notes: "",
      },
      WALKER,
      randomUUID(),
    );
    const id = invoice.invoice_id;
    expect(invoice).toMatchObject({
      edf_by: "2026-11-30",
      realise_by: null,
      readings: ["9 months", "15 months"],
    });
    await updateExport(id, { rail: "Bank transfer to the current account" }, WALKER);
    await recordEdf(id, { filed_on: "2026-11-10", reference: "WALK-EDF-0001" }, WALKER);
    const received = await recordReceipt(
      id,
      {
        received_on: "2026-11-12",
        amount: "5000",
        inr: "4,41,250",
        fira_number: "",
        ebrc_number: "",
      },
      WALKER,
      randomUUID(),
    );
    const receipt = received.invoice.receipts[0]!;
    expect(receipt.rate_words).toBe("₹88.25 a dollar");
    const overview = await readDataOverview();
    expect(
      overview.due.find((row) => row.key === `export:${id}:fira:${receipt.receipt_id}`),
    ).toMatchObject({
      kind: "export",
      due_on: "2026-11-26",
    });
    await updateReceipt(id, receipt.receipt_id, { fira_number: "WALK-FIRA-0001" }, WALKER);
    await addLut(
      { fy: "2026-27", arn: "WALK-ARN-0001", filed_on: "2026-04-02" },
      WALKER,
      randomUUID(),
    );
    const pdf = Buffer.from(await inventedPdf(["Invented: an invoice."], "Walk invoice")).toString(
      "base64",
    );
    await attachExportCopy(id, { content: pdf, name: "walk-exp-0001.pdf" }, WALKER);
    const page = await readExport(id);
    expect(page.invoice.checks).toEqual([]);
    expect(page.invoice.realised.in_full_on).toBe("2026-11-12");
    expect(page.lut?.arn).toBe("WALK-ARN-0001");
    await takeBackReceipt(id, receipt.receipt_id, "Bounced back", WALKER);
    await cancelExport(id, "Raised in error", WALKER);
    const list = await readExports();
    expect(list.invoices[0]).toMatchObject({ invoice_id: id, cancelled: true });
    expect(list.luts[0]?.fy).toBe("2026-27");
  });

  it("refusals arrive as sentences", async () => {
    const vendorId = (await readVendors()).vendors[0]!.vendor_id;
    const refused = await addBill(bill(vendorId, { taxable: "ten" }), WALKER, randomUUID()).catch(
      (error: unknown) => error,
    );
    expect(refused).toBeInstanceOf(DataRequestError);
    expect((refused as DataRequestError).message).toBe(
      "Type the amount as a number, such as 1180.50.",
    );
  });
});
