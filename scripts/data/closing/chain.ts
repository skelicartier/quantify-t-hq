/**
 * The closing chain's arithmetic and words (ws-notes/company/spec.md §5.7, §9.4): the Key
 * dates each step starts, the deadlines line, the guardrails and the offers count. Every
 * statutory amount comes from `key-dates` (his amount) or, when it is absent, the rule's
 * own in the contract file; never a number here. Nothing here touches a file.
 */

import {
  GUARDRAILS,
  dueFrom,
  fyLabel,
  fyStartYear,
  ruleOf,
  type CompanyLookup,
  type ConfirmWith,
  type FromRecord,
  type KeyDateLink,
  type KeyDatesService,
  type RuleKey,
} from "../company-contracts";
import { addDays, daysBetween } from "../days";
import { DEADLINE_WORDS, dayWords } from "../../../src/lib/data/labels-close";
import type { CloseFirm } from "./seams";
import type { Closing, RoundClose } from "./types";

export const closingKey = (investorId: string): string => `closing:${investorId}`;
export const originOf = (investorId: string, part: "money" | "allotment" | "refund"): string =>
  `closing:${investorId}:${part}`;
export const FLA_ORIGIN = "closing:fla";
export const ROUND_ORIGIN = "closing:round:special-resolution";

export type Residency = CloseFirm["residency"];

/** His amount for a rule when Key dates is here, else the rule's own. */
export function amountOf(keyDates: KeyDatesService | null, key: RuleKey): number | null {
  if (keyDates) {
    try {
      return keyDates.rule(key).amount;
    } catch {
      return ruleOf(key).amount;
    }
  }
  return ruleOf(key).amount;
}

/** The due day on a rule from a base day: his amount through Key dates, else the rule's own. */
export function dueOf(keyDates: KeyDatesService | null, key: RuleKey, base: string): string | null {
  if (keyDates) {
    try {
      return keyDates.dueOn(key, base);
    } catch {
      return dueFrom(ruleOf(key), base);
    }
  }
  return dueFrom(ruleOf(key), base);
}

/** The day the refund clock counts from: the end of his allotment days after the money. */
export function refundBase(keyDates: KeyDatesService | null, moneyOn: string): string {
  return dueOf(keyDates, "allotment", moneyOn) ?? addDays(moneyOn, ruleOf("allotment").amount ?? 0);
}

const href = (investorId: string): string => `/data/investors/${investorId}#investor-closing`;

/** What money received starts (§9.4): the allotment clock, and for a non-resident FIRMS and the report. */
export function moneyItems(
  closing: Closing,
  residency: Residency,
  firmsRegisteredOn: string | null,
): FromRecord[] {
  const money = closing.money_received;
  if (!money) return [];
  const origin = {
    key: originOf(closing.investor_id, "money"),
    label: `Money received from ${closing.firm}`,
    href: href(closing.investor_id),
  };
  const items: FromRecord[] = [
    {
      origin,
      rule_key: "allotment",
      base_on: money.on,
      title: `Allot shares to ${closing.firm}, or refund`,
      kind: "filing",
      owner_role: "cs",
    },
  ];
  if (residency === "non_resident") {
    if (!firmsRegisteredOn)
      items.push({
        origin,
        rule_key: "firms-registration",
        base_on: money.on,
        title: "Register the company on FIRMS",
        kind: "filing",
        owner_role: "cs",
      });
    items.push({
      origin,
      rule_key: "advance-receipt",
      base_on: money.on,
      title: `Report ${closing.firm}'s money received`,
      kind: "filing",
      owner_role: "cs",
    });
  }
  return items;
}

/** What the allotment starts: PAS-3, the register entry, certificates; FC-GPR and FLA for a non-resident. */
export function allotmentItems(closing: Closing, residency: Residency): FromRecord[] {
  const allotment = closing.allotment;
  if (!allotment) return [];
  const origin = {
    key: originOf(closing.investor_id, "allotment"),
    label: `Allotment to ${closing.firm}`,
    href: href(closing.investor_id),
  };
  const items: FromRecord[] = [
    {
      origin,
      rule_key: "pas-3",
      base_on: allotment.on,
      title: `PAS-3: allotment to ${closing.firm}`,
      kind: "filing",
      owner_role: "cs",
    },
    {
      origin,
      rule_key: "register-entry",
      base_on: allotment.on,
      title: `Register of members: ${closing.firm}`,
      kind: "other",
      owner_role: "cs",
    },
    {
      origin,
      rule_key: "share-certificates",
      base_on: allotment.on,
      title: `Share certificates: ${closing.firm}`,
      kind: "other",
      owner_role: "cs",
    },
  ];
  if (residency === "non_resident")
    items.push(
      {
        origin,
        rule_key: "fc-gpr",
        base_on: allotment.on,
        title: `FC-GPR: allotment to ${closing.firm}`,
        kind: "filing",
        owner_role: "cs",
      },
      {
        origin: {
          key: FLA_ORIGIN,
          label: "Foreign investment received",
          href: "/data/investors/closing",
        },
        rule_key: "fla",
        base_on: allotment.on,
        title: "FLA return",
        kind: "filing",
        repeats: "yearly",
        owner_role: "cs",
      },
    );
  return items;
}

