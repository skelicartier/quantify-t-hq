/**
 * The seams of the raise batch (ws-notes/raise/spec.md §3): what one Data module offers
 * another through `core.provide` / `core.need`, as types; the names they are provided
 * under; and two small pure helpers more than one unit uses. Every unit's copy holds this
 * file byte for byte. Nothing here touches a file, a socket or the clock.
 */

import type { AmountState, InvestorStage } from "../../src/lib/data/labels";

// ------------------------------------------------------------------ names

/** The services this batch adds, by the name each is provided under. */
export const RAISE_SERVICES = {
  /** U1, in the investors module: the funnel, the update's recipients, firm names. */
  investorsRaise: "investors-raise",
  /** U2: the contacts directory, for the introducer picker. */
  contacts: "contacts",
  /** U4, in the files module: what each pack was shared with. */
  packs: "packs",
  /** U4's lines in the replies module: every reply, for the numbers. */
  repliesFeed: "replies-feed",
  /** U4's lines in the waitlist module: the firms and their stage moves, for the numbers. */
  waitlistFeed: "waitlist-feed",
} as const;

/** Each module with dated work provides `agenda:<name>`; the calendar (U3) reads them all. */
export const AGENDA_SOURCES = [
  "dates",
  "investors",
  "waitlist",
  "replies",
  "files",
  "notes",
] as const;
export type AgendaSourceName = (typeof AGENDA_SOURCES)[number];
export const agendaService = (name: AgendaSourceName): string => `agenda:${name}`;

/** Each searchable module provides `search:<name>`; the search (U3) reads them all. */
export const SEARCH_SOURCES = ["leads", "investors", "files", "notes", "contacts"] as const;
export type SearchSourceName = (typeof SEARCH_SOURCES)[number];
export const searchService = (name: SearchSourceName): string => `search:${name}`;

// ------------------------------------------------------------------ the calendar's agenda

export type AgendaKind =
  "key_date" | "investor" | "offer_deadline" | "waitlist" | "follow_up" | "file_review" | "action";

export type AgendaItem = {
  /** Stable from one read to the next: "<kind>:<record id>", plus ":<part>" when one record gives two. */
  key: string;
  kind: AgendaKind;
  /** What the event says in full: it may name a person or a firm. */
  title: string;
  /** The same with no name in it ("Investor next step"), for a calendar set to kinds only. */
  plain: string;
  /** One line under the title (the firm, the stage, the kind); left out for kinds only. */
  sub: string;
  /** YYYY-MM-DD, a calendar date, never shifted into a zone. */
  on: string;
  /** Whole days before `on` to be reminded (0: on the day); empty for none. */
  remind_days: readonly number[];
  /** The record's page: a /data/… path. */
  href: string;
};

/** Open items only (never done, dropped, passed or taken back), overdue ones included. */
export type AgendaSource = { agenda(today: string): AgendaItem[] };

// ------------------------------------------------------------------ search

export type DataSearchKind = "lead" | "investor" | "file" | "note" | "faq" | "decision" | "contact";

export type DataSearchHit = {
  kind: DataSearchKind;
  id: string;
  title: string;
  /** Who or where: "Partner · Walk Fund 281", "10 Fundraising and investors". */
  subtitle: string;
  /** A short stretch of text around the words, or "". */
  snippet: string;
  /** The record's page: a /data/… path. */
  href: string;
};

/**
 * Every word in `terms` must match somewhere in the record (Mail merge's find). Each group
 * holds at most `limit` hits, best first, and the exact count of every match.
 */
export type SearchSource = {
  search(input: {
    query: string;
    terms: readonly string[];
    kind: DataSearchKind | null;
    limit: number;
  }): { kind: DataSearchKind; count: number; hits: DataSearchHit[] }[];
};

// ------------------------------------------------------------------ the raise (U1 gives)

export const FORWARD_STAGES = [
  "written",
  "replied",
  "meeting",
  "met",
  "diligence",
  "soft",
  "signed",
  "money_in",
] as const satisfies readonly InvestorStage[];
export type ForwardStage = (typeof FORWARD_STAGES)[number];

