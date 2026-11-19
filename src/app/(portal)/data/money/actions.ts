"use server";

import {
  attemptOf,
  copyFrom,
  idOf,
  isState,
  typedDay,
  NOT_A_DAY,
} from "@/components/data/meetings/form-values";
import {
  amountTyped,
  billInputOf,
  exportInputOf,
  vendorInputOf,
} from "@/components/data/money/form-values";
import { fieldValue } from "@/lib/auth/forms";
import * as api from "@/lib/data/api/money";
import { gate, refreshData, refusal, refused, sent, staffOf } from "@/lib/data/gate";
import { dayWords } from "@/lib/data/labels-company";
import { minorWordsBy } from "@/lib/data/labels-duties";
import type { ActionState } from "@/lib/forms/action-state";

/**
 * Money's writes (ws-notes/duties/spec.md §8): bills and their payments, deductions,
 * challans and copies; vendors and the foreign treatment; the ledger map; export invoices,
 * receipts, the EDF and the LUT. Each one: the gate, one call to the service (two when a bill
 * comes with a new vendor), the pages that show it refreshed, and a sentence. Amounts go as he
 * typed them; nothing here does arithmetic on money.
 */

const BASE = "/data/money";
const NO_BILL: ActionState = { status: "error", message: "That bill is not here." };
const NO_VENDOR: ActionState = { status: "error", message: "That vendor is not here." };
const NO_CATEGORY: ActionState = { status: "error", message: "That category is not here." };
const NO_INVOICE: ActionState = { status: "error", message: "That export invoice is not here." };
const CHOOSE_COPY: ActionState = { status: "error", message: "Choose the copy first." };

const billPath = (billId: string) => `${BASE}/bills/${billId}`;
const vendorPath = (vendorId: string) => `${BASE}/vendors/${vendorId}`;
const exportPath = (invoiceId: string) => `${BASE}/exports/${invoiceId}`;
const hasCopy = (copy: object) => "file_id" in copy || "content" in copy;

// ------------------------------------------------------------------ bills

export async function addBillAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, BASE);
  if (refused(context)) return context;
  const read = billInputOf(formData);
  if (isState(read)) return read;
  const copy = await copyFrom(formData);
  if (isState(copy)) return copy;
  const by = staffOf(context);
  const input = { ...read.input };
  if (!input.vendor_id && !read.newVendor)
    return { status: "error", message: "Choose a vendor, or add one by name." };
  try {
    if (read.newVendor) {
      const made = await api.addVendor({ name: read.newVendor }, by, crypto.randomUUID());
      input.vendor_id = made.vendor.vendor_id;
    }
    const { bill } = await api.addBill({ ...input, ...copy }, by, attemptOf(formData));
    refreshData(BASE, `${BASE}/vendors`, "/data/files");
    return sent(
      bill.pay_by
        ? `Added. Pay by ${dayWords(bill.pay_by)}${bill.pay_by_short ? ` ${bill.pay_by_short}` : ""}.`
        : "Added.",
    );
  } catch (error) {
    return refusal(error);
  }
}

export async function updateBillAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, BASE);
  if (refused(context)) return context;
  const billId = idOf(formData, "bill_id");
  if (!billId) return NO_BILL;
  const read = billInputOf(formData);
  if (isState(read)) return read;
  try {
    await api.updateBill(billId, read.input, staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshData(BASE, billPath(billId));
  return sent("Saved.");
}

export async function approveBillAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, BASE);
  if (refused(context)) return context;
  const billId = idOf(formData, "bill_id");
  if (!billId) return NO_BILL;
  try {
    await api.approveBill(billId, staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshData(BASE, billPath(billId));
  return sent("Approved.");
}

export async function deductionAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, BASE);
  if (refused(context)) return context;
  const billId = idOf(formData, "bill_id");
  if (!billId) return NO_BILL;
  const on = typedDay(formData, "deducted_on");
  if (on === null) return NOT_A_DAY;
  let said = "Recorded.";
  try {
    const { bill } = await api.recordDeduction(
      billId,
      {
        deducted: amountTyped(formData, "deducted"),
        deducted_on: on,
        kind: fieldValue(formData, "kind", 30),
      },
      staffOf(context),
    );
    if (bill.deposit) said = `Recorded. Deposit by ${dayWords(bill.deposit.by)}.`;
  } catch (error) {
    return refusal(error);
  }
  refreshData(BASE, billPath(billId));
  return sent(said);
}

