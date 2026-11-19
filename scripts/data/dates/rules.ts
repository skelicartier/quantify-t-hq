/**
 * The rule book (ws-notes/company/spec.md §6.2–§6.4): every clock in Data with his amount
 * and who confirmed it, kept in `dates/rules.json`, one line per change in
 * `dates/rules-history.jsonl`. A rule's own amount stands until he changes it; changing it
 * drops the confirmation, because his CA or CS confirmed the old one. A rule the sources
 * disagree on ("only once confirmed") makes no date until it is confirmed. The calendar
 * dates of the catalogue that follow no clock (TDS, GST, ITR, DPT-3, MSME-1, LUT) are
 * listed too: their days are fixed, so only their confirmation is his to record.
 *
 * The duties batch's rules (ws-notes/duties/spec.md §7.2, `DUTY_RULES` in the contract file)
 * join the same book, the same file and the same acts: a unit may be hours, working days,
 * rupees or per cent; a rule may have readings (the sources disagree), and confirming one
 * means choosing a reading or typing his own amount; a rule may start on a day. No duty day
 * is stored here: each unit works its days out on the next read, through `duty-rules`. The
 * duty `tds-deposit` is the calendar date `tds-deposit` (the lead's decision, spec §15): one
 * row, one confirmation, read by both.
 */

import { Refused } from "../../mail-merge/engine";
import {
  RULES,
  isRuleKey,
  ruleOf,
  type Rule,
  type RuleArea,
  type RuleKey,
} from "../company-contracts";
import type { DataCore } from "../core";
import {
  DUTY_RULES,
  dutyRuleOf,
  dutyStateOf,
  isDutyRuleKey,
  type DutyArea,
  type DutyConfirmWith,
  type DutyRule,
  type DutyRuleKey,
  type DutyRuleState,
  type DutyStored,
  type DutyUnit,
} from "../duties-contracts";
import { clean, cleanText, isDay } from "../guard";
import type { Staff } from "../protocol";
import { CONFIRM_ROLES, rupees } from "../../../src/lib/data/labels-company";
import { DUTY_AMOUNT_MAX, isDutyConfirmRole } from "../../../src/lib/data/labels-calendar";
import { CATALOGUE, CHECKED_ON, type CatalogueItem } from "./catalogue";

const FILE = "dates/rules.json";
const HISTORY = "dates/rules-history.jsonl";

/** The most a rule's amount may be, by its unit. */
export const AMOUNT_MAX = { days: 3_650, months: 120, years: 10, people: 1_000 } as const;

export const RULE_SAY = {
  missing: "That rule is not here.",
  fixedDay: "This rule is a fixed day of the year, so there is no amount to change.",
  words: "This rule is in words, so there is no amount to change.",
  confirm: "Say who confirmed it, their role and the day.",
  future: "That day is in the future.",
  contact: "That contact is not here.",
  reading: "Choose which reading was confirmed, or type your own amount first.",
  nobody: "Nobody confirms this one: it is an industry rule, or your own practice.",
} as const;

export type Confirmation = {
  name: string;
  /** The company's three for its rules; a duty rule may also name a trademark agent or the bank. */
  role: DutyConfirmWith;
  on: string;
  contact_id: string | null;
  amount: number | null;
  /** The reading confirmed, for a duty rule the sources disagree on. */
  reading?: number;
  at: string;
  by: Staff;
};

type Stored = {
  amount?: number;
  /** A duty rule's reading he chose; it counts only while the rule is confirmed. */
  reading?: number;
  confirmed?: Confirmation;
  dropped?: { name: string; at: string };
};

