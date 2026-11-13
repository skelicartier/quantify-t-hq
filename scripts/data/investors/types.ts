/**
 * The shapes of Investors (spec §3.4.7): one record per investor firm, grouped by domain
 * from the Mail merge list or lists he chose, with its people, its stage and the next step,
 * and the amounts he records in their own currency. Nothing here touches a file.
 */

import { createHash } from "node:crypto";

import type { Staff } from "../protocol";
import type { AmountState, InvestorStage, PassReason } from "../../../src/lib/data/labels";

export type { AmountState, InvestorStage, PassReason };

export type Currency = "USD" | "INR";

export type Amount = {
  amount_id: string;
  state: AmountState;
  amount: number;
  currency: Currency;
  instrument: string;
  on: string;
  by: Staff;
  at: string;
};

export type Person = {
  email: string;
  name: string;
  title: string;
  /** "list": on a chosen Mail merge list; "added": named in a reply, or added by hand. */
  from: "list" | "added";
};

export type Investor = {
  investor_id: string;
  /** The domain, or `mail:<address>` for someone on free mail (an angel is a firm of one). */
  firm_key: string;
  firm: string;
  domain: string;
  /** The chosen lists this firm's people are on now; empty once it is off them. */
  list_ids: string[];
  /** The list's own columns, by their heading, first non-empty value across the people. */
  list_values: Record<string, string>;
  people: Person[];
  stage: InvestorStage;
  stage_since: string;
  next_step: string;
  next_step_on: string | null;
  set_aside_until: string | null;
  passed_reason: PassReason | "";
  owner: string;
  amounts: Amount[];
  /** Whether anything was recorded beyond what the list and Mail merge said. */
  touched: boolean;
  created_at: string;
  updated_at: string;
};

export type EventKind =
  "seeded" | "written" | "stage" | "note" | "amount" | "update" | "reply" | "person";

export type InvestorEvent = {
  event_id: string;
  investor_id: string;
  kind: EventKind;
  /** For a stage move: from and to. */
  from: string;
  to: string;
  title: string;
  detail: string;
  by: Staff;
  at: string;
};

export type Setup = { list_ids: string[]; set_at: string | null; set_by: Staff | null };

/** What the list page shows of one firm. */
export type InvestorRow = {
  investor_id: string;
  firm: string;
  domain: string;
  free_mail: boolean;
  contact: { email: string; name: string; title: string } | null;
  people: number;
  stage: InvestorStage;
  stage_since: string;
  last_written_at: string | null;
  last_mailing: string;
  next_step: string;
  next_step_on: string | null;
  set_aside_until: string | null;
  amount: { state: AmountState; amount: number; currency: Currency; instrument: string } | null;
  on_list: boolean;
  replied: boolean;
};

/** Who did a change Mail merge made: a send, not a person. */
export const MAIL_MERGE: Staff = { staff_id: "mail-merge", name: "Mail merge" };
export const DATA_STAFF: Staff = { staff_id: "system", name: "Data" };

/** `sha256("investor:" + firm key)`, 32 hex: the same firm always has the same id. */
export function investorIdOf(firmKey: string): string {
  return createHash("sha256").update(`investor:${firmKey}`).digest("hex").slice(0, 32);
}

export const INVESTOR_ID = /^[0-9a-f]{32}$/;

/** The stages a next step and its day are not asked for. */
export const NO_NEXT_STEP: ReadonlySet<InvestorStage> = new Set([
  "money_in",
  "passed",
  "do_not_pitch",
]);

/** The stages a reply never moves a firm out of on its own. */
export const KEPT_BY_REPLIES: ReadonlySet<InvestorStage> = new Set([
  "soft",
  "signed",
  "money_in",
  "do_not_pitch",
]);

/** The stages a "yes", a question or a name moves a firm forward from, to Replied. */
export const BEFORE_REPLIED: ReadonlySet<InvestorStage> = new Set([
  "not_written",
  "written",
  "set_aside",
  "passed",
]);
