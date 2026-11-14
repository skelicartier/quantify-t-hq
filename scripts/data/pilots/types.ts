/**
 * A pilot with a waitlist firm (ws-notes/company/spec.md §9.2): what success means, written
 * down before it starts; the three people who own it at their end; the term, the price and
 * what it converts to; the go/no-go day and the decision; and a check-in every week.
 * Nothing here touches a file.
 */

import type { Staff } from "../protocol";

export type Criterion = {
  criterion_id: string;
  what: string;
  target: string;
  result: string;
  met: "yes" | "no" | "";
};

export type Pilot = {
  pilot_id: string;
  entry_id: string;
  /** The firm's name when the pilot was written. */
  firm: string;
  state: "planned" | "running" | "decided";
  starts_on: string;
  ends_on: string;
  /** One to four, written before it starts. */
  criteria: Criterion[];
  /** Named people at the firm. */
  owners: { sponsor: string; technical: string; user: string };
  /** null: free (a pilot for a reference). */
  price: { amount: number; currency: "INR" | "USD"; note: string } | null;
  conversion: {
    on: string | null;
    amount: number | null;
    currency: "INR" | "USD";
    per: "month" | "year";
  } | null;
  go_no_go_on: string | null;
  decision: { outcome: "go" | "no_go" | "extend"; on: string; note: string; by: Staff } | null;
  check_ins: { check_in_id: string; on: string; note: string; at: string; by: Staff }[];
  created_at: string;
  created_by: Staff;
  updated_at: string;
  updated_by: Staff;
};

export type PilotEvent = {
  event_id: string;
  pilot_id: string;
  verb: string;
  detail: string;
  by: Staff;
  at: string;
};
