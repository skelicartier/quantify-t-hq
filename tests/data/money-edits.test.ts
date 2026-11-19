// @vitest-environment node
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { editLineText, type EditLine } from "../../scripts/data/duties-contracts";
import { EditLog, GENESIS } from "../../scripts/data/money/edits";
import { DataStore } from "../../scripts/data/store";
import { WALKER, startStack, type Stack } from "./helpers";

/**
 * Money's edit log (ws-notes/duties/spec.md §5.4): three lines, each hash checked by working
 * it out again; one character of line 2 changed in the file breaks the chain at 2; every
 * route that changes a record adds exactly one line, with the values as the pages print them.
 */

describe("the chain, by hand", () => {
  it("three lines, then a changed character", () => {
    const dir = mkdtempSync(join(tmpdir(), "hqm-"));
    try {
      const store = new DataStore(dir);
      store.ensureDir("money");
      let tick = 0;
      const log = new EditLog(store, () => `2026-11-19T00:00:0${(tick += 1)}.000Z`);
      log.append({
        record: "bill",
        id: "b1",
        verb: "added",
        changes: [{ field: "Total", before: "", after: "₹11,800" }],
        by: WALKER,
      });
      log.append({
        record: "bill",
        id: "b1",
        verb: "paid",
        changes: [{ field: "Payment", before: "", after: "₹10,800 on 19 Nov 2026" }],
        by: WALKER,
      });
      log.append({
        record: "vendor",
        id: "v1",
        verb: "changed",
        changes: [{ field: "PAN", before: "", after: "ZZZPZ0000Z" }],
        by: WALKER,
      });
      const lines = readFileSync(join(dir, "money/edits.jsonl"), "utf8")
        .trim()
        .split("\n")
        .map((row) => JSON.parse(row) as EditLine);
      let previous = GENESIS;
      for (const [index, line] of lines.entries()) {
        const { hash, ...body } = line;
        expect(body.n).toBe(index + 1);
        expect(hash).toBe(createHash("sha256").update(editLineText(previous, body)).digest("hex"));
        previous = hash;
      }
      expect(new EditLog(store, () => "").verify()).toEqual({
        ok: true,
        lines: 3,
        broken_at: null,
      });

      const file = join(dir, "money/edits.jsonl");
      const rows = readFileSync(file, "utf8").split("\n");
      rows[1] = rows[1]!.replace("₹10,800", "₹10,900");
      writeFileSync(file, rows.join("\n"));
      expect(new EditLog(store, () => "").verify()).toEqual({ ok: false, lines: 3, broken_at: 2 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

let stack: Stack;
const post = (path: string, body: Record<string, unknown> = {}) =>
  stack.ask("POST", path, { by: WALKER, ...body });
const count = async () => Number((await stack.ask("GET", "/data/money/edits")).json?.total ?? -1);

beforeAll(async () => {
  stack = await startStack({ modules: ["files", "contacts", "money"] });
}, 60_000);
afterAll(() => stack.stop());

describe("every change, one line", () => {
  it("adds exactly one line per change, with printed values, and the chain checks out", async () => {
    const one = async (path: string, body: Record<string, unknown> = {}) => {
      const before = await count();
      const answer = await post(path, body);
      expect(answer.status, `${path} ${JSON.stringify(answer.json)}`).toBe(200);
      expect(await count(), path).toBe(before + 1);
      return answer.json ?? {};
    };
    const category = (
      await one("/data/money/categories", { name: "Walk legal fees", kind: "expense" })
    ).category as { category_id: string };
    await one(`/data/money/categories/${category.category_id}/update`, {
      ledger: "Legal and professional",
    });
    const vendor = (
      await one("/data/money/vendors", {
        name: "Walk Legal LLP",
        residency: "resident",
        tds_kind: "professional",
      })
    ).vendor as { vendor_id: string };
    await one(`/data/money/vendors/${vendor.vendor_id}/update`, { pan: "ZZZPZ0000Z" });
    const bill = (
      await one("/data/money/bills", {
        vendor_id: vendor.vendor_id,
        invoice_number: "WALK-INV-0007",
        invoice_on: "2026-11-12",
        taxable: "10000",
        gst: "1800",
        category_id: category.category_id,
        attempt: crypto.randomUUID(),
      })
    ).bill as { bill_id: string };
    const path = `/data/money/bills/${bill.bill_id}`;
    await one(`${path}/update`, { description: "Walk advice" });
    await one(`${path}/approve`);
    await one(`${path}/tds`, { deducted: "1000", deducted_on: "2026-11-12" });
    await one(`${path}/challan`, {
      number: "WALK-CH-0001",
      bsr: "0000000",
      deposited_on: "2026-11-14",
    });
    const paid = (
      await one(`${path}/payments`, {
        paid_on: "2026-11-14",
        amount: "10800",
        reference: "WALK-UTR-0001",
      })
    ).bill as { payments: { payment_id: string }[]; edits: EditLine[] };
    const paymentId = paid.payments[0]!.payment_id;
    await one(`${path}/payments/${paymentId}/take-back`, { why: "Paid by mistake" });
    await one(`${path}/cancel`, { why: "Issued twice by the vendor" });
    // Saving with nothing changed writes nothing.
    const before = await count();
    await post(`/data/money/vendors/${vendor.vendor_id}/update`, { pan: "ZZZPZ0000Z" });
    expect(await count()).toBe(before);
    await one(`/data/money/vendors/${vendor.vendor_id}/retire`);
    await one(`/data/money/categories/${category.category_id}/retire`);
    await one("/data/money/ledger/checked", { by_name: "Walk CA", on: "2026-11-15" });

    const lines = (await stack.ask("GET", `${path}`)).json?.bill as { edits: EditLine[] };
    expect(lines.edits.map((line) => line.verb)).toEqual([
      "added",
      "changed",
      "approved",
      "tax deducted",
      "challan recorded",
      "paid",
      "payment taken back",
      "cancelled",
    ]);
    expect(lines.edits[0]?.changes).toEqual(
      expect.arrayContaining([
        { field: "Invoice day", before: "", after: "12 Nov 2026" },
        { field: "Total", before: "", after: "₹11,800" },
        { field: "Category", before: "", after: "Walk legal fees" },
      ]),
    );
    expect(lines.edits[3]?.changes).toEqual(
      expect.arrayContaining([
        { field: "Tax deducted", before: "", after: "₹1,000" },
        { field: "Deducted on", before: "", after: "12 Nov 2026" },
      ]),
    );
    expect(lines.edits[5]?.changes[0]?.after).toBe(
      "₹10,800 on 14 Nov 2026 · WALK-UTR-0001 · Bank transfer",
    );
    expect((await stack.ask("GET", "/data/money/edits/verify")).json).toMatchObject({
      intact: true,
      broken_at: null,
      ahead: [],
    });
    const forVendor = (
      await stack.ask("GET", `/data/money/edits?record=vendor&id=${vendor.vendor_id}`)
    ).json?.edits as EditLine[];
    expect(forVendor.map((line) => line.verb)).toEqual(["added", "changed", "retired"]);

    // Export invoices, receipts and the LUT: one line each too.
    const invoice = (
      await one("/data/money/exports", {
        customer: "Walk Customer Inc",
        invoice_number: "WALK-EXP-0001",
        invoice_on: "2026-10-20",
        currency: "USD",
        amount: "5000",
        attempt: crypto.randomUUID(),
      })
    ).invoice as { invoice_id: string };
    const ex = `/data/money/exports/${invoice.invoice_id}`;
    await one(`${ex}/update`, { purpose_code: "P0802" });
    await one(`${ex}/edf`, { filed_on: "2026-11-10", reference: "WALK-EDF-1" });
    const got = (await one(`${ex}/receipts`, { received_on: "2026-11-12", amount: "3000" }))
      .invoice as {
      receipts: { receipt_id: string }[];
    };
    const receiptId = got.receipts[0]!.receipt_id;
    await one(`${ex}/receipts/${receiptId}/update`, { fira_number: "WALK-FIRA-1", inr: "264750" });
    await one(`${ex}/receipts/${receiptId}/take-back`, { why: "Bounced back" });
    await one(`${ex}/cancel`, { why: "Raised in error" });
    await one("/data/money/luts", { fy: "2026-27", arn: "WALK-ARN-1", filed_on: "2026-04-02" });
    expect((await stack.ask("GET", "/data/money/edits/verify")).json?.intact).toBe(true);
  });
});
