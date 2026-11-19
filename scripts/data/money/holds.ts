/**
 * The file hold (ws-notes/duties/spec.md §5.4): a file attached to a bill, a challan, an
 * export invoice or a FIRA is kept until the end of the financial year that is `years`
 * (rule `voucher-retention`, 8) after the record's own day. A cancelled bill's copy is still
 * held; a file on more than one record keeps the latest day. Files asks `heldUntil` before
 * deleting a file forever, so the index lives in memory, is rebuilt on every save, and keeps
 * each file's latest day: the last day to keep it is worked out when asked, with the rule's
 * amount at that moment. Pure.
 */

import { retentionUntil, type FileHold } from "../duties-contracts";
import { dayWords } from "../../../src/lib/data/labels-company";
import type { Bill, ExportInvoice } from "./types";

export type Held = { day: string; why: string };

export function holdIndex(input: {
  bills: readonly Bill[];
  exports: readonly ExportInvoice[];
  vendorName: (vendorId: string) => string;
}): Map<string, Held> {
  const index = new Map<string, Held>();
  const hold = (fileId: string | null, day: string, why: string) => {
    if (!fileId) return;
    const held = index.get(fileId);
    if (!held || day > held.day) index.set(fileId, { day, why });
  };
  for (const bill of input.bills) {
    const vendor = input.vendorName(bill.vendor_id);
    hold(bill.file_id, bill.invoice_on, `A bill from ${vendor}, ${dayWords(bill.invoice_on)}`);
    const challan = bill.tds.challan;
    if (challan)
      hold(
        challan.file_id,
        challan.deposited_on,
        `A TDS challan for a bill from ${vendor}, ${dayWords(challan.deposited_on)}`,
      );
  }
  for (const invoice of input.exports) {
    hold(
      invoice.file_id,
      invoice.invoice_on,
      `An export invoice to ${invoice.customer}, ${dayWords(invoice.invoice_on)}`,
    );
    for (const receipt of invoice.receipts)
      hold(
        receipt.fira_file_id,
        receipt.received_on,
        `A FIRA for money from ${invoice.customer}, ${dayWords(receipt.received_on)}`,
      );
  }
  return index;
}

/** The hold on one file, from the index: the last day to keep it and why; null for none. */
export function holdOf(
  index: ReadonlyMap<string, Held>,
  fileId: string,
  years: number,
): FileHold | null {
  const held = index.get(fileId);
  return held ? { until: retentionUntil(held.day, years), why: held.why } : null;
}
