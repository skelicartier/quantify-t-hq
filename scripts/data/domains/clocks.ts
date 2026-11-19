/**
 * When each thing enters Due and the calendar, and the checks on its dates
 * (ws-notes/duties/spec.md §5.2), pure. A domain from 60 days before its expiry (7 with
 * auto-renew on); a website certificate from 30 (7); a signing certificate from its own lead
 * days; `security.txt` from 30. A certificate's day is its `not_after` read in IST. The
 * life checks compare a certificate's days with the newest rule in force on its issue day.
 */

import { addMonths } from "../company-contracts";
import { addDays, daysBetween } from "../days";
import { dutyRuleOf, type DutyRuleKey, type DutyRuleState } from "../duties-contracts";
import { dayWords } from "../../../src/lib/data/labels-company";
import { istParts } from "../../../src/lib/data/labels-duties";
import type { Domain, Expiry, Host, SecurityTxt, SigningCertificate } from "./types";

export type Window = { ahead: number; remind: number[] };

export const domainWindow = (domain: Pick<Domain, "auto_renew">): Window =>
  domain.auto_renew === "yes" ? { ahead: 7, remind: [7] } : { ahead: 60, remind: [60, 30, 7] };

export const hostWindow = (host: Pick<Host, "auto_renew">): Window =>
  host.auto_renew === "yes" ? { ahead: 7, remind: [7] } : { ahead: 30, remind: [30, 14, 7] };

/** Its lead days into Due; in the calendar the lead (at most 60), 14 and 7 days before. */
export function signingWindow(cert: Pick<SigningCertificate, "lead_days">): Window {
  const lead = Math.min(60, cert.lead_days);
  return {
    ahead: cert.lead_days,
    remind: [...new Set([lead, 14, 7])].sort((a, b) => b - a),
  };
}

export const securityTxtWindow = (): Window => ({ ahead: 30, remind: [30, 7] });

/** The first day it shows in Due. */
export const dueFrom = (on: string, window: Window): string => addDays(on, -window.ahead);

export function expiryOf(
  on: string | null,
  source: Expiry["source"],
  today: string,
  window: Window,
): Expiry {
  if (!on) return { on: null, source, in_days: null, state: "unknown" };
  const inDays = daysBetween(today, on);
  return {
    on,
    source,
    in_days: inDays,
    state: on < today ? "overdue" : today >= dueFrom(on, window) ? "soon" : "ok",
  };
}

/** A host's expiry: the last handshake's `not_after` in IST, else the day he typed. */
export function hostExpiryDay(host: Host): { on: string | null; source: Expiry["source"] } {
  if (host.probe?.ok && host.probe.not_after)
    return { on: istParts(host.probe.not_after).day, source: "handshake" };
  return { on: host.typed_not_after, source: "typed" };
}

/** The website certificate rules, newest first. */
export const TLS_RULES: readonly DutyRuleKey[] = [
  "tls-life-2029",
  "tls-life-2027",
  "tls-life-2026",
];

/**
 * A certificate's life against the newest rule in force on its issue day: "At the 200-day
 * limit.", "200 days: longer than the 100-day limit for certificates issued from 15 Mar
 * 2027.", "Issued before 15 Mar 2026, when the limit began.", or null (under the limit, or
 * no rule book here). `stateOf` asks the rule book for a rule's state on a day.
 */
export function lifeCheck(
  issuedOn: string | null,
  expiresOn: string | null,
  keys: readonly DutyRuleKey[],
  stateOf: ((key: DutyRuleKey, on: string) => DutyRuleState) | null,
): string | null {
  if (!issuedOn || !expiresOn || !stateOf) return null;
  for (const key of keys) {
    const state = stateOf(key, issuedOn);
    if (state.not_yet || !state.usable || state.amount === null) continue;
    const limit = state.amount;
    const days = daysBetween(issuedOn, expiresOn);
    if (days === limit) return `At the ${limit.toLocaleString("en")}-day limit.`;
    if (days > limit)
      return `${days.toLocaleString("en")} days: longer than the ${limit.toLocaleString("en")}-day limit for certificates issued from ${dayWords(dutyRuleOf(key).starts_on)}.`;
    return null;
  }
  const first = keys[keys.length - 1];
  const startsOn = first ? dutyRuleOf(first).starts_on : null;
  return startsOn && issuedOn < startsOn
    ? `Issued before ${dayWords(startsOn)}, when the limit began.`
    : null;
}

/** RFC 9116's recommendation, as the rule holds it: Expires less than a year ahead. */
export function securityTxtCheck(
  txt: Pick<SecurityTxt, "published_on" | "expires_on">,
  state: DutyRuleState | null,
): string | null {
  if (!txt.published_on || !state || !state.usable || state.amount === null) return null;
  if (state.unit !== "months") return null;
  if (txt.expires_on <= addMonths(txt.published_on, state.amount)) return null;
  const span = state.amount === 12 ? "a year" : `${state.amount} months`;
  return `More than ${span} ahead; under ${span} is recommended.`;
}

/** The check lines under a domain's row. */
export function domainChecks(domain: Domain): string[] {
  const lines: string[] = [];
  if (domain.released) return lines;
  if (domain.auto_renew === "no") lines.push("Auto-renew is off.");
  if (domain.locked === "no") lines.push("The registrar lock is off.");
  if (domain.dmarc === "none") lines.push("DMARC is at ‘none’.");
  if (!domain.expires_on) lines.push("No expiry day typed.");
  return lines;
}

/** The check lines under a website certificate's row, the life check first. */
export function hostChecks(host: Host, life: string | null): string[] {
  const lines: string[] = [];
  if (life) lines.push(life);
  const probe = host.probe;
  if (probe?.ok && !probe.verified) lines.push("The certificate did not verify on this computer.");
  if (probe && !probe.ok)
    lines.push(
      `Could not be read on ${dayWords(istParts(probe.checked_at).day)}: ${probe.error}. Type its expiry by hand if it cannot be reached from here.`,
    );
  return lines;
}
