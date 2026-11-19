// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { inventedPdf } from "../../scripts/data/files/walk-seed";
import { holdIndex, holdOf } from "../../scripts/data/money/holds";
import type { Bill, ExportInvoice } from "../../scripts/data/money/types";
import { WALKER, codeOf, startStack, type RawAnswer, type Stack } from "./helpers";

/**
 * The file hold (ws-notes/duties/spec.md §5.4, §15 item 3): a bill's copy, a challan's, a
 * cancelled bill's, a file on two records (the later day wins) and a file on none; then
 * through Files with `modules: ["files", "money"]`: deleting a held bill's PDF forever is
 * refused with its sentence, emptying the trash keeps it and deletes the rest. Every file is
 * invented in the test.
 */

const stamp = {
  created_at: "2026-11-19T00:00:00.000Z",
  created_by: WALKER,
  updated_at: "2026-11-19T00:00:00.000Z",
  updated_by: WALKER,
};
const bill = (id: string, invoiceOn: string, change: Partial<Bill> = {}): Bill => ({
  bill_id: id,
  vendor_id: "v1",
  invoice_number: id,
  invoice_on: invoiceOn,
  accepted_on: null,
  description: "",
  currency: "INR",
  taxable_minor: 100,
  gst_minor: 0,
  total_minor: 100,
  gst_treatment: "",
  category_id: null,
  tds: { kind: "", deducted_minor: null, deducted_on: null, challan: null },
  pay_by_typed: null,
  approved: null,
  payments: [],
  file_id: null,
  cancelled: null,
  ...stamp,
  ...change,
});

describe("heldUntil, by hand", () => {
  const exportOn = (id: string, day: string, fileId: string): ExportInvoice => ({
    invoice_id: id,
    customer: "Walk Customer Inc",
    country: "",
    waitlist_entry_id: null,
    invoice_number: id,
    invoice_on: day,
    currency: "USD",
    amount_minor: 100,
    tax_treatment: "",
    purpose_code: "",
    rail: "",
    edf: null,
    receipts: [],
    file_id: fileId,
    cancelled: null,
    notes: "",
    ...stamp,
  });
  const index = holdIndex({
    bills: [
      bill("b1", "2026-11-12", { file_id: "f-bill" }),
      bill("b2", "2026-11-12", {
        tds: {
          kind: "professional",
          deducted_minor: 100,
          deducted_on: "2026-11-12",
          challan: {
            number: "WALK-CH-1",
            bsr: "",
            deposited_on: "2027-04-05",
            file_id: "f-challan",
          },
        },
      }),
      bill("b3", "2027-03-31", {
        file_id: "f-cancelled",
        cancelled: { on: "2027-04-01", why: "Issued twice", at: "x", by: WALKER },
      }),
      bill("b4", "2026-05-01", { file_id: "f-two" }),
    ],
    exports: [exportOn("e1", "2027-04-01", "f-two")],
    vendorName: () => "Walk Legal LLP",
  });
  it("is the end of the eighth financial year after the record's own", () => {
    expect(holdOf(index, "f-bill", 8)).toEqual({
      until: "2035-03-31",
      why: "A bill from Walk Legal LLP, 12 Nov 2026",
    });
    expect(holdOf(index, "f-challan", 8)?.until).toBe("2036-03-31");
    expect(holdOf(index, "f-cancelled", 8)?.until).toBe("2035-03-31");
    expect(holdOf(index, "f-two", 8)).toEqual({
      until: "2036-03-31",
      why: "An export invoice to Walk Customer Inc, 1 Apr 2027",
    });
    expect(holdOf(index, "f-none", 8)).toBeNull();
    expect(holdOf(index, "f-bill", 10)?.until).toBe("2037-03-31");
  });
});

let stack: Stack;
const post = (path: string, body: Record<string, unknown> = {}) =>
  stack.ask("POST", path, { by: WALKER, ...body });
