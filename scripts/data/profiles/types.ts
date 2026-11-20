/**
 * A customer's regulatory profile (ws-notes/security/spec.md §9.2): one per waitlist firm, the
 * rules it works under, the duties its contract passes down (from `FLOWDOWNS` or his own
 * words), which of them are in the contract, and the day the contract applies from. Nothing
 * here touches a file.
 */

import type { Flag } from "../company-contracts";
import type { Staff } from "../protocol";
import type { FlowdownKey } from "../security-contracts";

export const SEBI_CATEGORIES = [
  "",
  "mii",
  "qualified",
  "mid",
  "small",
  "self_certification",
  "not_known",
] as const;
export type SebiCategoryKey = (typeof SEBI_CATEGORIES)[number];

export const DUTY_STATES = ["", "in_contract", "not_in_contract"] as const;
export type DutyState = (typeof DUTY_STATES)[number];

export type Duty = {
  duty_id: string;
  /** Null: his own words. */
  key: FlowdownKey | null;
  /** His own, or "" for a flowdown's. */
  words: string;
  state: DutyState;
  /** The agreements register. */
  agreement_id: string | null;
  file_id: string | null;
  note: string;
  withdrawn: { on: string; why: string } | null;
};

export type Profile = {
  profile_id: string;
  entry_id: string;
  firm: string;
  regimes: {
    sebi: { category: SebiCategoryKey } | null;
    dora: { critical_function: Flag } | null;
    uk: { note: string } | null;
    other: string;
  };
  applies_from: string | null;
  duties: Duty[];
  notes: string;
  created_at: string;
  created_by: Staff;
  updated_at: string;
  updated_by: Staff;
};

export type ProfileEvent = {
  event_id: string;
  profile_id: string;
  verb: string;
  detail: string;
  by: Staff;
  at: string;
};
