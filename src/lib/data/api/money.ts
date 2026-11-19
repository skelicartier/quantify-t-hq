import "server-only";

import { z } from "zod";

import { fileChoiceSchema, type CopyInput } from "@/lib/data/api/meetings";
import { staffSchema } from "@/lib/data/api/replies";
import type { Staff } from "@/lib/data/gate";
import { dataAsk, id, ok } from "@/lib/data/socket";

/**
 * Money records (ws-notes/duties/spec.md §8.7), kept on this computer by the local service:
 * the ledger map, vendors with the foreign-vendor treatment, bills with tax deducted and the
 * MSME pay-by day, export invoices, the edit log. Amounts are whole minor units (paise,
 * cents), one figure per currency, never added across currencies. A schema for every answer.
 */

/** A duty rule's state beside a worked-out value: declared again, as pages never import `scripts/`. */
export const ruleLineSchema = z.object({
  key: z.string(),
  title: z.string(),
  confirm_with: z.enum(["CA", "CS", "lawyer", "agent", "bank"]).nullable(),
  confirmed_by: z.string().nullable(),
  confirmed_on: z.string().nullable(),
  usable: z.boolean(),
  starts_on: z.string().nullable(),
  readings: z.array(z.string()),
});
export type RuleLineData = z.infer<typeof ruleLineSchema>;

export const editLineSchema = z.object({
  n: z.number(),
  record: z.string(),
  id: z.string(),
  verb: z.string(),
  changes: z.array(z.object({ field: z.string(), before: z.string(), after: z.string() })),
  by: staffSchema,
  at: z.string(),
  hash: z.string(),
});
export type EditLineData = z.infer<typeof editLineSchema>;

export const moneyEventSchema = z.object({
  event_id: z.string(),
  record: z.string(),
  id: z.string(),
  verb: z.string(),
  fields: z.array(z.string()),
  by: staffSchema,
  at: z.string(),
});
export type MoneyEvent = z.infer<typeof moneyEventSchema>;

const linkSchema = z.object({ file_id: z.string(), title: z.string() }).nullable();
const amountsSchema = z.record(z.string(), z.number());
export const hereSchema = z.object({
  rules: z.boolean(),
  lock: z.boolean(),
  holidays: z.boolean(),
});
export type MoneyHere = z.infer<typeof hereSchema>;
const stampSchema = {
  created_at: z.string(),
  created_by: staffSchema,
  updated_at: z.string(),
  updated_by: staffSchema,
};

export const categoryKindSchema = z.enum([
  "expense",
  "income",
  "tax",
  "funding",
  "transfer",
  "other",
]);
export const tdsKindSchema = z.enum([
  "contractor_person",
  "contractor_other",
  "technical",
  "professional",
  "director",
  "rent_plant",
  "rent_building",
  "none",
]);
export type TdsKind = z.infer<typeof tdsKindSchema>;
const tdsKindOrBlank = z.union([tdsKindSchema, z.literal("")]);
const residencySchema = z.enum(["", "resident", "non_resident"]);
const udyamClassSchema = z.enum(["", "micro", "small", "medium", "not_registered"]);
const flagSchema = z.enum(["yes", "no", ""]);
const billStateSchema = z.enum(["open", "part_paid", "paid", "paid_late", "cancelled"]);
const takenSchema = z.object({ at: z.string(), by: staffSchema, why: z.string() }).nullable();
const cancelledSchema = z
  .object({ on: z.string(), why: z.string(), at: z.string(), by: staffSchema })
  .nullable();

const categoryOptionSchema = z.object({
  category_id: z.string(),
  name: z.string(),
  kind: categoryKindSchema,
});
export type CategoryOption = z.infer<typeof categoryOptionSchema>;
const vendorOptionSchema = z.object({
  vendor_id: z.string(),
  name: z.string(),
  tds_kind: tdsKindOrBlank,
  residency: residencySchema,
  retired: z.boolean(),
});
export type VendorOption = z.infer<typeof vendorOptionSchema>;

