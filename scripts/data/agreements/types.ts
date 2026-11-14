/**
 * The shapes of the legal-document register (ws-notes/company/spec.md §7.2): the company's
 * agreements over Files, who they are with, their terms, renewal and notice, stamp duty,
 * the signed copy and the signing record. Nothing here reads People: a person is a typed
 * name.
 */

import type { AgreementView, Flag, PartyKind } from "../company-contracts";
import type { Staff } from "../protocol";

export type { AgreementView, Flag, PartyKind };

export type AgreementType =
  | "founder_ip"
  | "ip_assignment"
  | "appointment"
  | "internship"
  | "contractor"
  | "nda"
  | "msa"
  | "order_form"
  | "dpa"
  | "pilot"
  | "trial"
  | "investment"
  | "side_letter"
  | "vendor"
  | "lease"
  | "other";

export type Party = {
  kind: PartyKind;
  /** The record it points at: a director, an investor firm, a waitlist firm; null for a typed name. */
  ref_id: string | null;
  name: string;
  /** The legal entity, when not the name. */
  entity: string;
  country: string;
};

export type Agreement = {
  agreement_id: string;
  title: string;
  type: AgreementType;
  /** One to five counterparties; the company is the other side. */
  parties: Party[];
  status: AgreementView["status"];
  status_on: string | null;
  effective_on: string | null;
  signed_on: string | null;
  /** `ends_on` typed overrides the end worked out from `months`. */
  term: { months: number | null; ends_on: string | null };
  renewal: {
    auto: boolean;
    months: number | null;
    renews_on: string | null;
    notice_days: number | null;
    notice_given: { on: string; note: string } | null;
  };
  terminate_for_convenience: string;
  governing_law: string;
  forum: string;
  value: { amount: number; currency: "INR" | "USD" } | null;
  signing: "aadhaar_esign" | "dsc" | "wet_ink" | "other" | "";
  stamp: { state: string; amount: number | null; certificate_no: string } | null;
  related_party: boolean;
  personal_data: boolean;
  ip_clause: Flag;
  confidentiality_clause: Flag;
  signed_file_id: string | null;
  audit_trail_file_id: string | null;
  owner: string;
  review_on: string | null;
  notes: string;
  created_at: string;
  created_by: Staff;
  updated_at: string;
  updated_by: Staff;
};

export type AgreementsEvent = {
  event_id: string;
  agreement_id: string;
  verb: string;
  detail: string;
  by: Staff;
  at: string;
};

/** A row of "What is missing". */
export type MustRow = {
  key: string;
  item: string;
  found: string;
  state: "here" | "missing" | "not_needed" | "not_checked";
  why: string;
  /** The source the why rests on, printed on paper; "" where the row is good practice. */
  source_url: string;
  missing: { name: string; href: string }[];
};
