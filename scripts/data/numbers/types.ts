/**
 * The numbers module's records (raise spec §8.3): the cash and burn he types, the buyer
 * firm types he chose, and one investor update per month. The update keeps the HQ
 * service's investor-update field names (`period`, `title`, `snapshot`, `snapshot_at`,
 * `highlights`, `lowlights`, `asks`, `status`) so it can move there later.
 */

import type { CURRENCIES, NumbersRow, UpdateStatus } from "../../../src/lib/data/labels";
import type { Staff } from "../protocol";

export type Currency = (typeof CURRENCIES)[number];

export type MoneyEntry = {
  entry_id: string;
  currency: Currency;
  as_of: string;
  cash: number;
  burn_per_month: number;
  note: string;
  recorded_at: string;
  recorded_by: Staff;
  /** Typed over a figure the statements give, with the reason in `note` (duties spec §9.6). */
  override?: true;
};

export type NumbersSetup = {
  buyer_types: string[];
  /** The Key date "Send the monthly investor update", once added. */
  update_date_id: string | null;
  updated_at: string | null;
  updated_by: Staff | null;
};

/** What one month's update says, frozen when he presses "Freeze the numbers". */
export type UpdateNumbers = {
  /** "2026-11" */
  period: string;
  /** "November 2026" */
  label: string;
  yeses: number;
  firms_joined: number;
  named_buyers: number;
  calls_booked: number;
  calls_held: number;
  pilots_signed: number;
  calls_held_no_pilot: number;
  raise: {
    soft: number;
    signed: number;
    money_in: number;
    money_in_amounts: Record<string, number>;
  } | null;
  cash: {
    currency: Currency;
    cash: number;
    burn_per_month: number;
    as_of: string;
    runway_months: number;
    /** Where the figure came from; absent on an update made before the statements (duties spec §9.6). */
    source?: "statements" | "typed" | "mis";
    /** The last whole month's money out, in whole units, rounded up. */
    gross_burn?: number;
    /** The day the cash runs out at this rate. */
    zero_on?: string | null;
    /** How many whole months the burn is averaged over. */
    months?: number;
  }[];
  counted_on: string;
};

export type HandedOver = {
  at: string;
  by: Staff;
  list_id: string;
  list_name: string;
  people: number;
  left_out: { email: string; why: string }[];
};

export type InvestorUpdate = {
  update_id: string;
  period: string;
  /** "Quantify Terminal: November 2026 update" */
  title: string;
  opening: string;
  /** One per line, at most 3. */
  asks: string;
  /** One per line, at most 3. */
  highlights: string;
  /** One per line, at most 3. */
  lowlights: string;
  thanks: string;
  sign_off: string;
  /** null: the numbers are live. */
  snapshot: UpdateNumbers | null;
  snapshot_at: string | null;
  status: UpdateStatus;
  handed_over: HandedOver | null;
  created_at: string;
  created_by: Staff;
  updated_at: string;
  updated_by: Staff;
};

/** One period of the six-week or twelve-month view. */
export type Period = {
  /** The week's Monday ("2026-11-09") or the month ("2026-11"). */
  key: string;
  /** "Week of 5 Oct", "This week (to 13 Nov)", "Dec 2025", "Nov 2026 (to 13 Nov)". */
  label: string;
  from: string;
  to: string;
  /** This week or this month, counted to today. */
  partial: boolean;
};

/** Each row's counts, one per period, oldest first. */
export type RowCounts = Partial<Record<NumbersRow, number[]>>;

/** What the numbers module gives its own unit's MIS: one month's counts (`numbers-month`). */
export type NumbersMonth = { month(period: string): UpdateNumbers };
export const NUMBERS_MONTH = "numbers-month";
export const CLOSE_MIS = "close-mis";