const message = (answer: RawAnswer) =>
  String((answer.json?.error as { message?: unknown } | undefined)?.message ?? "");
const pdf = async (words: string) =>
  Buffer.from(await inventedPdf([`Invented for a test: ${words}.`], "Walk bill")).toString(
    "base64",
  );

beforeAll(async () => {
  stack = await startStack({ modules: ["files", "money"] });
}, 60_000);
afterAll(() => stack.stop());

describe("through Files", () => {
  it("refuses to delete a held bill's copy forever, and keeps it when the trash is emptied", async () => {
    const vendor = (await post("/data/money/vendors", { name: "Walk Legal LLP" })).json?.vendor as {
      vendor_id: string;
    };
    const added = await post("/data/money/bills", {
      vendor_id: vendor.vendor_id,
      invoice_number: "WALK-INV-0007",
      invoice_on: "2026-11-12",
      taxable: "10000",
      gst: "1800",
      content: await pdf("a bill"),
      name: "walk-inv-0007.pdf",
      attempt: crypto.randomUUID(),
    });
    expect(added.status).toBe(200);
    const bill = added.json?.bill as {
      bill_id: string;
      file_id: string;
      held_until: string;
      file: { title: string };
    };
    expect(bill.held_until).toBe("2035-03-31");
    // The bill and its copy are one change: one edit line, naming the copy.
    const edits = (added.json?.bill as { edits: { verb: string; changes: { field: string }[] }[] })
      .edits;
    expect(edits.map((line) => line.verb)).toEqual(["added"]);
    expect(edits[0]?.changes.some((change) => change.field === "The invoice")).toBe(true);
    expect(bill.file.title).toBe("Walk Legal LLP WALK-INV-0007");
    const fileId = bill.file_id;
    const service = (await stack.ask("GET", `/data/_test/money/service?file_id=${fileId}`)).json;
    expect(service?.held).toEqual({
      until: "2035-03-31",
      why: "A bill from Walk Legal LLP, 12 Nov 2026",
    });
    expect(service?.used_for).toEqual([
      {
        label: "The bill Walk Legal LLP WALK-INV-0007, in Money",
        href: `/data/money/bills/${bill.bill_id}`,
      },
    ]);
    const file = (await stack.ask("GET", `/data/files/${fileId}`)).json?.file as {
      folder_path: string;
      used_for: { label: string }[];
    };
    expect(file.folder_path).toBe("Money › Bills › 2026-27");

    // A file no record holds, beside it.
    const loose = (
      await post("/data/_test/files/put", {
        title: "Walk loose note",
        name: "walk-loose.txt",
        base64: Buffer.from("Invented").toString("base64"),
      })
    ).json?.file as { file_id: string };
    expect((await post(`/data/files/${loose.file_id}/trash`)).status).toBe(200);

    expect((await post(`/data/files/${fileId}/trash`)).status).toBe(200);
    const refused = await post(`/data/files/${fileId}/delete-forever`);
    expect(refused.status).toBe(409);
    expect(codeOf(refused)).toBe("held");
    expect(message(refused)).toBe(
      "A bill from Walk Legal LLP, 12 Nov 2026 is kept until 31 Mar 2035, so it cannot be deleted. It can stay in the trash.",
    );

    // Cancelling the bill keeps the hold.
    await post(`/data/money/bills/${bill.bill_id}/cancel`, { why: "Issued twice by the vendor" });
    expect(codeOf(await post(`/data/files/${fileId}/delete-forever`))).toBe("held");

    // Emptying the trash (two files in it) deletes the loose one and keeps the held one (§15).
    const emptied = await post("/data/trash/empty", { confirm: "2" });
    expect(emptied.status).toBe(200);
    expect(emptied.json).toMatchObject({ deleted: 1, kept: 1 });
    expect((await stack.ask("GET", `/data/files/${fileId}`)).status).toBe(200);
    expect((await stack.ask("GET", `/data/files/${loose.file_id}`)).status).toBe(404);
  });
});