export type FunnelStage = {
  stage: ForwardStage;
  /** Firms at this stage now. */
  now: number;
  /** Firms that ever reached this stage or a later one. */
  reached: number;
  /** What `reached` is out of: the stage before's `reached`; for Written to, every firm. */
  of: number;
};

export type FunnelSplit = {
  /** The wave's label ("" for none), or "warm" / "cold". */
  key: string;
  /** "Wave 1", "No wave", "Introduced", "Written to directly". */
  label: string;
  firms: number;
  written: number;
  replied: number;
  meeting: number;
  met: number;
  soft_or_later: number;
};

export type FunnelSummary = {
  today: string;
  /** This week's Monday. */
  week_from: string;
  firms: number;
  not_written: number;
  first_send_on: string | null;
  days_since_first_send: number | null;
  first_meetings_this_week: number;
  /** One local day per firm that has had a first meeting, oldest first. */
  first_meeting_days: string[];
  stages: FunnelStage[];
  exits: { stage: "set_aside" | "passed" | "do_not_pitch"; now: number }[];
  /** Currency → state → the sum of each firm's newest amount in that state, and how many firms. */
  money: Record<string, Partial<Record<AmountState, { amount: number; firms: number }>>>;
  passed: number;
  pass_reasons: { reason: string; firms: number }[];
  stale_days: number;
  time_in_stage: { stage: ForwardStage; firms: number; stale: number; longest_days: number }[];
  stale: {
    investor_id: string;
    firm: string;
    stage: ForwardStage;
    days: number;
    next_step: string;
    next_step_on: string | null;
  }[];
  by_wave: FunnelSplit[];
  by_intro: FunnelSplit[];
};

export type UpdateRecipientFirm = {
  investor_id: string;
  firm: string;
  stage: InvestorStage;
  /** The people who replied (not taken back, not out of office); else the firm's contact. */
  people: { email: string; name: string; replied: boolean }[];
};

export type InvestorsRaise = {
  funnel(): FunnelSummary;
  firmOptions(): { investor_id: string; firm: string; stage: InvestorStage }[];
  recipients(stages: readonly InvestorStage[]): UpdateRecipientFirm[];
  /** The firm's name, or null when there is no such firm. */
  name(investorId: string): string | null;
};

// ------------------------------------------------------------------ smaller lookups

/** U2 gives: the introducers for the picker on an investor firm. */
export type ContactsLookup = {
  introducers(): { contact_id: string; name: string; firm: string }[];
  get(contactId: string): { contact_id: string; name: string; firm: string; role: string } | null;
};

/** U4 gives: what was shared with a firm, newest first. */
export type PacksLookup = {
  sharedWith(investorId: string): {
    pack_id: string;
    name: string;
    version: number;
    shared_on: string;
    how: string;
    files: number;
  }[];
};

/** U4's lines in the replies module give this. */
export type RepliesFeed = {
  all(): {
    reply_id: string;
    email: string;
    outcome: string;
    received_at: string;
    taken_back: boolean;
  }[];
};

/** U4's lines in the waitlist module give this. */
export type WaitlistFeed = {
  entries(): {
    entry_id: string;
    firm: string;
    domain: string;
    firm_type: string;
    free_mail: boolean;
    joined_on: string;
    stage: string;
  }[];
  moves(): { entry_id: string; to: string; at: string }[];
};

// ------------------------------------------------------------------ helpers

/** A link he pastes (a deck link, a booking link): https only, no spaces, at most 500 characters. */
export function httpsLinkOf(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text.length > 500 || /\s/.test(text)) return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !url.hostname.includes(".")) return null;
  if (url.username || url.password) return null;
  return url.href;
}

/** The Monday of the week a calendar day is in: weeks run Monday to Sunday. */
export function mondayOf(day: string): string {
  const [year, month, date] = day.split("-").map(Number) as [number, number, number];
  const at = new Date(Date.UTC(year, month - 1, date));
  at.setUTCDate(at.getUTCDate() - ((at.getUTCDay() + 6) % 7));
  return at.toISOString().slice(0, 10);
}
