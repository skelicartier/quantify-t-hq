/**
 * The shapes of Investors (spec §3.4.7): one record per investor firm, grouped by domain
 * from the Mail merge list or lists he chose, with its people, its stage and the next step,
 * and the amounts he records in their own currency. Nothing here touches a file.
 */

import { createHash } from "node:crypto";

import type { Staff } from "../protocol";
import type {
  AmountState,
  Geography,
  INSTRUMENTS,
  IntroStatus,
  InvestorStage,
  LeadOrFollow,
  PassReason,
  Residency,
  StageFocus,
} from "../../../src/lib/data/labels";

export type {
  AmountState,
  Geography,
  IntroStatus,
  InvestorStage,
  LeadOrFollow,
  PassReason,
  Residency,
  StageFocus,
};

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

/** Qualification (raise spec §5.2): what is known of the firm before the pitch. */
export type Profile = {
  /** Cheque range; null when nothing is known. A bound may be null ("from $25,000"). */
  cheque: { min: number | null; max: number | null; currency: Currency } | null;
  stages: StageFocus[];
  /** As typed, trimmed; at most 10 of at most 40 characters, no repeats (any case). */
  sectors: string[];
  geography: Geography[];
  lead: LeadOrFollow | "";
  /** "" when none is known; otherwise what it is (at most 200). */
  conflict: string;
  residency: Residency | "";
  india_ok: "yes" | "no" | "";
};

export type Intro = {
  status: IntroStatus;
  /** The introducer's name as shown (at most 120); kept even when a contact is chosen. */
  introducer: string;
  /** A contact in Contacts (U2), when he chose one there. */
  contact_id: string | null;
  /** The day of the last status he recorded. */
  on: string | null;
};

export const DEFAULT_PROFILE: Profile = {
  cheque: null,
  stages: [],
  sectors: [],
  geography: [],
  lead: "",
  conflict: "",
  residency: "",
  india_ok: "",
};
export const DEFAULT_INTRO: Intro = { status: "none", introducer: "", contact_id: null, on: null };

/** A fresh copy of the defaults, so no two firms ever share an array. */
export const defaultProfile = (): Profile => ({
  ...DEFAULT_PROFILE,
  stages: [],
  sectors: [],
  geography: [],
});
export const defaultIntro = (): Intro => ({ ...DEFAULT_INTRO });

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
  profile: Profile;
  intro: Intro;
  /** "" for no wave; at most 40. */
  wave: string;
  /** A calendar day; it joins Due three days before. */
  offer_deadline: string | null;
  /** "" or an https link (`httpsLinkOf`): the link he sends this firm. HQ keeps only the link. */
  deck_link: string;
  /** Whether anything was recorded beyond what the list and Mail merge said. */
  touched: boolean;
  created_at: string;
  updated_at: string;
};

export type EventKind =
  | "seeded"
  | "written"
  | "stage"
  | "note"
  | "amount"
  | "update"
  | "reply"
  | "person"
  | "profile"
  | "intro"
  | "raise";

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

export type CapBasis = "post_money" | "pre_money";

/** The one round (raise spec §5.2). There is deliberately no target or range field. */
export type Round = {
  round_id: string;
  /** "Pre-seed" unless he names it otherwise; at most 80. */
  name: string;
  instrument: (typeof INSTRUMENTS)[number];
  cap: { amount: number; currency: Currency; basis: CapBasis } | null;
  /** More than 0 and at most 50, at most one decimal; null for none. */
  discount_percent: number | null;
  mfn: boolean;
  minimum_cheque: { amount: number; currency: Currency } | null;
  opened_on: string | null;
  lead: "yes" | "no";
  /** The lead firm, when he names one (only with lead "yes"). */
  lead_investor_id: string | null;
  notes: string;
  updated_at: string;
  updated_by: Staff;
};

/** The newest of the three touches: written to, replied, met. */
export type LastTouch = { kind: "written" | "replied" | "met"; at: string } | null;

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
  wave: string;
  /** Warm when the introduction is "Made"; every other firm is cold. */
  warm: boolean;
  last_touch: LastTouch;
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
