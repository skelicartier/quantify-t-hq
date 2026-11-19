/**
 * The cash view's shapes (ws-notes/duties/spec.md §7.6): what he types for it, kept in
 * `cash/setup.json`. The weeks, the scenarios and the tiles are worked out on every read and
 * never stored. Money is whole minor units (paise, cents).
 */

import type { Staff } from "../protocol";

export type CashEvent = {
  event_id: string;
  kind: "money_in" | "monthly_cost";
  name: string;
  /** "2027-01": the month it lands or starts. */
  period: string;
  amount_minor: number;
  /** "The raise" for money in, "A hire" for a monthly cost. */
  flagged: boolean;
};

export type CashLine = {
  line_id: string;
  kind: "expected_in" | "other_out";
  on: string;
  currency: string;
  amount_minor: number;
  name: string;
  sure: boolean;
  /** Whole number 0 to 100: what a not-sure line is counted at. 20 by default. */
  counted_at: number;
  withdrawn: boolean;
};

export type CashSetup = {
  /** Used only while no statement gives a figure for the currency. */
  opening: Partial<Record<string, { amount_minor: number; as_of: string }>>;
  /** Rupees. Null: the statements' average. */
  burn_minor: number | null;
  collections_minor: number;
  /** Per cent a month, at most one decimal, 0 to 100. */
  growth: number;
  hire_delay_months: number;
  events: CashEvent[];
  lines: CashLine[];
  /** This financial year, rupees, typed. */
  other_sales_minor: number;
  caro: { amount_minor: number; as_of: string } | null;
  updated_at: string | null;
  updated_by: Staff | null;
};

export type CashFile = { format: 1; setup: CashSetup };

export type WeekView = { n: number; from: string; to: string; label: string };

export type CashRowKey = "bills" | "stipends" | "expected_in" | "other_out";

export type CashItem = {
  key: string;
  week: number;
  on: string;
  name: string;
  minor: number;
  counted_minor: number;
  href: string | null;
};

export type CashTable = {
  currency: string;
  opening: { minor: number; as_of: string; source: "statements" | "typed" } | null;
  rows: { key: CashRowKey; by_week: number[] }[];
  /** One per week; [] when `opening` is null. */
  closing: number[];
  items: CashItem[];
};