export async function challanAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, BASE);
  if (refused(context)) return context;
  const billId = idOf(formData, "bill_id");
  if (!billId) return NO_BILL;
  const on = typedDay(formData, "deposited_on");
  if (on === null) return NOT_A_DAY;
  const copy = await copyFrom(formData);
  if (isState(copy)) return copy;
  try {
    await api.recordChallan(
      billId,
      {
        number: fieldValue(formData, "number", 40).trim(),
        bsr: fieldValue(formData, "bsr", 7).trim(),
        deposited_on: on,
        ...copy,
      },
      staffOf(context),
    );
  } catch (error) {
    return refusal(error);
  }
  refreshData(BASE, billPath(billId), "/data/files");
  return sent("Recorded.");
}

export async function paymentAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, BASE);
  if (refused(context)) return context;
  const billId = idOf(formData, "bill_id");
  if (!billId) return NO_BILL;
  const on = typedDay(formData, "paid_on");
  if (on === null) return NOT_A_DAY;
  let said = "Recorded.";
  try {
    const { bill } = await api.recordBillPayment(
      billId,
      {
        paid_on: on,
        amount: amountTyped(formData, "amount"),
        reference: fieldValue(formData, "reference", 80).trim(),
        method: fieldValue(formData, "method", 10) || "bank",
        inr: amountTyped(formData, "inr"),
        forex: amountTyped(formData, "forex"),
      },
      staffOf(context),
      attemptOf(formData),
    );
    said =
      bill.open_minor > 0
        ? `Recorded. ${minorWordsBy({ [bill.currency]: bill.open_minor })} is still open.`
        : "Recorded. Nothing is open on this bill.";
  } catch (error) {
    return refusal(error);
  }
  refreshData(BASE, billPath(billId));
  return sent(said);
}

export async function takeBackPaymentAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, BASE);
  if (refused(context)) return context;
  const billId = idOf(formData, "bill_id");
  const paymentId = idOf(formData, "payment_id");
  if (!billId || !paymentId) return NO_BILL;
  try {
    await api.takeBackBillPayment(
      billId,
      paymentId,
      fieldValue(formData, "why", 300),
      staffOf(context),
    );
  } catch (error) {
    return refusal(error);
  }
  refreshData(BASE, billPath(billId));
  return sent("Taken back.");
}

export async function cancelBillAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, BASE);
  if (refused(context)) return context;
  const billId = idOf(formData, "bill_id");
  if (!billId) return NO_BILL;
  try {
    await api.cancelBill(billId, fieldValue(formData, "why", 300), staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshData(BASE, billPath(billId));
  return sent("Cancelled. It stays here, with its copy.");
}

export async function billCopyAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, BASE);
  if (refused(context)) return context;
  const billId = idOf(formData, "bill_id");
  if (!billId) return NO_BILL;
  const copy = await copyFrom(formData);
  if (isState(copy)) return copy;
  if (!hasCopy(copy)) return CHOOSE_COPY;
  try {
    await api.attachBillCopy(billId, copy, staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshData(BASE, billPath(billId), "/data/files");
  return sent("Attached.");
}

// ------------------------------------------------------------------ vendors

export async function addVendorAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, BASE);
  if (refused(context)) return context;
  const input = vendorInputOf(formData);
  if (isState(input)) return input;
  try {
    const { checks } = await api.addVendor(input, staffOf(context), attemptOf(formData));
    refreshData(BASE, `${BASE}/vendors`);
    return sent(["Added.", ...checks].join(" "));
  } catch (error) {
    return refusal(error);
  }
}

export async function updateVendorAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, BASE);
  if (refused(context)) return context;
  const vendorId = idOf(formData, "vendor_id");
  if (!vendorId) return NO_VENDOR;
  const input = vendorInputOf(formData);
  if (isState(input)) return input;
  try {
    const { checks } = await api.updateVendor(vendorId, input, staffOf(context));
    refreshData(BASE, `${BASE}/vendors`, vendorPath(vendorId));
    return sent(["Saved.", ...checks].join(" "));
  } catch (error) {
    return refusal(error);
  }
}

export async function foreignAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, BASE);
  if (refused(context)) return context;
  const vendorId = idOf(formData, "vendor_id");
  if (!vendorId) return NO_VENDOR;
  const on = typedDay(formData, "decided_on");
  if (on === null) return NOT_A_DAY;
  const copy = await copyFrom(formData);
  if (isState(copy)) return copy;
  try {
    await api.recordForeign(
      vendorId,
      {
        bills_from: fieldValue(formData, "bills_from", 20),
        paid_by: fieldValue(formData, "paid_by", 20),
        gst: fieldValue(formData, "gst", 30),
        card_forex_rate: fieldValue(formData, "card_forex_rate", 6).trim(),
        decision_tds: fieldValue(formData, "decision_tds", 20),
        decision_basis: fieldValue(formData, "decision_basis", 300),
        decision_forms: fieldValue(formData, "decision_forms", 30),
        decided_by: fieldValue(formData, "decided_by", 120),
        decided_role: fieldValue(formData, "decided_role", 10),
        decided_on: on,
        ...copy,
      },
      staffOf(context),
    );
  } catch (error) {
    return refusal(error);
  }
  refreshData(vendorPath(vendorId), "/data/files");
  return sent("Saved.");
}