// ------------------------------------------------------------------ bills

export const paymentSchema = z.object({
  payment_id: z.string(),
  paid_on: z.string(),
  amount_minor: z.number(),
  reference: z.string(),
  method: z.enum(["bank", "card", "upi", "other"]),
  inr_minor: z.number().nullable(),
  forex_minor: z.number().nullable(),
  from_line: z.string().nullable(),
  taken_back: takenSchema,
  at: z.string(),
  by: staffSchema,
});
export type Payment = z.infer<typeof paymentSchema>;

export const billRecordSchema = z.object({
  bill_id: z.string(),
  vendor_id: z.string(),
  invoice_number: z.string(),
  invoice_on: z.string(),
  accepted_on: z.string().nullable(),
  description: z.string(),
  currency: z.string(),
  taxable_minor: z.number(),
  gst_minor: z.number(),
  total_minor: z.number(),
  gst_treatment: z.enum(["", "charged_on_the_bill", "reverse_charge", "no_gst"]),
  category_id: z.string().nullable(),
  tds: z.object({
    kind: tdsKindOrBlank,
    deducted_minor: z.number().nullable(),
    deducted_on: z.string().nullable(),
    challan: z
      .object({
        number: z.string(),
        bsr: z.string(),
        deposited_on: z.string(),
        file_id: z.string().nullable(),
      })
      .nullable(),
  }),
  pay_by_typed: z.string().nullable(),
  approved: z.object({ by_name: z.string(), on: z.string() }).nullable(),
  payments: z.array(paymentSchema),
  file_id: z.string().nullable(),
  cancelled: cancelledSchema,
  ...stampSchema,
});

export const msmeSchema = z.object({
  applies: z.boolean(),
  pay_by: z.string().nullable(),
  words: z.string(),
  note: z.string(),
  short: z.string(),
  rule: ruleLineSchema.nullable(),
});
export const tdsLineSchema = z.object({
  kind: tdsKindSchema,
  label: z.string(),
  section: z.string(),
  code: z.string(),
  fy: z.string(),
  ytd_minor: z.number(),
  words: z.string(),
  hint_words: z.string(),
  rule: ruleLineSchema.nullable(),
  rate_rule: ruleLineSchema.nullable(),
  deposit_by: z.string().nullable(),
  deposit_rule: ruleLineSchema.nullable(),
});
export type TdsLineData = z.infer<typeof tdsLineSchema>;

export const billSchema = billRecordSchema.extend({
  vendor_name: z.string(),
  category_name: z.string(),
  payable_minor: z.number(),
  paid_minor: z.number(),
  open_minor: z.number(),
  full_on: z.string().nullable(),
  state: billStateSchema,
  msme: msmeSchema.nullable(),
  pay_by: z.string().nullable(),
  pay_by_short: z.string(),
  paid_late_words: z.string(),
  tds_line: tdsLineSchema.nullable(),
  deposit: z.object({ by: z.string(), rule: ruleLineSchema.nullable() }).nullable(),
  checks: z.array(z.string()),
  held_until: z.string().nullable(),
  locked: z.boolean(),
  file: linkSchema,
  challan_file: linkSchema,
  edits: z.array(editLineSchema),
});
export type Bill = z.infer<typeof billSchema>;

export const billRowSchema = z.object({
  bill_id: z.string(),
  vendor_id: z.string(),
  vendor_name: z.string(),
  invoice_number: z.string(),
  invoice_on: z.string(),
  description: z.string(),
  currency: z.string(),
  total_minor: z.number(),
  deducted_minor: z.number().nullable(),
  payable_minor: z.number(),
  paid_minor: z.number(),
  open_minor: z.number(),
  pay_by: z.string().nullable(),
  pay_by_short: z.string(),
  state: billStateSchema,
  category_name: z.string(),
  has_copy: z.boolean(),
  locked: z.boolean(),
});
export type BillRow = z.infer<typeof billRowSchema>;

