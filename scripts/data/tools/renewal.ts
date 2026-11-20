/**
 * A tool's days (ws-notes/security/spec.md §5.2), all pure: the next renewal and the last day
 * to cancel before it, whether that gives a Due row and from when, the yearly look, the
 * seats sentence, and an account's close-by day once its person's last day is set.
 */

import { addMonths } from "../company-contracts";
import { addDays, localDay } from "../days";
import {
  cancelByOf,
  closeByOf,
  inDue,
  nextOnOrAfter,
  type KeyDateCover,
} from "../security-contracts";
import { dayWords } from "../../../src/lib/data/labels-company";
import { countWords, PRACTICES } from "../../../src/lib/data/labels-controls";
import { AHEAD } from "./limits";
import type { Account, Tool } from "./types";

export type Renewal = { next: string; cancel_by: string };

/** The next renewal on or after today and its cancel-by day; null without a monthly or yearly day. */
export function renewalOf(
  tool: Pick<Tool, "billing" | "renews_on" | "notice_days">,
  today: string,
): Renewal | null {
  if (!tool.renews_on || (tool.billing !== "monthly" && tool.billing !== "yearly")) return null;
  const next = nextOnOrAfter(tool.renews_on, tool.billing === "monthly" ? 1 : 12, today);
  return { next, cancel_by: cancelByOf(next, tool.notice_days) };
}

export type RenewalDue = Renewal & {
  /** "Renew or cancel" for a yearly tool, "Cancel" for a monthly one that ends or does not renew. */
  verb: "renew_or_cancel" | "cancel";
  /** The first day it is in Due. */
  from: string;
};

/**
 * Which tools give a renewal row (§5.2): a yearly one from 30 days before its cancel-by day;
 * a monthly one only when it does not renew by itself or is marked Ending, from 7 days
 * before; anything else (monthly and renewing, once, free, not given, retired) none.
 */
export function renewalDue(
  tool: Pick<Tool, "billing" | "renews_on" | "notice_days" | "auto_renews" | "status" | "retired">,
  today: string,
): RenewalDue | null {
  if (tool.retired || tool.status === "retired") return null;
  const renewal = renewalOf(tool, today);
  if (!renewal) return null;
  if (tool.billing === "yearly")
    return {
      ...renewal,
      verb: "renew_or_cancel",
      from: addDays(renewal.cancel_by, -AHEAD.yearly),
    };
  if (tool.auto_renews === "no" || tool.status === "ending")
    return { ...renewal, verb: "cancel", from: addDays(renewal.cancel_by, -AHEAD.monthly) };
  return null;
}

/** Whether the renewal row is in Due today. */
export function renewalInDue(due: RenewalDue, today: string): boolean {
  return inDue(due.cancel_by, today, due.verb === "renew_or_cancel" ? AHEAD.yearly : AHEAD.monthly);
}

/** "Renew or cancel Walk Mail by 13 Feb 2027" · "Cancel Walk Code by 28 Feb 2027". */
export function renewalTitle(name: string, due: RenewalDue): string {
  return `${due.verb === "renew_or_cancel" ? "Renew or cancel" : "Cancel"} ${name} by ${dayWords(due.cancel_by)}`;
}

/** The day a tool counts as last looked at: its look, or the day it was added (adding it is the look). */
export function lookedOn(tool: Pick<Tool, "reviewed" | "created_at">): string {
  return tool.reviewed?.on ?? localDay(tool.created_at);
}

/** The next look: `addMonths(looked on, his months ?? 12)`. */
export function nextReviewOf(
  tool: Pick<Tool, "reviewed" | "created_at">,
  months: number | null,
): string {
  return addMonths(lookedOn(tool), months ?? PRACTICES.tool_review.amount);
}

/** In Due from 30 days before the next look. */
export function reviewInDue(nextReview: string, today: string): boolean {
  return inDue(nextReview, today, AHEAD.review);
}

/** The look is owed: the next look is today or past. */
export function reviewOwed(nextReview: string, today: string): boolean {
  return nextReview <= today;
}

/** Open accounts of every kind against the seats: "4 accounts on 5 seats", "4 accounts". */
export function accountsLine(open: number, seats: number | null): string {
  const accounts = countWords(open, "account");
  return seats === null ? accounts : `${accounts} on ${countWords(seats, "seat")}`;
}

/** Whether an account counts as critical: its own setting, or else its tool's. */
export function criticalOf(
  account: Pick<Account, "critical">,
  tool: Pick<Tool, "critical">,
): boolean {
  return account.critical ?? tool.critical;
}

export type CloseBy = { on: string; words: string; overdue: boolean };

/**
 * An account's close-by once its person's last day is set (Owner only):
 * `closeByOf(last day, critical)`. Open: "Close by 28 Nov 2026", or "Overdue since 28 Nov
 * 2026" once past it; closed: "Closed 27 Nov 2026".
 */
export function closeByWords(
  account: Pick<Account, "closed_on">,
  lastDay: string | null,
  critical: boolean,
  today: string,
): CloseBy | null {
  if (!lastDay) return null;
  const on = closeByOf(lastDay, critical);
  if (account.closed_on)
    return { on, words: `Closed ${dayWords(account.closed_on)}`, overdue: false };
  if (on < today) return { on, words: `Overdue since ${dayWords(on)}`, overdue: true };
  return { on, words: `Close by ${dayWords(on)}`, overdue: false };
}

/** The covers of tools not retired with a renewal day typed. */
export function coversOf(
  tools: readonly Pick<Tool, "key_date" | "renews_on" | "retired">[],
): KeyDateCover[] {
  const covers = new Set<KeyDateCover>();
  for (const tool of tools)
    if (!tool.retired && tool.renews_on && tool.key_date) covers.add(tool.key_date);
  return [...covers].sort();
}