export type RuleView = {
  key: string;
  area: RuleArea | "calendar" | DutyArea;
  title: string;
  from: string;
  /** The clock in words with his amount: "15 days after the allotment". */
  clock: string;
  amount: number | null;
  default_amount: number | null;
  unit: Rule["unit"] | DutyUnit;
  changed: boolean;
  sources: { name: string; url: string }[];
  verified_on: string;
  /** Null only for a duty rule nobody confirms (an industry rule, or his own practice). */
  confirm_with: DutyConfirmWith | null;
  confirmed: { name: string; role: DutyConfirmWith; on: string } | null;
  /** He changed the amount after it was confirmed, and nobody has confirmed it since. */
  confirmation_dropped: boolean;
  late_words: string;
  only_when_confirmed: boolean;
  note: string;
  /** Open dates on it. */
  used_by: number;
  /** Of those, the ones "Move" would give a new day. */
  movable: number;
  /** Present only for a duty rule (and the calendar date `tds-deposit`, which is one). */
  duty?: true;
  sense?: DutyRule["sense"];
  /** Days and comparisons may be worked out with it today. */
  usable?: boolean;
  /** The day it comes into force, while that is ahead; else null. */
  starts_on?: string | null;
  /** The reading he chose (it counts once confirmed), or null. */
  reading?: number | null;
  readings?: { label: string; words: string; sources: { name: string; url: string }[] }[];
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

// ------------------------------------------------------------------ the duty rules

const DUTY_UNIT_WORDS: Record<Exclude<DutyUnit, "rupees" | "per_cent">, [string, string]> = {
  hours: ["hour", "hours"],
  days: ["day", "days"],
  working_days: ["working day", "working days"],
  months: ["month", "months"],
  years: ["year", "years"],
  people: ["person", "people"],
};

/** "6 hours", "5 working days", "₹50,000", "10 per cent", "20 people". */
export function dutyAmountWords(unit: DutyUnit | null, amount: number): string {
  if (unit === "rupees") return rupees(amount);
  if (unit === "per_cent") return `${String(amount)} per cent`;
  if (unit === null) return amount.toLocaleString("en");
  const [one, many] = DUTY_UNIT_WORDS[unit];
  return `${amount.toLocaleString("en")} ${amount === 1 ? one : many}`;
}

/** "a", "a and b", "a, b and c". */
export function andWords(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1] ?? ""}`;
}

/**
 * A duty rule's clock in words, with his amount (spec §7.2): "6 hours after noticing the
 * incident, or being told of it", "1 year before the expiry", "At most 200 days from the day
 * it is issued", "20 people or more: the number of employees", "Over ₹50,000: one vendor's
 * bills in the financial year", "10 per cent of the amount paid or credited"; a rule in words
 * reads its note. A rule the sources disagree on reads "The sources give ₹50,000 and
 * ₹30,000." until it is confirmed: nothing else is worked out from it.
 */
export function dutyClockWords(
  rule: DutyRule,
  state: Pick<DutyRuleState, "amount" | "reading" | "confirmed">,
): string {
  if (rule.readings.length > 0 && !state.confirmed)
    return `The sources give ${andWords(rule.readings.map((reading) => reading.label))}.`;
  const amount = state.amount;
  if (rule.sense === "words") {
    if (amount !== null) return `${dutyAmountWords(rule.unit, amount)}: ${rule.from}`;
    const reading = state.reading === null ? undefined : rule.readings[state.reading];
    return reading ? `${reading.label}: ${rule.from}` : rule.note;
  }
  if (amount === null) return rule.from;
  const span = dutyAmountWords(rule.unit, amount);
  switch (rule.sense) {
    case "within":
      return `${span} after ${rule.from}`;
    case "before":
      return `${span} before ${rule.from}`;
    case "at_most":
      return `At most ${span} from ${rule.from}`;
    case "at_least":
      return rule.unit === "people"
        ? `${amount.toLocaleString("en")} people or more: ${rule.from}`
        : `At least ${span} from ${rule.from}`;
    case "over":
      return `Over ${span}: ${rule.from}`;
    case "rate":
      return `${span} of ${rule.from}`;
  }
}

/** A duty rule that may take his own amount: a unit, and not plain words (§7.2). */
export const dutyTakesAmount = (rule: DutyRule): rule is DutyRule & { unit: DutyUnit } =>
  rule.unit !== null &&
  (rule.sense !== "words" || rule.readings.some((reading) => reading.amount !== null));

/** A duty key that is not also a calendar date: `tds-deposit` is both, and reads as the calendar's. */
export const isDutyOnly = (key: string): key is DutyRuleKey =>
  isDutyRuleKey(key) && !isCalendarRule(key) && !isRuleKey(key);

/** The amount a duty rule would have if confirmed as it stands: his, the reading's, its own. */
function effectiveOf(rule: DutyRule, stored: Stored): number | null {
  const fromReading =
    stored.reading === undefined ? null : (rule.readings[stored.reading]?.amount ?? null);
  return stored.amount ?? fromReading ?? rule.amount;
}

/** A whole number typed for a unit's amount, or a refusal naming the range. */
function wholeIn(value: unknown, max: number): number {
  const text = typeof value === "number" ? String(value) : clean(value, 14).replace(/,/g, "");
  const amount = /^\d+$/.test(text) ? Number(text) : Number.NaN;
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > max)
    throw new Refused(400, "invalid", `Type a whole number from 1 to ${max.toLocaleString("en")}.`);
  return amount;
}

const blank = (value: unknown): boolean =>
  value === undefined || value === null || (typeof value === "string" && value.trim() === "");

export class RuleBook {
  readonly #core: DataCore;
  #rules: Record<string, Stored>;

  constructor(core: DataCore) {
    this.#core = core;
    const stored = core.store.readJson<{ rules?: Record<string, Stored> }>(FILE, {});
    this.#rules = {};
    const rules = stored.rules && typeof stored.rules === "object" ? stored.rules : {};
    for (const [key, value] of Object.entries(rules)) {
      if (!isRuleKey(key) && !isCalendarRule(key) && !isDutyRuleKey(key)) continue;
      if (!value || typeof value !== "object") continue;
      const kept: Stored = {};
      if (typeof value.amount === "number" && Number.isSafeInteger(value.amount))
        kept.amount = value.amount;
      if (typeof value.reading === "number" && Number.isSafeInteger(value.reading))
        kept.reading = value.reading;
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
    reading?: number,
  ): void {
    this.#core.store.appendLine(HISTORY, {
      key,
      amount_before: before,
      amount_after: after,
      confirmed,
      by,
      at: this.#core.now(),
      ...(reading === undefined ? {} : { reading }),
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
    if (!isRuleKey(key) && !isCalendarRule(key) && !isDutyRuleKey(key))
      throw new Refused(404, "not_found", RULE_SAY.missing);
  }

  /** What the book holds for a duty rule, as the contract reads it. */
  dutyStored(key: DutyRuleKey): DutyStored {
    const stored = this.#rules[key];
    if (!stored) return {};
    return {
      ...(stored.amount === undefined ? {} : { amount: stored.amount }),
      ...(stored.reading === undefined ? {} : { reading: stored.reading }),
      ...(stored.confirmed
        ? { confirmed: { name: stored.confirmed.name, on: stored.confirmed.on } }
        : {}),
    };
  }

  /** A duty rule's state on a day: what `duty-rules` answers. */
  dutyState(key: DutyRuleKey, on: string): DutyRuleState {
    return dutyStateOf(dutyRuleOf(key), this.dutyStored(key), on);
  }

  #setDutyAmount(key: DutyRuleKey, value: unknown, by: Staff): void {
    const rule = dutyRuleOf(key);
    if (!dutyTakesAmount(rule)) throw new Refused(409, "no_amount", RULE_SAY.words);
    const amount = wholeIn(value, DUTY_AMOUNT_MAX[rule.unit]);
    const stored = this.#rules[key] ?? {};
    const before = effectiveOf(rule, stored);
    if (rule.amount !== null && amount === rule.amount) delete stored.amount;
    else stored.amount = amount;
    const after = effectiveOf(rule, stored);
    const wasConfirmed = Boolean(stored.confirmed);
    if (after !== before && stored.confirmed) {
      stored.dropped = { name: stored.confirmed.name, at: this.#core.now() };
      delete stored.confirmed;
    }
    this.#rules[key] = stored;
    this.#save();
    this.#history(
      key,
      before,
      after,
      wasConfirmed && Boolean(stored.confirmed),
      by,
      stored.reading,
    );
  }

  setAmount(key: string, value: unknown, by: Staff): void {
    this.#known(key);
    if (isDutyOnly(key)) return this.#setDutyAmount(key, value, by);
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
    const duty = isDutyOnly(key) ? dutyRuleOf(key) : null;
    if (duty && duty.confirm_with === null)
      throw new Refused(409, "nobody_confirms", RULE_SAY.nobody);
    const name = cleanText(input.name, 120);
    const role = clean(input.role, 10);
    const on = clean(input.on, 10);
    const roleKnown = duty ? isDutyConfirmRole(role) : role in CONFIRM_ROLES;
    if (!name || !roleKnown || !isDay(on)) throw new Refused(400, "invalid", RULE_SAY.confirm);
    if (on > this.#core.day()) throw new Refused(400, "invalid", RULE_SAY.future);
    const contactId = clean(input.contact_id, 64) || null;
    if (contactId) {
      const contacts = this.#core.need<{ get(id: string): unknown }>("contacts");
      if (contacts && !contacts.get(contactId))
        throw new Refused(404, "not_found", RULE_SAY.contact);
    }
    const stored = this.#rules[key] ?? {};
    let before: number | null = isRuleKey(key) ? this.amount(key) : null;
    if (duty) {
      before = effectiveOf(duty, stored);
      // A rule the sources disagree on is confirmed as a reading, or as his own amount.
      if (duty.readings.length > 0) {
        if (!blank(input.amount)) {
          if (!dutyTakesAmount(duty)) throw new Refused(409, "no_amount", RULE_SAY.words);
          stored.amount = wholeIn(input.amount, DUTY_AMOUNT_MAX[duty.unit]);
          delete stored.reading;
        } else if (!blank(input.reading)) {
          const text =
            typeof input.reading === "number" ? String(input.reading) : clean(input.reading, 3);
          const index = /^\d+$/.test(text) ? Number(text) : -1;
          if (!duty.readings[index]) throw new Refused(400, "invalid", RULE_SAY.reading);
          stored.reading = index;
          delete stored.amount;
        } else if (stored.amount === undefined) throw new Refused(400, "invalid", RULE_SAY.reading);
      }
    }
    const amount = duty ? effectiveOf(duty, stored) : before;
    stored.confirmed = {
      name,
      role: role as DutyConfirmWith,
      on,
      contact_id: contactId,
      amount,
      ...(duty && stored.reading !== undefined ? { reading: stored.reading } : {}),
      at: this.#core.now(),
      by,
    };
    delete stored.dropped;
    this.#rules[key] = stored;
    this.#save();
    this.#history(key, before, amount, true, by, duty ? stored.reading : undefined);
  }

  unconfirm(key: string, by: Staff): void {
    this.#known(key);
    const stored = this.#rules[key];
    if (!stored?.confirmed) return;
    delete stored.confirmed;
    this.#save();
    const duty = isDutyOnly(key) ? dutyRuleOf(key) : null;
    const amount = duty ? effectiveOf(duty, stored) : isRuleKey(key) ? this.amount(key) : null;
    this.#history(key, amount, amount, false, by, duty ? stored.reading : undefined);
  }

  /** One rule as the Rules view shows it, on a day (today by default). */
  view(
    key: string,
    used: { used_by: number; movable: number },
    on: string = this.#core.day(),
  ): RuleView {
    this.#known(key);
    const stored = this.#rules[key] ?? {};
    const confirmed = stored.confirmed
      ? { name: stored.confirmed.name, role: stored.confirmed.role, on: stored.confirmed.on }
      : null;
    if (isDutyOnly(key)) {
      const rule = dutyRuleOf(key);
      const state = dutyStateOf(rule, this.dutyStored(key), on);
      return {
        key,
        area: rule.area,
        title: rule.title,
        from: rule.from,
        clock: dutyClockWords(rule, state),
        amount: state.amount,
        default_amount: rule.amount,
        unit: rule.unit,
        changed: stored.amount !== undefined,
        sources: rule.sources.map((source) => ({ ...source })),
        verified_on: rule.verified_on,
        confirm_with: rule.confirm_with,
        confirmed,
        confirmation_dropped: !confirmed && Boolean(stored.dropped),
        late_words: "",
        only_when_confirmed: rule.only_when_confirmed,
        note: rule.note,
        used_by: 0,
        movable: 0,
        duty: true,
        sense: rule.sense,
        usable: state.usable,
        starts_on: rule.starts_on,
        reading: stored.reading ?? null,
        readings: rule.readings.map((reading) => ({
          label: reading.label,
          words: reading.words,
          sources: reading.sources.map((source) => ({ ...source })),
        })),
      };
    }
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
    const view: RuleView = {
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
    if (!isDutyRuleKey(key)) return view;
    // The calendar date that is also a duty rule (`tds-deposit`, spec §15): one row, its key,
    // its confirmation and his dates as they were, with the duty's source and sentence added.
    const rule = dutyRuleOf(key);
    const known = new Set(view.sources.map((source) => source.url));
    for (const source of rule.sources) if (!known.has(source.url)) view.sources.push({ ...source });
    if (rule.note && !view.note.includes(rule.note))
      view.note = view.note ? `${view.note} ${rule.note}` : rule.note;
    return {
      ...view,
      duty: true,
      sense: rule.sense,
      usable: dutyStateOf(rule, this.dutyStored(key), on).usable,
      starts_on: rule.starts_on,
      reading: null,
      readings: [],
    };
  }

  /**
   * Every rule key, then every calendar key, then the duty rules in the contract's order, in
   * the order the Rules view lists them. A duty key that is already a calendar date is not
   * listed twice.
   */
  keys(): string[] {
    return [
      ...RULES.map((rule) => rule.key),
      ...CALENDAR_RULES.map((item) => item.key),
      ...DUTY_RULES.map((rule) => rule.key).filter(isDutyOnly),
    ];
  }
}