export const billsPageSchema = ok.extend({
  bills: z.array(billRowSchema),
  totals: z.object({ open: amountsSchema, shown: amountsSchema }),
  open_bills: z.number(),
  counts: z.object({ open: z.number(), paid: z.number(), all: z.number(), cancelled: z.number() }),
  view: z.enum(["open", "paid", "all", "cancelled"]),
  vendor: z.string(),
  fy: z.string(),
  years: z.array(z.string()),
  vendors: z.array(vendorOptionSchema),
  categories: z.array(categoryOptionSchema),
  files: z.array(fileChoiceSchema),
  files_here: z.boolean(),
  here: hereSchema,
  today: z.string(),
});
export type BillsPage = z.infer<typeof billsPageSchema>;

const decisionSchema = z.object({
  tds: z.enum(["deduct", "do_not_deduct"]),
  basis: z.string(),
  forms: z.enum(["none", "form_only", "form_and_certificate"]),
  decided_by: z.string(),
  decided_role: z.enum(["CA", "lawyer"]),
  decided_on: z.string(),
  file_id: z.string().nullable(),
});

export const billPageSchema = ok.extend({
  bill: billSchema,
  vendor: z
    .object({
      vendor_id: z.string(),
      name: z.string(),
      residency: residencySchema,
      udyam_class: udyamClassSchema,
      tds_kind: tdsKindOrBlank,
      retired: z.boolean(),
      decision: decisionSchema.nullable(),
    })
    .nullable(),
  lock_words: z.string(),
  vendors: z.array(vendorOptionSchema),
  categories: z.array(categoryOptionSchema),
  files: z.array(fileChoiceSchema),
  files_here: z.boolean(),
  here: hereSchema,
  events: z.array(moneyEventSchema),
  today: z.string(),
});
export type BillPage = z.infer<typeof billPageSchema>;

// ------------------------------------------------------------------ vendors

export const vendorSchema = z.object({
  vendor_id: z.string(),
  name: z.string(),
  legal_name: z.string(),
  residency: residencySchema,
  country: z.string(),
  pan: z.string(),
  gstin: z.string(),
  udyam: z.object({
    class: udyamClassSchema,
    number: z.string(),
    checked_on: z.string().nullable(),
    certificate_file_id: z.string().nullable(),
  }),
  msme_agreement: z.object({ has: flagSchema, days: z.number().nullable() }),
  tds_kind: tdsKindOrBlank,
  default_category_id: z.string().nullable(),
  contact_id: z.string().nullable(),
  notes: z.string(),
  foreign: z.object({
    bills_from: z.enum(["", "abroad", "indian_company"]),
    paid_by: z.enum(["", "card", "bank_transfer", "other"]),
    gst: z.enum(["", "reverse_charge", "charged_on_the_bill", "not_registered_for_gst"]),
    card_forex_rate: z.number().nullable(),
    decision: decisionSchema.nullable(),
  }),
  retired: z.boolean(),
  ...stampSchema,
});
export type Vendor = z.infer<typeof vendorSchema>;

export const vendorRowSchema = z.object({
  vendor_id: z.string(),
  name: z.string(),
  legal_name: z.string(),
  residency: residencySchema,
  country: z.string(),
  pan: z.string(),
  gstin: z.string(),
  udyam_class: udyamClassSchema,
  udyam_number: z.string(),
  tds_kind: tdsKindOrBlank,
  retired: z.boolean(),
  bills: z.number(),
  billed_this_year: amountsSchema,
  fy: z.string(),
});
export type VendorRow = z.infer<typeof vendorRowSchema>;

export const vendorsPageSchema = ok.extend({
  vendors: z.array(vendorRowSchema),
  fy: z.string(),
  categories: z.array(categoryOptionSchema),
  here: hereSchema,
  today: z.string(),
});
export type VendorsPage = z.infer<typeof vendorsPageSchema>;

const readingSchema = z.object({
  label: z.string(),
  amount: z.number().nullable(),
  words: z.string(),
  sources: z.array(z.object({ name: z.string(), url: z.string() })),
});

