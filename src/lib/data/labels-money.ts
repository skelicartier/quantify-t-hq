/**
 * Money's words (ws-notes/duties/spec.md §8): the ledger map, vendors, bills with tax deducted
 * and the MSME pay-by day, the foreign-vendor treatment and export invoices. Shared by the
 * service (`scripts/data/money/**`, which imports it relatively) and the pages. Pure: no file,
 * no clock. A record and a reminder, not legal, tax or accounting advice.
 */

export type Labelled = { label: string; tone: "live" | "danger" | "attention" | "neutral" };

/** The About line every Money page carries (spec §2 rule 3). */
export const MONEY_ABOUT =
  "A record and a reminder, not legal, tax or accounting advice. Your CA keeps the books; nothing is filed from here.";

/** Said where a worked-out day or comparison would be, in a copy without the rule book. */
export const RULES_ABSENT = "The rule book is not loaded here.";

/** Under the tax-deducted section of a bill, always. */
export const TDS_GUIDE =
  "HQ shows what the rate comes to as a guide. What to deduct is your CA's call.";

export const CATEGORY_KINDS = {
  expense: "Expense",
  income: "Income",
  tax: "Tax",
  funding: "Funding",
  transfer: "Between own accounts",
  other: "Other",
} as const;
export type CategoryKindKey = keyof typeof CATEGORY_KINDS;

export const TDS_KINDS = {
  contractor_person: "Contractor (an individual or a HUF)",
  contractor_other: "Contractor (a company or a firm)",
  technical: "Technical fees or royalty",
  professional: "Professional fees",
  director: "Director's fees",
  rent_plant: "Rent of plant and machinery",
  rent_building: "Rent of land and building",
  none: "No tax deducted",
  "": "Not decided",
} as const;
export type TdsKindKey = keyof typeof TDS_KINDS;

export const RESIDENCIES = {
  "": "Not known",
  resident: "In India",
  non_resident: "Abroad",
} as const;
export type ResidencyKey = keyof typeof RESIDENCIES;

export const UDYAM_CLASSES = {
  "": "Udyam not known",
  micro: "Micro",
  small: "Small",
  medium: "Medium",
  not_registered: "Not registered",
} as const;
export type UdyamClassKey = keyof typeof UDYAM_CLASSES;

export const FLAG_WORDS = { yes: "Yes", no: "No", "": "Not known" } as const;

export const GST_TREATMENTS = {
  "": "Not given",
  charged_on_the_bill: "Charged on the bill",
  reverse_charge: "Reverse charge",
  no_gst: "No GST",
} as const;
export type GstTreatmentKey = keyof typeof GST_TREATMENTS;

export const PAY_METHODS = {
  bank: "Bank transfer",
  card: "Card",
  upi: "UPI",
  other: "Other",
} as const;
export type PayMethodKey = keyof typeof PAY_METHODS;

export const BILLS_FROM = {
  "": "Not known",
  abroad: "Abroad",
  indian_company: "Its Indian company",
} as const;
export const PAID_BY = {
  "": "Not known",
  card: "Card",
  bank_transfer: "Bank transfer",
  other: "Other",
} as const;
export const FOREIGN_GST = {
  "": "Not known",
  reverse_charge: "Reverse charge",
  charged_on_the_bill: "Charged on the bill",
  not_registered_for_gst: "We are not registered for GST",
} as const;
export const TDS_DECISIONS = { deduct: "Deduct tax", do_not_deduct: "Do not deduct" } as const;
export const DECIDED_ROLES = { CA: "CA", lawyer: "Lawyer" } as const;

export type FormsKey = "none" | "form_only" | "form_and_certificate";
/**
 * The forms for paying a non-resident, by the reading of `foreign-forms` he confirmed: until
 * then the options name no form (the sources disagree on the forms' names).
 */
export function formsWords(reading: number | null): Record<FormsKey, string> {
  if (reading === 0)
    return {
      none: "None",
      form_only: "Form 145 only",
      form_and_certificate: "Form 145 and Form 146",
    };
  if (reading === 1)
    return {
      none: "None",
      form_only: "Form 15CA only",
      form_and_certificate: "Form 15CA and Form 15CB",
    };
  return {
    none: "None",
    form_only: "The form only",
    form_and_certificate: "The form and an accountant's certificate",
  };
}
export const FORMS_UNCONFIRMED =
  "The sources name these forms as 145 and 146, or as 15CA and 15CB. Your CA confirms which.";
export const NO_DECISION =
  "No decision recorded. Your CA decides once for each vendor abroad; record it here with the day.";

export const TAX_TREATMENTS = {
  "": "Not given",
  under_lut: "Under LUT, no IGST",
  igst_paid: "IGST paid",
} as const;
export type TaxTreatmentKey = keyof typeof TAX_TREATMENTS;

export type BillState = "open" | "part_paid" | "paid" | "paid_late" | "cancelled";
export const BILL_STATES: Record<BillState, Labelled> = {
  open: { label: "Open", tone: "attention" },
  part_paid: { label: "Part paid", tone: "attention" },
  paid: { label: "Paid", tone: "live" },
  paid_late: { label: "Paid late", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export const BILL_VIEWS = {
  open: "Open",
  paid: "Paid",
  all: "All",
  cancelled: "Cancelled",
} as const;
export type BillView = keyof typeof BILL_VIEWS;

/** The rate's unit in words, for "₹88.25 a dollar". */
export const CURRENCY_UNITS: Record<string, string> = {
  USD: "a dollar",
  EUR: "a euro",
  GBP: "a pound",
  SGD: "a Singapore dollar",
  AED: "a dirham",
};

/** The edit log's verbs, as Edit history prints them. */
export const EDIT_VERBS: Record<string, string> = {
  added: "Added",
  changed: "Changed",
  approved: "Approved",
  "tax deducted": "Tax deducted",
  "challan recorded": "Challan recorded",
  paid: "Paid",
  "payment taken back": "Payment taken back",
  cancelled: "Cancelled",
  "copy attached": "Copy attached",
  retired: "Retired",
  "decision recorded": "Decision recorded",
  "EDF recorded": "EDF recorded",
  received: "Received",
  "receipt changed": "Receipt changed",
  "receipt taken back": "Receipt taken back",
  "LUT recorded": "LUT recorded",
  "map checked": "Map checked",
};

/** "3 bills", "1 bill". */
export function countOf(count: number, one: string, many = `${one}s`): string {
  return `${count.toLocaleString("en-IN")} ${count === 1 ? one : many}`;
}
