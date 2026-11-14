/**
 * The closing chain's records (ws-notes/company/spec.md §9.2): one closing checklist per
 * investor firm, and the round's own steps. Each step is null until recorded, then keeps
 * what was typed with who and when. Nothing here touches a file.
 */

import type { HolderKind } from "../company-contracts";
import type { Staff } from "../protocol";

export type Done<T> = (T & { at: string; by: Staff }) | null;

export type Money = { amount: number; currency: "INR" | "USD" };

export type Closing = {
  /** The investor firm's id: one closing per firm. */
  closing_id: string;
  investor_id: string;
  firm: string;
  /** One of INSTRUMENTS; the round's or the firm's newest amount's by default. */
  instrument: string;
  class_id: string | null;
  shares: number | null;
  price_per_share: number | null;
  /** Who goes in the register: the firm, a person, or a syndicate or fund that holds as one. */
  holder: { name: string; kind: HolderKind; email: string; address: string };
  pooled: {
    kind: "syndicate" | "fund" | "other";
    backers: { name: string; amount: number; currency: "INR" | "USD" }[];
    fee_note: string;
  } | null;
  documents_sent: Done<{ on: string; what: string }>;
  documents_signed: Done<{ on: string; file_id: string | null }>;
  offer_letter: Done<{ on: string; serial: string; file_id: string | null }>;
  money_received: Done<{
    on: string;
    amount: number;
    currency: "INR" | "USD";
    own_account: boolean;
    reference: string;
    firc_file_id: string | null;
  }>;
  bank_kyc: Done<{ on: string; from_receiving_bank: boolean; file_id: string | null }>;
  valuation: Done<{
    on: string;
    by_name: string;
    kind: "registered_valuer" | "fema" | "both";
    file_id: string | null;
    from_round: boolean;
  }>;
  board_approval: Done<{ on: string; resolution_id: string | null; words: string }>;
  allotment: Done<{ on: string; shares: number; price_per_share: number; class_id: string | null }>;
  register: Done<{ on: string; entry_id: string | null; folio: string; by_hand: boolean }>;
  certificate: Done<{ on: string; number: string; by_hand: boolean }>;
  refund: Done<{
    on: string;
    amount: number;
    currency: "INR" | "USD";
    interest: number | null;
    note: string;
  }>;
  notes: string;
  created_at: string;
  created_by: Staff;
  updated_at: string;
  updated_by: Staff;
};

export type RoundClose = {
  special_resolution: Done<{ on: string; resolution_id: string | null; words: string }>;
  separate_account: Done<{ opened_on: string; bank: string }>;
  valuation: Done<{
    on: string;
    by_name: string;
    kind: "registered_valuer" | "fema" | "both";
    file_id: string | null;
  }>;
  firms_registered: Done<{ on: string }>;
};

export const NO_ROUND: RoundClose = {
  special_resolution: null,
  separate_account: null,
  valuation: null,
  firms_registered: null,
};

export type ClosingEvent = {
  event_id: string;
  closing_id: string;
  verb: string;
  detail: string;
  by: Staff;
  at: string;
};

/** The steps a closing records, as its record keys them. */
export type StepKey =
  | "documents_sent"
  | "documents_signed"
  | "offer_letter"
  | "money_received"
  | "bank_kyc"
  | "valuation"
  | "board_approval"
  | "allotment"
  | "register"
  | "certificate"
  | "refund";

export const STEP_KEYS: readonly StepKey[] = [
  "documents_sent",
  "documents_signed",
  "offer_letter",
  "money_received",
  "bank_kyc",
  "valuation",
  "board_approval",
  "allotment",
  "register",
  "certificate",
  "refund",
];

export type RoundStepKey = keyof RoundClose;
export const ROUND_STEP_KEYS: readonly RoundStepKey[] = [
  "special_resolution",
  "separate_account",
  "valuation",
  "firms_registered",
];