export const vendorYearSchema = z.object({
  fy: z.string(),
  billed: amountsSchema,
  taxable_inr_minor: z.number(),
  tds_deducted_minor: z.number(),
  bills: z.number(),
  line: z.string(),
  rule: ruleLineSchema.nullable(),
});
export type VendorYear = z.infer<typeof vendorYearSchema>;

export const vendorPageSchema = ok.extend({
  vendor: vendorSchema,
  years: z.array(vendorYearSchema),
  forms: z.object({
    rule: ruleLineSchema.nullable(),
    readings: z.array(readingSchema),
    confirmed_label: z.string().nullable(),
    reading: z.number().nullable(),
  }),
  checks: z.array(z.string()),
  bills: z.array(billRowSchema),
  decision_file: linkSchema,
  contact: z.object({ contact_id: z.string(), name: z.string() }).nullable(),
  categories: z.array(categoryOptionSchema),
  category_name: z.string(),
  files: z.array(fileChoiceSchema),
  files_here: z.boolean(),
  here: hereSchema,
  events: z.array(moneyEventSchema),
  edits: z.array(editLineSchema),
  today: z.string(),
});
export type VendorPage = z.infer<typeof vendorPageSchema>;

// ------------------------------------------------------------------ the ledger map

export const categorySchema = z.object({
  category_id: z.string(),
  name: z.string(),
  kind: categoryKindSchema,
  ledger: z.string(),
  schedule_line: z.string(),
  people: z.boolean(),
  retired: z.boolean(),
});
export const ledgerPageSchema = ok.extend({
  categories: z.array(categorySchema.extend({ note: z.string(), in_use: z.number() })),
  line: z.string(),
  mapped: z.number(),
  live: z.number(),
  checks: z.array(z.string()),
  map_checked: z.object({ by_name: z.string(), on: z.string(), note: z.string() }).nullable(),
  here: hereSchema,
  today: z.string(),
  added: z.number().optional(),
  category: categorySchema.optional(),
});
export type LedgerPage = z.infer<typeof ledgerPageSchema>;

// ------------------------------------------------------------------ export invoices

export const receiptSchema = z.object({
  receipt_id: z.string(),
  received_on: z.string(),
  amount_minor: z.number(),
  inr_minor: z.number().nullable(),
  fira_number: z.string(),
  fira_file_id: z.string().nullable(),
  ebrc_number: z.string(),
  from_line: z.string().nullable(),
  taken_back: takenSchema,
  at: z.string(),
  by: staffSchema,
});

const realisedSchema = z.object({
  minor: z.number(),
  of_minor: z.number(),
  in_full_on: z.string().nullable(),
  inr_minor: z.number().nullable(),
});
const clocksSchema = {
  edf_by: z.string().nullable(),
  realise_by: z.string().nullable(),
  rules: z.object({ edf: ruleLineSchema.nullable(), realisation: ruleLineSchema.nullable() }),
  readings: z.array(z.string()),
  realised: realisedSchema,
};

export const exportRecordSchema = z.object({
  invoice_id: z.string(),
  customer: z.string(),
  country: z.string(),
  waitlist_entry_id: z.string().nullable(),
  invoice_number: z.string(),
  invoice_on: z.string(),
  currency: z.string(),
  amount_minor: z.number(),
  tax_treatment: z.enum(["", "under_lut", "igst_paid"]),
  purpose_code: z.string(),
  rail: z.string(),
  edf: z.object({ filed_on: z.string(), reference: z.string() }).nullable(),
  file_id: z.string().nullable(),
  cancelled: cancelledSchema,
  notes: z.string(),
  ...stampSchema,
});

export const exportInvoiceSchema = exportRecordSchema.extend({
  ...clocksSchema,
  checks: z.array(z.string()),
  receipts: z.array(receiptSchema.extend({ rate_words: z.string(), fira_file: linkSchema })),
  held_until: z.string().nullable(),
  locked: z.boolean(),
  file: linkSchema,
  edits: z.array(editLineSchema),
});
export type ExportInvoice = z.infer<typeof exportInvoiceSchema>;

