/**
 * The rule book (ws-notes/company/spec.md §6.2–§6.4): every clock in Data with his amount
 * and who confirmed it, kept in `dates/rules.json`, one line per change in
 * `dates/rules-history.jsonl`. A rule's own amount stands until he changes it; changing it
 * drops the confirmation, because his CA or CS confirmed the old one. A rule the sources
 * disagree on ("only once confirmed") makes no date until it is confirmed. The calendar
 * dates of the catalogue that follow no clock (TDS, GST, ITR, DPT-3, MSME-1, LUT) are
 * listed too: their days are fixed, so only their confirmation is his to record.
 */

import { Refused } from "../../mail-merge/engine";
import {
  RULES,
  isRuleKey,
  ruleOf,
  type ConfirmWith,
  type Rule,
  type RuleArea,
  type RuleKey,
} from "../company-contracts";
import type { DataCore } from "../core";
import { clean, cleanText, isDay } from "../guard";
import type { Staff } from "../protocol";
import { CONFIRM_ROLES } from "../../../src/lib/data/labels-company";
import { CATALOGUE, CHECKED_ON, type CatalogueItem } from "./catalogue";

const FILE = "dates/rules.json";
const HISTORY = "dates/rules-history.jsonl";

/** The most a rule's amount may be, by its unit. */
export const AMOUNT_MAX = { days: 3_650, months: 120, years: 10, people: 1_000 } as const;

export const RULE_SAY = {
  missing: "That rule is not here.",
  fixedDay: "This rule is a fixed day of the year, so there is no amount to change.",
  confirm: "Say who confirmed it, their role and the day.",
  future: "That day is in the future.",
  contact: "That contact is not here.",
} as const;

export type Confirmation = {
  name: string;
  role: ConfirmWith;
  on: string;
  contact_id: string | null;
  amount: number | null;
  at: string;
  by: Staff;
};

type Stored = { amount?: number; confirmed?: Confirmation; dropped?: { name: string; at: string } };

export type RuleView = {
  key: string;
  area: RuleArea | "calendar";
  title: string;
  from: string;
  /** The clock in words with his amount: "15 days after the allotment". */
  clock: string;
  amount: number | null;
  default_amount: number | null;
  unit: Rule["unit"];
  changed: boolean;
  sources: { name: string; url: string }[];
  verified_on: string;
  confirm_with: ConfirmWith;
  confirmed: { name: string; role: ConfirmWith; on: string } | null;
  /** He changed the amount after it was confirmed, and nobody has confirmed it since. */
  confirmation_dropped: boolean;
  late_words: string;
  only_when_confirmed: boolean;
  note: string;
  /** Open dates on it. */
  used_by: number;
  /** Of those, the ones "Move" would give a new day. */
  movable: number;
};

/** The catalogue's calendar dates that follow no clock: the Rules view's fourth table. */
export const CALENDAR_RULES: readonly CatalogueItem[] = CATALOGUE.filter(
  (item) => item.group !== "renewal" && item.rule_key === null,
);

export const isCalendarRule = (key: string): boolean =>
  CALENDAR_RULES.some((item) => item.key === key);