/** The refund date, added only on request once the allotment day has passed (§13.1.11). */
export function refundItem(closing: Closing, keyDates: KeyDatesService | null): FromRecord | null {
  const money = closing.money_received;
  if (!money) return null;
  return {
    origin: {
      key: originOf(closing.investor_id, "refund"),
      label: `Money received from ${closing.firm}`,
      href: href(closing.investor_id),
    },
    rule_key: "refund",
    base_on: refundBase(keyDates, money.on),
    title: `Refund ${closing.firm}'s money`,
    kind: "filing",
    owner_role: "cs",
  };
}

/** A special resolution typed on the round (not picked from Meetings): its MGT-14. */
export function roundItems(round: RoundClose): FromRecord[] {
  const resolution = round.special_resolution;
  if (!resolution || resolution.resolution_id) return [];
  return [
    {
      origin: {
        key: ROUND_ORIGIN,
        label: "Special resolution for the round",
        href: "/data/investors/closing",
      },
      rule_key: "mgt-14",
      base_on: resolution.on,
      title: "MGT-14: special resolution for the round",
      kind: "filing",
      owner_role: "cs",
    },
  ];
}

/** Every date a closing's steps would add now, for "Add the deadlines now". */
export function allItems(
  closing: Closing,
  residency: Residency,
  firmsRegisteredOn: string | null,
): FromRecord[] {
  if (closing.refund) return [];
  return [
    ...moneyItems(closing, residency, firmsRegisteredOn),
    ...allotmentItems(closing, residency),
  ];
}

/** The origins one closing's dates live under, the FLA's included once a non-resident is allotted. */
export function originsOf(closing: Closing, residency: Residency): string[] {
  const origins = [
    originOf(closing.investor_id, "money"),
    originOf(closing.investor_id, "allotment"),
    originOf(closing.investor_id, "refund"),
  ];
  if (closing.allotment && residency === "non_resident") origins.push(FLA_ORIGIN);
  return origins;
}

export function linksOf(
  keyDates: KeyDatesService | null,
  origins: readonly string[],
): KeyDateLink[] | null {
  if (!keyDates) return null;
  const links: KeyDateLink[] = [];
  for (const origin of origins) {
    try {
      links.push(...keyDates.linksFor(origin));
    } catch {
      // A failing Key dates leaves this closing's dates out; the page says it.
    }
  }
  return links.sort((a, b) => a.due_on.localeCompare(b.due_on) || a.title.localeCompare(b.title));
}

/** Whether a recorded step's date that Key dates would make is not there. */
export function datesMissing(
  keyDates: KeyDatesService | null,
  items: readonly FromRecord[],
  links: readonly KeyDateLink[] | null,
): boolean {
  if (!keyDates || !links) return false;
  return items.some((item) => {
    const rule = ruleOf(item.rule_key);
    let confirmed = false;
    try {
      confirmed = keyDates.rule(item.rule_key).confirmed;
    } catch {
      confirmed = false;
    }
    if (rule.only_when_confirmed && !confirmed) return false;
    if (dueOf(keyDates, item.rule_key, item.base_on) === null) return false;
    return !links.some(
      (link) => link.origin_key === item.origin.key && link.rule_key === item.rule_key,
    );
  });
}

// ------------------------------------------------------------------ the deadlines line

export type Deadline = { rule_key: RuleKey; title: string; on: string; done_on: string | null };

function fromLink(
  links: readonly KeyDateLink[] | null,
  origin: string,
  rule: RuleKey,
): KeyDateLink | null {
  return (
    links?.find(
      (link) => link.origin_key === origin && link.rule_key === rule && link.state !== "taken_back",
    ) ?? null
  );
}