export const exportRowSchema = z.object({
  invoice_id: z.string(),
  customer: z.string(),
  country: z.string(),
  invoice_number: z.string(),
  invoice_on: z.string(),
  currency: z.string(),
  amount_minor: z.number(),
  tax_treatment: z.enum(["", "under_lut", "igst_paid"]),
  edf: z.object({ filed_on: z.string(), reference: z.string() }).nullable(),
  ...clocksSchema,
  cancelled: z.boolean(),
  has_copy: z.boolean(),
  locked: z.boolean(),
});
export type ExportRow = z.infer<typeof exportRowSchema>;

const lutSchema = z.object({
  fy: z.string(),
  arn: z.string(),
  filed_on: z.string(),
  file_id: z.string().nullable(),
  file: linkSchema,
});
export type Lut = z.infer<typeof lutSchema>;

export const exportsPageSchema = ok.extend({
  invoices: z.array(exportRowSchema),
  totals: z.object({ invoiced: amountsSchema, to_realise: amountsSchema }),
  luts: z.array(lutSchema),
  years: z.array(z.string()),
  files: z.array(fileChoiceSchema),
  files_here: z.boolean(),
  here: hereSchema,
  today: z.string(),
});
export type ExportsPage = z.infer<typeof exportsPageSchema>;

export const exportPageSchema = ok.extend({
  invoice: exportInvoiceSchema,
  lock_words: z.string(),
  lut: z
    .object({
      fy: z.string(),
      arn: z.string(),
      filed_on: z.string(),
      file_id: z.string().nullable(),
    })
    .nullable(),
  files: z.array(fileChoiceSchema),
  files_here: z.boolean(),
  here: hereSchema,
  events: z.array(moneyEventSchema),
  today: z.string(),
});
export type ExportPage = z.infer<typeof exportPageSchema>;

// ------------------------------------------------------------------ the edit log

export const editsSchema = ok.extend({
  edits: z.array(editLineSchema),
  total: z.number(),
  ahead: z.array(z.number()),
});
/** `intact` is the chain's own answer; `ok` is the envelope's. */
export const verifySchema = ok.extend({
  intact: z.boolean(),
  lines: z.number(),
  broken_at: z.number().nullable(),
  ahead: z.array(z.number()),
});

// ------------------------------------------------------------------ reads

export type BillsQuery = { view?: string; vendor?: string; fy?: string };

export function readBills(input: BillsQuery = {}) {
  const params = new URLSearchParams();
  if (input.view) params.set("view", input.view);
  if (input.vendor) params.set("vendor", input.vendor);
  if (input.fy) params.set("fy", input.fy);
  const rendered = params.toString();
  return dataAsk(billsPageSchema, "GET", `/data/money${rendered ? `?${rendered}` : ""}`);
}
export const readBill = (billId: string) =>
  dataAsk(billPageSchema, "GET", `/data/money/bills/${id(billId)}`);
export const readVendors = () => dataAsk(vendorsPageSchema, "GET", "/data/money/vendors");
export const readVendor = (vendorId: string) =>
  dataAsk(vendorPageSchema, "GET", `/data/money/vendors/${id(vendorId)}`);
export const readLedger = () => dataAsk(ledgerPageSchema, "GET", "/data/money/ledger");
export const readExports = () => dataAsk(exportsPageSchema, "GET", "/data/money/exports");
export const readExport = (invoiceId: string) =>
  dataAsk(exportPageSchema, "GET", `/data/money/exports/${id(invoiceId)}`);
export function readEdits(input: { record?: string; id?: string } = {}) {
  const params = new URLSearchParams();
  if (input.record) params.set("record", input.record);
  if (input.id) params.set("id", input.id);
  const rendered = params.toString();
  return dataAsk(editsSchema, "GET", `/data/money/edits${rendered ? `?${rendered}` : ""}`);
}
/** The chain as it is on disk. */
export const verifyEdits = () => dataAsk(verifySchema, "GET", "/data/money/edits/verify");

