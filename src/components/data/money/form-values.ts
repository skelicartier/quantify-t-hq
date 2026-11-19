import "server-only";

import { NEW_VENDOR } from "@/components/data/money/bill-fields";
import { NOT_A_DAY, isState, typedDay } from "@/components/data/meetings/form-values";
import { fieldValue } from "@/lib/auth/forms";
import type { BillInput, ExportInput, VendorInput } from "@/lib/data/api/money";
import type { ActionState } from "@/lib/forms/action-state";

/**
 * What Money's forms read from a submitted form. Amounts are passed on **as typed**
 * ("1,180.50"): the service reads them into paise and says what is wrong in its own
 * sentence, so the portal never does arithmetic on money. Not a `"use server"` module.
 */

const amount = (formData: FormData, name: string) => fieldValue(formData, name, 24).trim();

/** The days of a form, each "" when blank; a refusal when one is not a day. */
export function daysOf(
  formData: FormData,
  names: readonly string[],
): Record<string, string> | ActionState {
  const days: Record<string, string> = {};
  for (const name of names) {
    const day = typedDay(formData, name);
    if (day === null) return NOT_A_DAY;
    days[name] = day;
  }
  return days;
}

const isDays = (value: Record<string, string> | ActionState): value is ActionState =>
  isState(value);

/** The bill's fields; `new_vendor` is the name typed when "Add a vendor" was chosen. */
export function billInputOf(
  formData: FormData,
): { input: BillInput; newVendor: string } | ActionState {
  const days = daysOf(formData, ["invoice_on", "accepted_on", "pay_by"]);
  if (isDays(days)) return days;
  const vendor = fieldValue(formData, "vendor_id", 64);
  return {
    input: {
      vendor_id: vendor === NEW_VENDOR ? "" : vendor,
      invoice_number: fieldValue(formData, "invoice_number", 60),
      invoice_on: days.invoice_on ?? "",
      accepted_on: days.accepted_on ?? "",
      description: fieldValue(formData, "description", 300),
      currency: fieldValue(formData, "currency", 3) || "INR",
      taxable: amount(formData, "taxable"),
      gst: amount(formData, "gst"),
      total: amount(formData, "total"),
      gst_treatment: fieldValue(formData, "gst_treatment", 30),
      category_id: fieldValue(formData, "category_id", 64),
      tds_kind: fieldValue(formData, "tds_kind", 30),
      pay_by: days.pay_by ?? "",
    },
    newVendor: vendor === NEW_VENDOR ? fieldValue(formData, "new_vendor", 200).trim() : "",
  };
}

export function vendorInputOf(formData: FormData): VendorInput | ActionState {
  const days = daysOf(formData, ["udyam_checked_on"]);
  if (isDays(days)) return days;
  return {
    name: fieldValue(formData, "name", 200),
    legal_name: fieldValue(formData, "legal_name", 200),
    residency: fieldValue(formData, "residency", 20),
    country: fieldValue(formData, "country", 60),
    pan: fieldValue(formData, "pan", 10).trim(),
    gstin: fieldValue(formData, "gstin", 15).trim(),
    udyam_class: fieldValue(formData, "udyam_class", 20),
    udyam_number: fieldValue(formData, "udyam_number", 25).trim(),
    udyam_checked_on: days.udyam_checked_on ?? "",
    msme_agreement: fieldValue(formData, "msme_agreement", 3),
    msme_days: fieldValue(formData, "msme_days", 4).trim(),
    tds_kind: fieldValue(formData, "tds_kind", 30),
    default_category_id: fieldValue(formData, "default_category_id", 64),
    notes: fieldValue(formData, "notes", 4_000),
  };
}

export function exportInputOf(formData: FormData): ExportInput | ActionState {
  const days = daysOf(formData, ["invoice_on"]);
  if (isDays(days)) return days;
  return {
    customer: fieldValue(formData, "customer", 200),
    country: fieldValue(formData, "country", 60),
    invoice_number: fieldValue(formData, "invoice_number", 60),
    invoice_on: days.invoice_on ?? "",
    currency: fieldValue(formData, "currency", 3) || "USD",
    amount: amount(formData, "amount"),
    tax_treatment: fieldValue(formData, "tax_treatment", 20),
    purpose_code: fieldValue(formData, "purpose_code", 5).trim(),
    rail: fieldValue(formData, "rail", 120),
    notes: fieldValue(formData, "notes", 4_000),
  };
}

export { amount as amountTyped };
