/**
 * The shapes of Money's records (ws-notes/duties/spec.md §8.2): the ledger map's categories,
 * vendors with the foreign-vendor treatment, bills with tax deducted and the MSME pay-by
 * day, export invoices with the LUT, the EDF, each receipt and its FIRA, and the setup that
 * holds the LUTs. Amounts are whole minor units (paise, cents), never added across
 * currencies. Names follow the HQ service's vendor and expense where one exists.
 */

import type { CategoryKind } from "../duties-contracts";
import type { Staff } from "../protocol";

export type { CategoryKind };

export type Flag = "yes" | "no" | "";

export type Stamp = {
  created_at: string;
  created_by: Staff;
  updated_at: string;
  updated_by: Staff;
};

export type Category = Stamp & {
  category_id: string;
  name: string;
  kind: CategoryKind;
  /** The CA's ledger in the books software, as typed; "" until mapped. */
  ledger: string;
  /** The Schedule III line, as typed; "" until mapped. */
  schedule_line: string;
  /** Its lines name a person's pay (stipends, salaries). */
  people: boolean;
  note: string;
  retired: boolean;
};

export type TdsKind =
  | "contractor_person"
  | "contractor_other"
  | "technical"
  | "professional"
  | "director"
  | "rent_plant"
  | "rent_building"
  | "none";

export type UdyamClass = "" | "micro" | "small" | "medium" | "not_registered";

export type ForeignDecision = {
  tds: "deduct" | "do_not_deduct";
  /** The rate or treaty note, in his CA's words. */
  basis: string;
  forms: "none" | "form_only" | "form_and_certificate";
  decided_by: string;
  decided_role: "CA" | "lawyer";
  decided_on: string;
  /** The CA's note or mail, in Files (folder "Money › Vendors"). */
  file_id: string | null;
};

export type Vendor = Stamp & {
  vendor_id: string;
  name: string;
  legal_name: string;
  residency: "" | "resident" | "non_resident";
  country: string;
  pan: string;
  gstin: string;
  udyam: {
    class: UdyamClass;
    number: string;
    checked_on: string | null;
    certificate_file_id: string | null;
  };
  /** A written agreement on payment days with a micro or small supplier. */
  msme_agreement: { has: Flag; days: number | null };
  /** The default for its bills. */
  tds_kind: TdsKind | "";
  default_category_id: string | null;
  contact_id: string | null;
  notes: string;
  /** For a vendor abroad: how it bills, and the CA's one decision. */
  foreign: {
    bills_from: "" | "abroad" | "indian_company";
    paid_by: "" | "card" | "bank_transfer" | "other";
    gst: "" | "reverse_charge" | "charged_on_the_bill" | "not_registered_for_gst";
    /** What paying by card costs in exchange, as the card's terms give it: 2.5 → "2.5 per cent". */
    card_forex_rate: number | null;
    decision: ForeignDecision | null;
  };
  retired: boolean;
};

export type Taken = { at: string; by: Staff; why: string };

export type Payment = {
  payment_id: string;
  paid_on: string;
  /** In the bill's currency. */
  amount_minor: number;
  reference: string;
  method: "bank" | "card" | "upi" | "other";
  /** For a bill not in rupees: the rupees that left the bank, and the exchange cost within them. */
  inr_minor: number | null;
  forex_minor: number | null;
  /** The statement line it was matched from, when the statements module recorded it. */
  from_line: string | null;
  taken_back: Taken | null;
  at: string;
  by: Staff;
};

export type Challan = {
  number: string;
  bsr: string;
  deposited_on: string;
  file_id: string | null;
};

export type Cancelled = { on: string; why: string; at: string; by: Staff };

export type Bill = Stamp & {
  bill_id: string;
  vendor_id: string;
  invoice_number: string;
  invoice_on: string;
  /** The day the goods or the service were accepted; null means the invoice day. */
  accepted_on: string | null;
  description: string;
  currency: string;
  /** Before GST · the GST on the bill · what the bill says in all. */
  taxable_minor: number;
  gst_minor: number;
  total_minor: number;
  gst_treatment: "" | "charged_on_the_bill" | "reverse_charge" | "no_gst";
  category_id: string | null;
  tds: {
    kind: TdsKind | "";
    deducted_minor: number | null;
    deducted_on: string | null;
    challan: Challan | null;
  };
  /** A pay-by day he types, used when no MSME limit applies. */
  pay_by_typed: string | null;
  approved: { by_name: string; on: string } | null;
  payments: Payment[];
  /** The invoice, in Files (folder "Money › Bills › {financial year}"). */
  file_id: string | null;
  cancelled: Cancelled | null;
};

export type Receipt = {
  receipt_id: string;
  received_on: string;
  amount_minor: number;
  inr_minor: number | null;
  fira_number: string;
  fira_file_id: string | null;
  /** An e-BRC number, where the bank gives one. */
  ebrc_number: string;
  from_line: string | null;
  taken_back: Taken | null;
  at: string;
  by: Staff;
};

export type ExportInvoice = Stamp & {
  invoice_id: string;
  customer: string;
  country: string;
  waitlist_entry_id: string | null;
  invoice_number: string;
  invoice_on: string;
  currency: string;
  amount_minor: number;
  tax_treatment: "" | "under_lut" | "igst_paid";
  /** The RBI purpose code on the remittance, as the bank used it: "P0802". */
  purpose_code: string;
  /** How the money comes in, as he types it. */
  rail: string;
  edf: { filed_on: string; reference: string } | null;
  receipts: Receipt[];
  /** The invoice as issued by the books, in Files (folder "Money › Export invoices › {year}"). */
  file_id: string | null;
  cancelled: Cancelled | null;
  notes: string;
};

export type Lut = { fy: string; arn: string; filed_on: string; file_id: string | null };

export type MoneySetup = {
  /** One LUT a financial year. */
  luts: Lut[];
  /** The CA looked at the ledger map. */
  map_checked: { by_name: string; on: string; note: string } | null;
};

/** What changed, field names only, for each record's Activity. */
export type MoneyEvent = {
  event_id: string;
  record: string;
  id: string;
  verb: string;
  fields: string[];
  by: Staff;
  at: string;
};
