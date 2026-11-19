/**
 * The month's close (ws-notes/duties/spec.md §9.7, §9.8): one record a month with the seven
 * things the CA needs, when the pack was sent and to whom, the CA's acknowledgement, the lock,
 * and the MIS frozen at the lock. Money is whole minor units; nothing adds across currencies.
 * The MIS's people figures are kept apart, in the Owner's file, and given only to the Owner.
 */

import type { CloseItemKey } from "../../../src/lib/data/labels-statements";
import type { Staff } from "../protocol";

export type { CloseItemKey };

export type CloseItem = {
  /** "not_registered" only for gst_returns. */
  state: "open" | "ready" | "none_this_month" | "not_registered";
  note: string;
  /** Files he attaches by hand (sales invoices from the books, GST returns), in Files. */
  file_ids: string[];
  set_at: string | null;
  set_by: Staff | null;
};

export type Close = {
  period: string;
  items: Record<CloseItemKey, CloseItem>;
  commentary: string;
  sent: { on: string; to_name: string; contact_id: string | null; how: string } | null;
  acknowledged: { on: string; by_name: string; note: string } | null;
  locked: { at: string; by: Staff } | null;
  history: {
    verb: "sent" | "acknowledged" | "locked" | "reopened";
    at: string;
    by: Staff;
    why: string;
  }[];
};

export type MisHead = { name: string; ledger: string; minor: number | null; people: boolean };

export type MisSnapshot = {
  period: string;
  label: string;
  n: number;
  frozen_at: string | null;
  frozen_by: Staff | null;
  /** 1. Revenue: money collected from customers (credit lines of income categories), and invoices raised. */
  revenue: {
    collected: Record<string, number>;
    export_invoices: { count: number; by_currency: Record<string, number> };
  };
  /** 2. Expenses by head: debit lines by category, per currency. People heads are folded into one with no figure. */
  expenses: {
    currency: string;
    heads: MisHead[];
    unsorted_minor: number;
    total_minor: number;
  }[];
  /** 3. Burn and runway, as §5.5, on the month's last day. */
  burn: {
    currency: string;
    as_of: string;
    cash_minor: number;
    gross_minor: number;
    collected_minor: number;
    net_minor: number;
    avg_net_minor: number | null;
    months: number;
    runway_months: number | null;
    zero_on: string | null;
  }[];
  /** 4. Cash flow: opening, in by kind, out, between own accounts, closing. */
  cash_flow: {
    currency: string;
    opening_minor: number;
    in: { customers: number; funding: number; other: number };
    out_minor: number;
    /** Transfers between own accounts, in less out: zero when both sides are here. */
    between_minor: number;
    closing_minor: number;
  }[];
  /** 5. The month's counts, as the Numbers page counts them. */
  numbers: {
    yeses: number;
    firms_joined: number;
    named_buyers: number;
    calls_booked: number;
    calls_held: number;
    pilots_signed: number;
  } | null;
  /** 6. Against last month, per head and currency: this less last; null when last month has no figures. */
  against_last: {
    currency: string;
    heads: { name: string; change_minor: number | null; words: string }[];
  }[];
  /** 7. People cost: counts here; the figures are in the Owner's file. */
  people: { headcount: { employees: number; interns: number; contractors: number } | null };
  /** 8. What is owed and overdue on the freeze day, by kind, and how many rules are unconfirmed. */
  compliance: {
    overdue: { kind: string; count: number }[];
    due_in_30: { kind: string; count: number }[];
    rules_unconfirmed: number | null;
  };
  commentary: string;
};

/** `close/owner/<period>.json`: given only with `owner=1`. */
export type MisOwnerPart = {
  stipends: Record<string, number>;
  payments: number;
  people_heads: { currency: string; name: string; minor: number }[];
};
