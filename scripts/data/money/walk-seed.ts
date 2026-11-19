/**
 * The invented records Money's tests and walk use (ws-notes/duties/spec.md §5.4, §8.7): the
 * reserved numbers no real vendor holds (PAN `ZZZPZ0000Z`, GSTIN `00ZZZPZ0000Z1Z0`, Udyam
 * `UDYAM-ZZ-00-0000000`), references starting `WALK-`, vendors and customers named "Walk …".
 * Nothing here is anyone's real data.
 */

import type { DutyRuleKey, DutyStored } from "../duties-contracts";

/** The rule book the walk starts from while no real one is here: nothing confirmed. */
export function walkRules(): Partial<Record<DutyRuleKey, DutyStored>> {
  return {};
}

/** The same rule book with the professional-fee limit confirmed at its first reading (₹50,000). */
export function walkRulesConfirmed(on: string): Partial<Record<DutyRuleKey, DutyStored>> {
  return { "tds-professional-year": { reading: 0, confirmed: { name: "Walk CA", on } } };
}

export const WALK_PAN = "ZZZPZ0000Z";
export const WALK_GSTIN = "00ZZZPZ0000Z1Z0";
export const WALK_UDYAM = "UDYAM-ZZ-00-0000000";

export const WALK_LEGAL = {
  name: "Walk Legal LLP",
  legal_name: "Walk Legal LLP",
  residency: "resident",
  country: "India",
  pan: WALK_PAN,
  gstin: WALK_GSTIN,
  udyam_class: "not_registered",
  tds_kind: "professional",
} as const;

/** §5.4's three professional-fee bills, before GST (18 per cent GST on each). */
export const WALK_LEGAL_BILLS = [
  { invoice_number: "WALK-INV-0005", invoice_on: "2026-06-10", taxable: "20000", gst: "3600" },
  { invoice_number: "WALK-INV-0006", invoice_on: "2026-09-05", taxable: "25000", gst: "4500" },
  { invoice_number: "WALK-INV-0007", invoice_on: "2026-11-12", taxable: "10000", gst: "1800" },
] as const;

export const WALK_PRINT = {
  name: "Walk Print Works",
  residency: "resident",
  country: "India",
  udyam_class: "micro",
  udyam_number: WALK_UDYAM,
  msme_agreement: "no",
  tds_kind: "none",
} as const;

export const WALK_CLOUD = {
  name: "Walk Cloud Inc",
  legal_name: "Walk Cloud Inc",
  residency: "non_resident",
  country: "United States",
  tds_kind: "none",
} as const;

export const WALK_EXPORT = {
  customer: "Walk Customer Inc",
  country: "United States",
  invoice_number: "WALK-EXP-0001",
  /** §5.4 has 20 Oct and 30 Nov 2026; 30 Nov is more than a week ahead of the walk days in November, so 20 Oct. */
  invoice_on: "2026-10-20",
  currency: "USD",
  amount: "5000",
  tax_treatment: "under_lut",
  purpose_code: "P0802",
  rail: "Bank transfer to the current account",
} as const;