// ------------------------------------------------------------------ writes: bills

/** Amounts go as he typed them ("1,180.50"); the service reads them into paise. */
export type BillInput = {
  vendor_id: string;
  invoice_number: string;
  invoice_on: string;
  accepted_on: string;
  description: string;
  currency: string;
  taxable: string;
  gst: string;
  total: string;
  gst_treatment: string;
  category_id: string;
  tds_kind: string;
  pay_by: string;
};

const post = <T>(schema: z.ZodType<T>, path: string, body: Record<string, unknown>, by: Staff) =>
  dataAsk(schema, "POST", path, { ...body, by });

export const addBill = (input: BillInput & CopyInput, by: Staff, attempt: string) =>
  post(billPageSchema, "/data/money/bills", { ...input, attempt }, by);
export const updateBill = (billId: string, input: Partial<BillInput>, by: Staff) =>
  post(billPageSchema, `/data/money/bills/${id(billId)}/update`, input, by);
export const approveBill = (billId: string, by: Staff) =>
  post(billPageSchema, `/data/money/bills/${id(billId)}/approve`, {}, by);
export const recordDeduction = (
  billId: string,
  input: { deducted: string; deducted_on: string; kind: string },
  by: Staff,
) => post(billPageSchema, `/data/money/bills/${id(billId)}/tds`, input, by);
export const recordChallan = (
  billId: string,
  input: { number: string; bsr: string; deposited_on: string } & CopyInput,
  by: Staff,
) => post(billPageSchema, `/data/money/bills/${id(billId)}/challan`, input, by);
export const recordBillPayment = (
  billId: string,
  input: {
    paid_on: string;
    amount: string;
    reference: string;
    method: string;
    inr: string;
    forex: string;
  },
  by: Staff,
  attempt: string,
) => post(billPageSchema, `/data/money/bills/${id(billId)}/payments`, { ...input, attempt }, by);
export const takeBackBillPayment = (billId: string, paymentId: string, why: string, by: Staff) =>
  post(
    billPageSchema,
    `/data/money/bills/${id(billId)}/payments/${id(paymentId)}/take-back`,
    { why },
    by,
  );
export const cancelBill = (billId: string, why: string, by: Staff) =>
  post(billPageSchema, `/data/money/bills/${id(billId)}/cancel`, { why }, by);
export const attachBillCopy = (billId: string, copy: CopyInput, by: Staff) =>
  post(billPageSchema, `/data/money/bills/${id(billId)}/file`, { ...copy }, by);

// ------------------------------------------------------------------ writes: vendors

export type VendorInput = {
  name: string;
  legal_name: string;
  residency: string;
  country: string;
  pan: string;
  gstin: string;
  udyam_class: string;
  udyam_number: string;
  udyam_checked_on: string;
  msme_agreement: string;
  msme_days: string;
  tds_kind: string;
  default_category_id: string;
  notes: string;
};

export const addVendor = (input: Partial<VendorInput>, by: Staff, attempt: string) =>
  post(vendorPageSchema, "/data/money/vendors", { ...input, attempt }, by);
export const updateVendor = (vendorId: string, input: Partial<VendorInput>, by: Staff) =>
  post(vendorPageSchema, `/data/money/vendors/${id(vendorId)}/update`, input, by);
export type ForeignInput = {
  bills_from: string;
  paid_by: string;
  gst: string;
  card_forex_rate: string;
  decision_tds: string;
  decision_basis: string;
  decision_forms: string;
  decided_by: string;
  decided_role: string;
  decided_on: string;
};
export const recordForeign = (vendorId: string, input: ForeignInput & CopyInput, by: Staff) =>
  post(vendorPageSchema, `/data/money/vendors/${id(vendorId)}/foreign`, input, by);
export const retireVendor = (vendorId: string, by: Staff) =>
  post(vendorPageSchema, `/data/money/vendors/${id(vendorId)}/retire`, {}, by);

