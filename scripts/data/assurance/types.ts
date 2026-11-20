/**
 * Certification, insurance and management reviews (ws-notes/security/spec.md §8.2). On disk
 * under `data/assurance/`. Every name (a certification body, an insurer, a broker, an
 * attendee) is as he typed it. Nothing is deleted: a certificate lapses or is withdrawn, a
 * policy is renewed by another, a review keeps its actions.
 */

import type { Staff } from "../protocol";
import type {
  CertStandard,
  CertStatus,
  InsuranceKind,
  ReviewInputKey,
} from "../../../src/lib/data/labels-assurance";

export type Stamp = {
  created_at: string;
  created_by: Staff;
  updated_at: string;
  updated_by: Staff;
};

export type Surveillance = {
  n: 1 | 2;
  due_on: string | null;
  held_on: string | null;
  outcome: string;
  file_id: string | null;
};

export type Certification = Stamp & {
  cert_id: string;
  standard: CertStandard;
  /** For "other". */
  name: string;
  status: CertStatus;
  /** The certification body or auditor, as typed. */
  body: string;
  /** "NABCB", "UKAS", as typed. */
  accredited_by: string;
  accreditation_checked_on: string | null;
  consultant: string;
  scope: string;
  stage1_on: string | null;
  stage2_on: string | null;
  certificate_number: string;
  issued_on: string | null;
  /** Typed from the certificate; else worked out. */
  expires_on: string | null;
  /** SOC 2. */
  report: { kind: "type1" | "type2"; from: string | null; to: string | null } | null;
  surveillance: Surveillance[];
  /** Files, "Security › Certification". */
  certificate_file_id: string | null;
  notes: string;
};

export type InsurancePolicy = Stamp & {
  insurance_id: string;
  kind: InsuranceKind;
  /** For "other". */
  name: string;
  insurer: string;
  policy_number: string;
  cover_minor: number | null;
  currency: string;
  premium_minor: number | null;
  starts_on: string | null;
  ends_on: string | null;
  broker: string;
  /** Files, "Security › Insurance". */
  certificate_file_id: string | null;
  /** The `insurance_id` that continues it. */
  renewed_by: string | null;
  notes: string;
};

export type ReviewAction = {
  action_id: string;
  what: string;
  owner: string;
  due_on: string | null;
  done_on: string | null;
};

export type ManagementReview = Stamp & {
  review_id: string;
  held_on: string;
  /** As typed. */
  attendees: string;
  /** A note on each of clause 9.3.2's inputs. */
  inputs: Partial<Record<ReviewInputKey, string>>;
  decisions: string;
  actions: ReviewAction[];
  /** Files, "Security › Management reviews". */
  minutes_file_id: string | null;
};

export type Setup = { format: 1; review_months: number | null };

export type AssuranceEvent = {
  event_id: string;
  target: "certification" | "insurance" | "review" | "setup";
  id: string;
  verb: string;
  /** Field names, never values. */
  detail: string;
  by: Staff;
  at: string;
};