const unitWords = (unit: Rule["unit"], amount: number): string => {
  const one = amount === 1;
  switch (unit) {
    case "days":
      return one ? "day" : "days";
    case "months":
      return one ? "month" : "months";
    case "years":
      return one ? "year" : "years";
    case "people":
      return one ? "person" : "people";
    default:
      return "";
  }
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The clock in words, with an amount: "15 days after the allotment". */
export function clockWords(rule: Rule, amount: number | null): string {
  if (rule.fy_day) {
    const [month = "1", day = "1"] = rule.fy_day.split("-");
    return `By ${Number(day)} ${MONTHS[Number(month) - 1] ?? ""}, after ${rule.from}`;
  }
  if (amount === null) return rule.from;
  const span = `${amount.toLocaleString("en")} ${unitWords(rule.unit, amount)}`;
  if (rule.key === "board-quorum") return `At least ${amount} directors, or a third of the board`;
  if (rule.key === "offer-limit") return `At most ${span} in ${rule.from}`;
  switch (rule.sense) {
    case "within":
      return `${span} after ${rule.from}`;
    case "at_least":
      return `At least ${span} from ${rule.from}`;
    case "at_most":
      return `At most ${span} from ${rule.from}`;
    default:
      return `${span}: ${rule.from}`;
  }
}

/** The late fee in words, with the figures in Indian grouping. */
export function lateWords(rule: Rule): string {
  return rule.late?.words ?? "";
}

export class RuleBook {
  readonly #core: DataCore;
  #rules: Record<string, Stored>;

  constructor(core: DataCore) {
    this.#core = core;
    const stored = core.store.readJson<{ rules?: Record<string, Stored> }>(FILE, {});
    this.#rules = {};
    const rules = stored.rules && typeof stored.rules === "object" ? stored.rules : {};
    for (const [key, value] of Object.entries(rules)) {
      if (!isRuleKey(key) && !isCalendarRule(key)) continue;
      if (!value || typeof value !== "object") continue;
      const kept: Stored = {};
      if (typeof value.amount === "number" && Number.isSafeInteger(value.amount))
        kept.amount = value.amount;
      if (value.confirmed && typeof value.confirmed.name === "string")
        kept.confirmed = value.confirmed;
      if (value.dropped && typeof value.dropped.name === "string") kept.dropped = value.dropped;
      this.#rules[key] = kept;
    }
  }

  #save(): void {
    this.#core.store.writeJson(FILE, { format: 1, rules: this.#rules });
  }

  #history(
    key: string,
    before: number | null,
    after: number | null,
    confirmed: boolean,
    by: Staff,
  ): void {
    this.#core.store.appendLine(HISTORY, {
      key,
      amount_before: before,
      amount_after: after,
      confirmed,
      by,
      at: this.#core.now(),
    });
  }

  /** His amount for a clock (the rule's own until he changes it); null for a fixed day. */
  amount(key: RuleKey): number | null {
    const rule = ruleOf(key);
    if (rule.amount === null) return null;
    return this.#rules[key]?.amount ?? rule.amount;
  }

  /** The amounts he changed, by rule: what the catalogue works its dates out with. */
  amounts(): Partial<Record<RuleKey, number>> {
    const out: Partial<Record<RuleKey, number>> = {};
    for (const [key, value] of Object.entries(this.#rules))
      if (isRuleKey(key) && value.amount !== undefined) out[key] = value.amount;
    return out;
  }

  confirmation(key: string): Confirmation | null {
    return this.#rules[key]?.confirmed ?? null;
  }

  isConfirmed(key: string): boolean {
    return this.confirmation(key) !== null;
  }

  /** Every rule and calendar date not confirmed by his CA or CS. */
  unconfirmed(): number {
    return [...RULES.map((rule) => rule.key), ...CALENDAR_RULES.map((item) => item.key)].filter(
      (key) => !this.isConfirmed(key),
    ).length;
  }

  #known(key: string): void {
    if (!isRuleKey(key) && !isCalendarRule(key))
      throw new Refused(404, "not_found", RULE_SAY.missing);
  }

  setAmount(key: string, value: unknown, by: Staff): void {
    this.#known(key);
    if (!isRuleKey(key)) throw new Refused(409, "fixed_day", RULE_SAY.fixedDay);
    const rule = ruleOf(key);
    if (rule.amount === null || rule.unit === null)
      throw new Refused(409, "fixed_day", RULE_SAY.fixedDay);
    const max = AMOUNT_MAX[rule.unit];
    const text = typeof value === "number" ? String(value) : clean(value, 12);
    const amount = /^\d+$/.test(text) ? Number(text) : Number.NaN;
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > max)
      throw new Refused(
        400,
        "invalid",
        `Type a whole number from 1 to ${max.toLocaleString("en")}.`,
      );
    const before = this.amount(key);
    const stored = this.#rules[key] ?? {};
    if (amount === rule.amount) delete stored.amount;
    else stored.amount = amount;
    const after = stored.amount ?? rule.amount;
    const wasConfirmed = Boolean(stored.confirmed);
    if (after !== before && stored.confirmed) {
      stored.dropped = { name: stored.confirmed.name, at: this.#core.now() };
      delete stored.confirmed;
    }
    this.#rules[key] = stored;
    this.#save();
    this.#history(key, before, after, wasConfirmed && Boolean(stored.confirmed), by);
  }

  confirm(key: string, input: Record<string, unknown>, by: Staff): void {
    this.#known(key);
    const name = cleanText(input.name, 120);
    const role = clean(input.role, 10);
    const on = clean(input.on, 10);
    if (!name || !(role in CONFIRM_ROLES) || !isDay(on))
      throw new Refused(400, "invalid", RULE_SAY.confirm);
    if (on > this.#core.day()) throw new Refused(400, "invalid", RULE_SAY.future);
    const contactId = clean(input.contact_id, 64) || null;
    if (contactId) {
      const contacts = this.#core.need<{ get(id: string): unknown }>("contacts");
      if (contacts && !contacts.get(contactId))
        throw new Refused(404, "not_found", RULE_SAY.contact);
    }
    const amount = isRuleKey(key) ? this.amount(key) : null;
    const stored = this.#rules[key] ?? {};
    stored.confirmed = {
      name,
      role: role as ConfirmWith,
      on,
      contact_id: contactId,
      amount,
      at: this.#core.now(),
      by,
    };
    delete stored.dropped;
    this.#rules[key] = stored;
    this.#save();
    this.#history(key, amount, amount, true, by);
  }

  unconfirm(key: string, by: Staff): void {
    this.#known(key);
    const stored = this.#rules[key];
    if (!stored?.confirmed) return;
    delete stored.confirmed;
    this.#save();
    const amount = isRuleKey(key) ? this.amount(key) : null;
    this.#history(key, amount, amount, false, by);
  }

  /** One rule as the Rules view shows it. */
  view(key: string, used: { used_by: number; movable: number }): RuleView {
    this.#known(key);
    const stored = this.#rules[key] ?? {};
    const confirmed = stored.confirmed
      ? { name: stored.confirmed.name, role: stored.confirmed.role, on: stored.confirmed.on }
      : null;
    if (isRuleKey(key)) {
      const rule = ruleOf(key);
      const amount = this.amount(key);
      return {
        key,
        area: rule.area,
        title: rule.title,
        from: rule.from,
        clock: clockWords(rule, amount),
        amount,
        default_amount: rule.amount,
        unit: rule.unit,
        changed: stored.amount !== undefined,
        sources: rule.sources.map((source) => ({ ...source })),
        verified_on: rule.verified_on,
        confirm_with: rule.confirm_with,
        confirmed,
        confirmation_dropped: !confirmed && Boolean(stored.dropped),
        late_words: lateWords(rule),
        only_when_confirmed: rule.only_when_confirmed,
        note: rule.note,
        ...used,
      };
    }
    const item = CALENDAR_RULES.find((entry) => entry.key === key)!;
    return {
      key,
      area: "calendar",
      title: item.title,
      from: item.applies,
      clock: item.rule,
      amount: null,
      default_amount: null,
      unit: null,
      changed: false,
      sources: item.sources.map((source) => ({ ...source })),
      verified_on: item.verified_on || CHECKED_ON,
      confirm_with: item.confirm_with ?? "CA",
      confirmed,
      confirmation_dropped: !confirmed && Boolean(stored.dropped),
      late_words: "",
      only_when_confirmed: false,
      note: item.note,
      ...used,
    };
  }

  /** Every rule key, then every calendar key, in the order the Rules view lists them. */
  keys(): string[] {
    return [...RULES.map((rule) => rule.key), ...CALENDAR_RULES.map((item) => item.key)];
  }
}