/**
 * "Allot by {d}" · "Refund by {d}" (until allotted) · "PAS-3 by {d}" · "Register by {d}" ·
 * "Certificates by {d}" · "FC-GPR by {d}" (non-resident): each from its Key date when there,
 * else worked out; a done one carries the day it was done.
 */
export function deadlinesOf(
  closing: Closing,
  residency: Residency,
  keyDates: KeyDatesService | null,
  links: readonly KeyDateLink[] | null,
): Deadline[] {
  const money = closing.money_received;
  if (!money) return [];
  const out: Deadline[] = [];
  const push = (
    rule: RuleKey,
    origin: string,
    base: string,
    doneOn: string | null,
    linkDone = false,
  ): void => {
    const link = fromLink(links, origin, rule);
    const on = link?.due_on ?? dueOf(keyDates, rule, base);
    if (!on) return;
    const done =
      doneOn ??
      (linkDone && link?.state === "done" ? (link.evidence.filed_on ?? link.due_on) : null);
    out.push({ rule_key: rule, title: DEADLINE_WORDS[rule]?.by ?? rule, on, done_on: done });
  };
  const moneyOrigin = originOf(closing.investor_id, "money");
  if (closing.refund) {
    push(
      "refund",
      originOf(closing.investor_id, "refund"),
      refundBase(keyDates, money.on),
      closing.refund.on,
    );
    return out;
  }
  push("allotment", moneyOrigin, money.on, closing.allotment?.on ?? null);
  if (!closing.allotment) {
    push("refund", originOf(closing.investor_id, "refund"), refundBase(keyDates, money.on), null);
    return out;
  }
  const allotted = originOf(closing.investor_id, "allotment");
  const on = closing.allotment.on;
  push("pas-3", allotted, on, null, true);
  push("register-entry", allotted, on, closing.register?.on ?? null);
  push("share-certificates", allotted, on, closing.certificate?.on ?? null);
  if (residency === "non_resident") push("fc-gpr", allotted, on, null, true);
  return out;
}

/** The first deadline not yet done, for the Closing view's "Next". */
export function nextOf(deadlines: readonly Deadline[]): { title: string; on: string } | null {
  const open = deadlines
    .filter((deadline) => !deadline.done_on)
    .sort((a, b) => a.on.localeCompare(b.on));
  const first = open[0];
  return first ? { title: first.title, on: first.on } : null;
}

// ------------------------------------------------------------------ guardrails

export type Guardrail = {
  key: string;
  words: string;
  extra: string;
  /** The Amounts panel's few words. */
  short: string;
  source_url: string;
  confirm_with: ConfirmWith;
};

function fromBook(
  key: (typeof GUARDRAILS)[number]["key"],
  extra: string,
  short: string,
): Guardrail {
  const found = GUARDRAILS.find((item) => item.key === key);
  return {
    key,
    words: found?.words ?? "",
    extra,
    short,
    source_url: found?.sources[0]?.url ?? "",
    confirm_with: found?.confirm_with ?? "CS",
  };
}

function fromRule(key: RuleKey, words: string, short: string, extra = ""): Guardrail {
  const rule = ruleOf(key);
  return {
    key,
    words,
    extra,
    short,
    source_url: rule.sources[0]?.url ?? "",
    confirm_with: rule.confirm_with,
  };
}

const COMMITTED = new Set(["soft", "signed", "money_in"]);
const NOTE_FLOOR = 2_500_000;

/**
 * The warnings on the close (§9.4): never a block, each with its words, its source and who
 * to confirm it with. The instrument is the closing's once there is one, else the firm's
 * newest amount's; residency is always the firm's qualification.
 */