export async function retireVendorAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, BASE);
  if (refused(context)) return context;
  const vendorId = idOf(formData, "vendor_id");
  if (!vendorId) return NO_VENDOR;
  try {
    await api.retireVendor(vendorId, staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshData(BASE, `${BASE}/vendors`, vendorPath(vendorId));
  return sent("Retired. Its bills stay.");
}

// ------------------------------------------------------------------ the ledger map

const LEDGER = `${BASE}/ledger`;

export async function addCategoryAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, BASE);
  if (refused(context)) return context;
  try {
    const page = await api.addCategory(
      {
        name: fieldValue(formData, "name", 80),
        kind: fieldValue(formData, "kind", 20),
        ledger: fieldValue(formData, "ledger", 120),
        schedule_line: fieldValue(formData, "schedule_line", 120),
        people: formData.get("people") === "on",
        note: fieldValue(formData, "note", 400),
      },
      staffOf(context),
      attemptOf(formData),
    );
    refreshData(LEDGER, BASE);
    return sent(`Added. ${page.line}`);
  } catch (error) {
    return refusal(error);
  }
}

export async function updateCategoryAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, BASE);
  if (refused(context)) return context;
  const categoryId = idOf(formData, "category_id");
  if (!categoryId) return NO_CATEGORY;
  try {
    const page = await api.updateCategory(
      categoryId,
      {
        ledger: fieldValue(formData, "ledger", 120),
        schedule_line: fieldValue(formData, "schedule_line", 120),
        people: formData.get("people") === "on",
      },
      staffOf(context),
    );
    refreshData(LEDGER);
    return sent(`Saved. ${page.line}`);
  } catch (error) {
    return refusal(error);
  }
}

export async function retireCategoryAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, BASE);
  if (refused(context)) return context;
  const categoryId = idOf(formData, "category_id");
  if (!categoryId) return NO_CATEGORY;
  try {
    await api.retireCategory(categoryId, staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshData(LEDGER, BASE);
  return sent("Retired. What used it keeps it.");
}

export async function starterCategoriesAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, BASE);
  if (refused(context)) return context;
  try {
    const page = await api.addStarterCategories(staffOf(context));
    refreshData(LEDGER, BASE);
    const added = page.added ?? 0;
    return sent(
      added === 0
        ? `Every starter category is here already. ${page.line}`
        : `Added ${added} ${added === 1 ? "category" : "categories"}. ${page.line}`,
    );
  } catch (error) {
    return refusal(error);
  }
}

export async function mapCheckedAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, BASE);
  if (refused(context)) return context;
  const on = typedDay(formData, "on");
  if (on === null) return NOT_A_DAY;
  try {
    await api.recordMapChecked(
      {
        by_name: fieldValue(formData, "by_name", 120),
        on,
        note: fieldValue(formData, "note", 400),
      },
      staffOf(context),
    );
  } catch (error) {
    return refusal(error);
  }
  refreshData(LEDGER);
  return sent("Recorded.");
}

// ------------------------------------------------------------------ export invoices

const EXPORTS = `${BASE}/exports`;

export async function addExportAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, BASE);
  if (refused(context)) return context;
  const input = exportInputOf(formData);
  if (isState(input)) return input;
  const copy = await copyFrom(formData);
  if (isState(copy)) return copy;
  try {
    const { invoice } = await api.addExport(
      { ...input, ...copy },
      staffOf(context),
      attemptOf(formData),
    );
    refreshData(EXPORTS, "/data/files");
    return sent(invoice.edf_by ? `Added. EDF by ${dayWords(invoice.edf_by)}.` : "Added.");
  } catch (error) {
    return refusal(error);
  }
}