// ------------------------------------------------------------------ writes: the ledger map

export type CategoryInput = {
  name: string;
  kind: string;
  ledger: string;
  schedule_line: string;
  people: boolean;
  note: string;
};
export const addCategory = (input: CategoryInput, by: Staff, attempt: string) =>
  post(ledgerPageSchema, "/data/money/categories", { ...input, attempt }, by);
export const updateCategory = (categoryId: string, input: Partial<CategoryInput>, by: Staff) =>
  post(ledgerPageSchema, `/data/money/categories/${id(categoryId)}/update`, input, by);
export const retireCategory = (categoryId: string, by: Staff) =>
  post(ledgerPageSchema, `/data/money/categories/${id(categoryId)}/retire`, {}, by);
export const addStarterCategories = (by: Staff) =>
  post(ledgerPageSchema, "/data/money/categories/starter", {}, by);
export const recordMapChecked = (input: { by_name: string; on: string; note: string }, by: Staff) =>
  post(ledgerPageSchema, "/data/money/ledger/checked", input, by);

// ------------------------------------------------------------------ writes: export invoices

export type ExportInput = {
  customer: string;
  country: string;
  invoice_number: string;
  invoice_on: string;
  currency: string;
  amount: string;
  tax_treatment: string;
  purpose_code: string;
  rail: string;
  notes: string;
};
export const addExport = (input: ExportInput & CopyInput, by: Staff, attempt: string) =>
  post(exportPageSchema, "/data/money/exports", { ...input, attempt }, by);
export const updateExport = (invoiceId: string, input: Partial<ExportInput>, by: Staff) =>
  post(exportPageSchema, `/data/money/exports/${id(invoiceId)}/update`, input, by);
export const recordEdf = (
  invoiceId: string,
  input: { filed_on: string; reference: string },
  by: Staff,
) => post(exportPageSchema, `/data/money/exports/${id(invoiceId)}/edf`, input, by);
export type ReceiptInput = {
  received_on: string;
  amount: string;
  inr: string;
  fira_number: string;
  ebrc_number: string;
};
export const recordReceipt = (
  invoiceId: string,
  input: ReceiptInput & CopyInput,
  by: Staff,
  attempt: string,
) =>
  post(
    exportPageSchema,
    `/data/money/exports/${id(invoiceId)}/receipts`,
    { ...input, attempt },
    by,
  );
export const updateReceipt = (
  invoiceId: string,
  receiptId: string,
  input: { inr?: string; fira_number?: string; ebrc_number?: string } & CopyInput,
  by: Staff,
) =>
  post(
    exportPageSchema,
    `/data/money/exports/${id(invoiceId)}/receipts/${id(receiptId)}/update`,
    input,
    by,
  );
export const takeBackReceipt = (invoiceId: string, receiptId: string, why: string, by: Staff) =>
  post(
    exportPageSchema,
    `/data/money/exports/${id(invoiceId)}/receipts/${id(receiptId)}/take-back`,
    { why },
    by,
  );
export const cancelExport = (invoiceId: string, why: string, by: Staff) =>
  post(exportPageSchema, `/data/money/exports/${id(invoiceId)}/cancel`, { why }, by);
export const attachExportCopy = (invoiceId: string, copy: CopyInput, by: Staff) =>
  post(exportPageSchema, `/data/money/exports/${id(invoiceId)}/file`, { ...copy }, by);
export const addLut = (
  input: { fy: string; arn: string; filed_on: string } & CopyInput,
  by: Staff,
  attempt: string,
) => post(ok.extend({ lut: lutSchema }), "/data/money/luts", { ...input, attempt }, by);

/** The four CSVs for the CA, made as builds: the purchase register, vendors, the map, export invoices. */
export const MONEY_CSV_KINDS = {
  bills: "money_bills_csv",
  vendors: "money_vendors_csv",
  ledger: "money_ledger_csv",
  exports: "money_exports_csv",
} as const;