export function guardrailsOf(input: {
  closing: Closing | null;
  firm: CloseFirm;
  round: RoundClose;
  company: CompanyLookup | null;
  keyDates: KeyDatesService | null;
  today: string;
}): Guardrail[] {
  const { closing, firm, round, company, keyDates, today } = input;
  const out: Guardrail[] = [];
  const instrument = closing?.instrument ?? firm.latest?.instrument ?? "";
  const residency = firm.residency;
  let facts: ReturnType<CompanyLookup["facts"]> | null = null;
  try {
    facts = company ? company.facts() : null;
  } catch {
    facts = null;
  }
  if (instrument === "Note") {
    const extras: string[] = [];
    if (!facts) extras.push("DPIIT recognition: Not known.");
    else if (!facts.dpiit_number) extras.push("The company record has no DPIIT number.");
    const money = closing?.money_received ?? null;
    const amount = money
      ? { amount: money.amount, currency: money.currency }
      : firm.latest
        ? { amount: firm.latest.amount, currency: firm.latest.currency }
        : null;
    if (amount && amount.currency === "INR" && amount.amount < NOTE_FLOOR)
      extras.push("This amount is under ₹25 lakh.");
    out.push(fromBook("note", extras.join(" "), "Note: needs DPIIT recognition and ₹25 lakh"));
  }
  if (instrument === "SAFE" && residency === "non_resident")
    out.push(
      fromBook("safe-non-resident", "", "SAFE from a non-resident: likely treated as borrowing"),
    );
  if (residency === "" && (COMMITTED.has(firm.stage) || closing?.money_received))
    out.push(
      fromBook("residency-unknown", "Set it under Qualify on this page.", "Residency not known"),
    );
  if (closing?.money_received && !closing.money_received.own_account)
    out.push(fromBook("own-account", "", "Money not from the investor's own account"));
  if (residency === "non_resident" && closing?.bank_kyc && !closing.bank_kyc.from_receiving_bank)
    out.push(fromBook("receiving-bank", "", "KYC not from the receiving bank"));
  const valuedOn = closing?.valuation?.on ?? round.valuation?.on ?? null;
  if (closing && valuedOn) {
    const allottedOn = closing.allotment?.on ?? null;
    const on = allottedOn ?? today;
    const limit = amountOf(keyDates, "valuation-age");
    const validUntil = dueOf(keyDates, "valuation-age", valuedOn);
    if (validUntil && on > validUntil) {
      const age = daysBetween(valuedOn, on);
      out.push(
        fromRule(
          "valuation-age",
          `The valuation is ${age.toLocaleString("en-GB")} days old ${allottedOn ? "on the allotment day" : "today"}; the rule is at most ${limit ?? ruleOf("valuation-age").amount}.`,
          `Valuation older than ${limit ?? ruleOf("valuation-age").amount} days`,
        ),
      );
    }
  }
  const money = closing?.money_received ?? null;
  if (closing?.allotment && money) {
    const allotBy = dueOf(keyDates, "allotment", money.on);
    if (allotBy && closing.allotment.on > allotBy) {
      const late = daysBetween(money.on, closing.allotment.on);
      const limit = amountOf(keyDates, "allotment") ?? ruleOf("allotment").amount;
      out.push(
        fromRule(
          "allotment",
          `Allotted ${late.toLocaleString("en-GB")} days after the money arrived; the rule is ${limit}.`,
          "Allotted later than the rule",
        ),
      );
    }
  }
  if (
    closing?.allotment &&
    residency === "non_resident" &&
    facts &&
    facts.foreign_investment !== "yes"
  )
    out.push({
      ...fromRule(
        "fc-gpr",
        "Shares were allotted to a non-resident, so the company has received foreign investment.",
        "Foreign investment is not in the company record",
        "The company record says no foreign investment has been received. Update the company's facts.",
      ),
      key: "foreign-investment",
    });
  return out;
}

// ------------------------------------------------------------------ offers this year

export type Offers = {
  fy: string;
  count: number;
  limit: number;
  by_class: { class_name: string; count: number }[];
  source_url: string;
};

/**
 * Closings whose offer letter's day is in today's financial year, each counted once (a
 * syndicate or fund is one holder); per class when more than one class is in use.
 */
export function offersOf(
  closings: readonly Closing[],
  today: string,
  limit: number | null,
  className: (classId: string | null) => string,
): Offers {
  const year = fyStartYear(today);
  const offered = closings.filter(
    (closing) => closing.offer_letter && fyStartYear(closing.offer_letter.on) === year,
  );
  const byClass = new Map<string, number>();
  for (const closing of offered) {
    const name = className(closing.allotment?.class_id ?? closing.class_id);
    byClass.set(name, (byClass.get(name) ?? 0) + 1);
  }
  return {
    fy: fyLabel(today),
    count: offered.length,
    limit: limit ?? ruleOf("offer-limit").amount ?? 0,
    by_class:
      byClass.size > 1
        ? [...byClass.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([class_name, count]) => ({ class_name, count }))
        : [],
    source_url: ruleOf("offer-limit").sources[0]?.url ?? "",
  };
}

/** "Shares are allotted after the money arrives: that day is before 12 Jan 2027." */
export const BEFORE_MONEY = (moneyOn: string): string =>
  `Shares are allotted after the money arrives: that day is before ${dayWords(moneyOn)}.`;