export async function updateExportAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, BASE);
  if (refused(context)) return context;
  const invoiceId = idOf(formData, "invoice_id");
  if (!invoiceId) return NO_INVOICE;
  const input = exportInputOf(formData);
  if (isState(input)) return input;
  try {
    await api.updateExport(invoiceId, input, staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshData(EXPORTS, exportPath(invoiceId));
  return sent("Saved.");
}

export async function edfAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const context = await gate(formData, BASE);
  if (refused(context)) return context;
  const invoiceId = idOf(formData, "invoice_id");
  if (!invoiceId) return NO_INVOICE;
  const on = typedDay(formData, "filed_on");
  if (on === null) return NOT_A_DAY;
  try {
    await api.recordEdf(
      invoiceId,
      { filed_on: on, reference: fieldValue(formData, "reference", 80).trim() },
      staffOf(context),
    );
  } catch (error) {
    return refusal(error);
  }
  refreshData(EXPORTS, exportPath(invoiceId));
  return sent("Recorded.");
}

export async function receiptAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, BASE);
  if (refused(context)) return context;
  const invoiceId = idOf(formData, "invoice_id");
  if (!invoiceId) return NO_INVOICE;
  const on = typedDay(formData, "received_on");
  if (on === null) return NOT_A_DAY;
  const copy = await copyFrom(formData);
  if (isState(copy)) return copy;
  let said = "Recorded.";
  try {
    const { invoice } = await api.recordReceipt(
      invoiceId,
      {
        received_on: on,
        amount: amountTyped(formData, "amount"),
        inr: amountTyped(formData, "inr"),
        fira_number: fieldValue(formData, "fira_number", 80).trim(),
        ebrc_number: fieldValue(formData, "ebrc_number", 80).trim(),
        ...copy,
      },
      staffOf(context),
      attemptOf(formData),
    );
    const last = invoice.receipts[invoice.receipts.length - 1];
    if (last?.rate_words) said = `Recorded at ${last.rate_words}.`;
  } catch (error) {
    return refusal(error);
  }
  refreshData(EXPORTS, exportPath(invoiceId), "/data/files");
  return sent(said);
}

export async function updateReceiptAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, BASE);
  if (refused(context)) return context;
  const invoiceId = idOf(formData, "invoice_id");
  const receiptId = idOf(formData, "receipt_id");
  if (!invoiceId || !receiptId) return NO_INVOICE;
  const copy = await copyFrom(formData);
  if (isState(copy)) return copy;
  try {
    await api.updateReceipt(
      invoiceId,
      receiptId,
      {
        inr: amountTyped(formData, "inr"),
        fira_number: fieldValue(formData, "fira_number", 80).trim(),
        ebrc_number: fieldValue(formData, "ebrc_number", 80).trim(),
        ...copy,
      },
      staffOf(context),
    );
  } catch (error) {
    return refusal(error);
  }
  refreshData(EXPORTS, exportPath(invoiceId), "/data/files");
  return sent("Saved.");
}

export async function takeBackReceiptAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, BASE);
  if (refused(context)) return context;
  const invoiceId = idOf(formData, "invoice_id");
  const receiptId = idOf(formData, "receipt_id");
  if (!invoiceId || !receiptId) return NO_INVOICE;
  try {
    await api.takeBackReceipt(
      invoiceId,
      receiptId,
      fieldValue(formData, "why", 300),
      staffOf(context),
    );
  } catch (error) {
    return refusal(error);
  }
  refreshData(EXPORTS, exportPath(invoiceId));
  return sent("Taken back.");
}

export async function cancelExportAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, BASE);
  if (refused(context)) return context;
  const invoiceId = idOf(formData, "invoice_id");
  if (!invoiceId) return NO_INVOICE;
  try {
    await api.cancelExport(invoiceId, fieldValue(formData, "why", 300), staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshData(EXPORTS, exportPath(invoiceId));
  return sent("Cancelled. It stays here, with its copy.");
}

export async function exportCopyAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, BASE);
  if (refused(context)) return context;
  const invoiceId = idOf(formData, "invoice_id");
  if (!invoiceId) return NO_INVOICE;
  const copy = await copyFrom(formData);
  if (isState(copy)) return copy;
  if (!hasCopy(copy)) return CHOOSE_COPY;
  try {
    await api.attachExportCopy(invoiceId, copy, staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshData(EXPORTS, exportPath(invoiceId), "/data/files");
  return sent("Attached.");
}

export async function lutAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const context = await gate(formData, BASE);
  if (refused(context)) return context;
  const on = typedDay(formData, "filed_on");
  if (on === null) return NOT_A_DAY;
  const copy = await copyFrom(formData);
  if (isState(copy)) return copy;
  try {
    await api.addLut(
      {
        fy: fieldValue(formData, "fy", 7).trim(),
        arn: fieldValue(formData, "arn", 40).trim(),
        filed_on: on,
        ...copy,
      },
      staffOf(context),
      attemptOf(formData),
    );
  } catch (error) {
    return refusal(error);
  }
  refreshData(EXPORTS, "/data/files");
  return sent("Recorded.");
}
