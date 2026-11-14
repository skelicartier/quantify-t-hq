/**
 * Key dates: filings, tax payments, board meetings and renewals he keeps, each with a due
 * date, a repeat, who handles it and a reminder window, kept whole in `dates/dates.json`
 * with the AGM day typed here (the suggestions' fallback when Meetings has none).
 *
 * "Done" on a repeating date moves it to its next due date and keeps what was done, with
 * its evidence, in its history; on a one-off it stays, marked done. A suggested date is only
 * ever here because he pressed "Add it", or because a record he keeps started its clock and
 * he left "Add the dates to Key dates" ticked (company spec §6.6).
 *
 * Every date written before the company batch reads through `withDefaults`: each stored
 * field is kept as it is, and the new ones get their defaults; nothing is written at start.
 */

import { randomUUID } from "node:crypto";

import { Refused } from "../../mail-merge/engine";
import {
  NO_EVIDENCE,
  evidenceOf,
  isRuleKey,
  type ConfirmWith,
  type Evidence,
  type KeyDateState,
  type OwnerRole,
  type RuleKey,
} from "../company-contracts";
import type { DataCore } from "../core";
import { addDays } from "../days";
import { LIMITS, clean, cleanText, isDay } from "../guard";
import type { Staff } from "../protocol";
import { DATE_KINDS, REPEATS, type DateKind, type Repeats } from "../../../src/lib/data/labels";
import { CONFIRM_ROLES, OWNER_ROLES } from "../../../src/lib/data/labels-company";
import { catalogueItem, type Facts } from "./catalogue";

const FILE = "dates/dates.json";
export const DEFAULT_ENTITY = "The Indian company";
const REMIND = new Set([0, 2, 7, 14]);

export type DateState = KeyDateState;

export type Origin = { key: string; label: string; href: string };
export type SignOff = { name: string; role: ConfirmWith; on: string; contact_id: string | null };

export type HistoryLine = {
  due_on: string;
  done_at: string;
  by: Staff;
  note: string;
  evidence: Evidence;
};

export type KeyDate = {
  date_id: string;
  title: string;
  kind: DateKind;
  due_on: string;
  repeats: Repeats;
  entity: string;
  handled_by: string;
  remind_days: 0 | 2 | 7 | 14;
  notes: string;
  file_id: string | null;
  from_suggestion: string | null;
  state: DateState;
  state_note: string;
  history: HistoryLine[];
  created_at: string;
  created_by: Staff;
  updated_at: string;
  /** A clock in the rule book, when the date follows one. */
  rule_key: RuleKey | null;
  /** True for a catalogue suggestion that is not a renewal, a fact-driven one and every date from a record. */
  statutory: boolean;
  /** Where a date from a record came from. */
  origin: Origin | null;
  /** The day its rule counted from. */
  base_on: string | null;
  owner_role: OwnerRole;
  evidence: Evidence;
  /** For "Not for us" on a statutory date. */
  sign_off: SignOff | null;
};

export const SAY = {
  signOff: "Say which professional confirmed it does not apply, their role and the day.",
  notOpen: "That date is not coming up.",
  notComingUp: "That date is not coming up.",
  notNotForUs: "That date is not marked not for us.",
  fee: "Type the fee in rupees, such as 300.",
  future: "That day is in the future.",
  notADay: "That is not a day.",
  ownerRole: "Choose who files it.",
} as const;

const MAX_FEE = 100_000_000;

const pad = (value: number): string => String(value).padStart(2, "0");

function daysIn(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** A calendar date plus whole months, on the anchor day (or the month's last day). */
export function addMonths(day: string, months: number, anchorDay?: number): string {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  const index = month - 1 + months;
  const y = year + Math.floor(index / 12);
  const m = (((index % 12) + 12) % 12) + 1;
  return `${y}-${pad(m)}-${pad(Math.min(anchorDay ?? date, daysIn(y, m)))}`;
}

const STEP: Record<Exclude<Repeats, "never">, number> = { monthly: 1, quarterly: 3, yearly: 12 };

const STATES = new Set<string>(["coming_up", "in_progress", "done", "not_for_us", "taken_back"]);
const OWNER_KEYS = new Set<string>(Object.keys(OWNER_ROLES));

const isOpen = (state: DateState): boolean => state === "coming_up" || state === "in_progress";

/** Coming up or in progress: a date still owed. */
export const openDate = (date: Pick<KeyDate, "state">): boolean => isOpen(date.state);

function originOf(value: unknown): Origin | null {
  const r = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  return r && typeof r.key === "string" && typeof r.label === "string" && typeof r.href === "string"
    ? { key: r.key, label: r.label, href: r.href }
    : null;
}

function signOffOf(value: unknown): SignOff | null {
  const r = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  if (!r || typeof r.name !== "string" || typeof r.role !== "string" || !isDay(r.on)) return null;
  if (!(r.role in CONFIRM_ROLES)) return null;
  return {
    name: r.name,
    role: r.role as ConfirmWith,
    on: r.on,
    contact_id: typeof r.contact_id === "string" && r.contact_id ? r.contact_id : null,
  };
}

/**
 * A stored date read back (company spec §6.2): every stored field kept as it is, and the
 * fields this batch added given their defaults when they are not there.
 */
export function withDefaults(raw: Record<string, unknown>): KeyDate {
  const stored = raw as unknown as KeyDate;
  const fromSuggestion = typeof raw.from_suggestion === "string" ? raw.from_suggestion : null;
  const item = fromSuggestion ? catalogueItem(fromSuggestion) : null;
  const history = Array.isArray(raw.history) ? (raw.history as Record<string, unknown>[]) : [];
  const state = typeof raw.state === "string" && STATES.has(raw.state) ? raw.state : "coming_up";
  return {
    ...stored,
    from_suggestion: fromSuggestion,
    state: state as DateState,
    state_note: typeof raw.state_note === "string" ? raw.state_note : "",
    history: history
      .filter((line) => line && typeof line === "object")
      .map((line) => ({
        ...(line as unknown as HistoryLine),
        evidence: evidenceOf(line.evidence),
      })),
    rule_key: isRuleKey(raw.rule_key)
      ? raw.rule_key
      : "rule_key" in raw
        ? null
        : (item?.rule_key ?? null),
    statutory:
      typeof raw.statutory === "boolean"
        ? raw.statutory
        : Boolean(item && item.group !== "renewal"),
    origin: originOf(raw.origin),
    base_on: isDay(raw.base_on) ? raw.base_on : null,
    owner_role:
      typeof raw.owner_role === "string" && OWNER_KEYS.has(raw.owner_role)
        ? (raw.owner_role as OwnerRole)
        : "",
    evidence: evidenceOf(raw.evidence),
    sign_off: signOffOf(raw.sign_off),
  };
}

/**
 * The next due date after a date is done: a suggested rule works its own next date out
 * (so a TDS deposit goes from 7 Mar to 30 Apr, and the company ITR to 31 Oct); anything
 * else moves by its repeat, on the day of the month it was first due.
 */
export function nextDue(
  date: Pick<KeyDate, "due_on" | "repeats" | "from_suggestion" | "history">,
  facts: Facts,
): string | null {
  if (date.repeats === "never") return null;
  const item = date.from_suggestion ? catalogueItem(date.from_suggestion) : null;
  if (item && !item.needs_agm && !item.typed) {
    const next = item.next(addDays(date.due_on, 1), facts);
    if (next && next > date.due_on) return next;
  }
  const first = date.history[0]?.due_on ?? date.due_on;
  return addMonths(date.due_on, STEP[date.repeats], Number(first.slice(8, 10)));
}

export type ShownState =
  "coming_up" | "due_this_week" | "in_progress" | "done" | "not_for_us" | "taken_back";

/** How a date reads today: in progress, done, not for us and taken back as stored; otherwise by how near it is. */
export function shownState(date: Pick<KeyDate, "state" | "due_on">, today: string): ShownState {
  if (date.state !== "coming_up") return date.state;
  return date.due_on <= addDays(today, 6) ? "due_this_week" : "coming_up";
}

/** Inside its reminder window (or overdue), coming up or in progress: what the overview's Due lists. */
export function inWindow(
  date: Pick<KeyDate, "state" | "due_on" | "remind_days">,
  today: string,
): boolean {
  return isOpen(date.state) && addDays(date.due_on, -date.remind_days) <= today;
}

export type DateInput = Record<string, unknown>;

/** What a record or a suggestion adds besides the form's fields. */
export type DateExtra = {
  rule_key?: RuleKey | null;
  statutory?: boolean;
  origin?: Origin | null;
  base_on?: string | null;
  owner_role?: OwnerRole;
  from_suggestion?: string | null;
};

export class DatesBook {
  readonly #core: DataCore;
  dates: KeyDate[];
  facts: { agm_on: string | null };

  constructor(core: DataCore) {
    this.#core = core;
    core.store.ensureDir("dates");
    const stored = core.store.readJson<{ dates?: unknown[]; facts?: { agm_on?: unknown } }>(
      FILE,
      {},
    );
    this.dates = Array.isArray(stored.dates)
      ? stored.dates
          .filter(
            (item): item is Record<string, unknown> =>
              Boolean(item) &&
              typeof item === "object" &&
              typeof (item as Record<string, unknown>).date_id === "string" &&
              isDay((item as Record<string, unknown>).due_on),
          )
          .map(withDefaults)
      : [];
    this.facts = { agm_on: isDay(stored.facts?.agm_on) ? stored.facts.agm_on : null };
  }

  save(): void {
    this.#core.store.writeJson(FILE, { format: 1, dates: this.dates, facts: this.facts });
  }

  get(id: string | undefined): KeyDate {
    const date = id ? this.dates.find((item) => item.date_id === id) : undefined;
    if (!date) throw new Refused(404, "not_found", "That date is not here.");
    return date;
  }

  /** The fields of the form, checked; a field not given keeps `base`'s value. */
  #fields(input: DateInput, base: Partial<KeyDate>, fileExists: (id: string) => boolean) {
    const has = (name: string) => Object.prototype.hasOwnProperty.call(input, name);
    const title = has("title") ? cleanText(input.title, LIMITS.title) : (base.title ?? "");
    if (!title) throw new Refused(400, "invalid", "Say what is due.");
    const kind = has("kind") ? clean(input.kind, 20) : (base.kind ?? "other");
    if (!(kind in DATE_KINDS)) throw new Refused(400, "invalid", "Choose the kind of date.");
    const due_on = has("due_on") ? clean(input.due_on, 10) : (base.due_on ?? "");
    if (!isDay(due_on)) throw new Refused(400, "invalid", "Choose the day it is due.");
    const repeats = has("repeats") ? clean(input.repeats, 20) : (base.repeats ?? "never");
    if (!(repeats in REPEATS)) throw new Refused(400, "invalid", "Choose how often it repeats.");
    const entity = has("entity")
      ? cleanText(input.entity, LIMITS.name) || DEFAULT_ENTITY
      : (base.entity ?? DEFAULT_ENTITY);
    const handled_by = has("handled_by")
      ? cleanText(input.handled_by, LIMITS.name)
      : (base.handled_by ?? "");
    const remindRaw = has("remind_days") ? Number(input.remind_days) : (base.remind_days ?? 7);
    if (!REMIND.has(remindRaw))
      throw new Refused(400, "invalid", "Choose when to be reminded: 14, 7, 2 or 0 days before.");
    const notes = has("notes") ? cleanText(input.notes, LIMITS.notes) : (base.notes ?? "");
    const file_id = has("file_id") ? clean(input.file_id, 64) || null : (base.file_id ?? null);
    if (file_id && !fileExists(file_id))
      throw new Refused(400, "invalid", "That file is not in Files.");
    return {
      title,
      kind: kind as DateKind,
      due_on,
      repeats: repeats as Repeats,
      entity,
      handled_by,
      remind_days: remindRaw as KeyDate["remind_days"],
      notes,
      file_id,
    };
  }

  add(
    input: DateInput,
    by: Staff,
    fileExists: (id: string) => boolean,
    from_suggestion: string | null = null,
    extra: DateExtra = {},
  ): KeyDate {
    const now = this.#core.now();
    const date: KeyDate = {
      date_id: randomUUID(),
      ...this.#fields(input, {}, fileExists),
      from_suggestion: extra.from_suggestion ?? from_suggestion,
      state: "coming_up",
      state_note: "",
      history: [],
      created_at: now,
      created_by: by,
      updated_at: now,
      rule_key: extra.rule_key ?? null,
      statutory: extra.statutory ?? false,
      origin: extra.origin ?? null,
      base_on: extra.base_on ?? null,
      owner_role: extra.owner_role ?? "",
      evidence: { ...NO_EVIDENCE },
      sign_off: null,
    };
    this.dates.push(date);
    this.save();
    return date;
  }

  update(date: KeyDate, input: DateInput, by: Staff, fileExists: (id: string) => boolean): KeyDate {
    Object.assign(date, this.#fields(input, date, fileExists));
    if (clean(input.state, 20) === "coming_up" && date.state !== "coming_up") {
      date.state = "coming_up";
      date.state_note = "";
      date.sign_off = null;
      date.evidence = { ...NO_EVIDENCE };
    }
    date.updated_at = this.#core.now();
    void by;
    this.save();
    return date;
  }

  /**
   * The evidence a "Done" carries, checked (company spec §6.3); the filed copy is put in Files
   * by the route, which passes its id.
   */
  evidenceInput(input: DateInput, fileId: string | null): Evidence {
    const filed = clean(input.filed_on, 10);
    if (filed && !isDay(filed)) throw new Refused(400, "invalid", SAY.notADay);
    if (filed && filed > this.#core.day()) throw new Refused(400, "invalid", SAY.future);
    const feeText =
      typeof input.fee_paid === "number" ? String(input.fee_paid) : clean(input.fee_paid, 16);
    const feeClean = feeText.replace(/[₹,\s]/g, "");
    let fee: number | null = null;
    if (feeClean) {
      if (!/^\d+$/.test(feeClean)) throw new Refused(400, "invalid", SAY.fee);
      fee = Number(feeClean);
      if (!Number.isSafeInteger(fee) || fee > MAX_FEE) throw new Refused(400, "invalid", SAY.fee);
    }
    return {
      srn: cleanText(input.srn, 60),
      challan: cleanText(input.challan, 60),
      filed_on: filed || null,
      fee_paid: fee,
      filed_file_id: fileId,
      note: cleanText(input.note, 2_000),
    };
  }

  done(date: KeyDate, evidence: Evidence, by: Staff, facts: Facts): KeyDate {
    if (!isOpen(date.state)) throw new Refused(409, "invalid", SAY.notComingUp);
    const at = this.#core.now();
    date.history.push({ due_on: date.due_on, done_at: at, by, note: evidence.note, evidence });
    const next = nextDue(date, facts);
    if (next) {
      date.due_on = next;
      date.state = "coming_up";
      date.state_note = "";
      date.evidence = { ...NO_EVIDENCE };
    } else {
      date.state = "done";
      date.state_note = evidence.note;
      date.evidence = evidence;
    }
    date.updated_at = at;
    this.save();
    return date;
  }

  inProgress(date: KeyDate, note: unknown, by: Staff): KeyDate {
    if (date.state !== "coming_up") throw new Refused(409, "invalid", SAY.notComingUp);
    date.state = "in_progress";
    date.state_note = cleanText(note, LIMITS.notes);
    date.updated_at = this.#core.now();
    void by;
    this.save();
    return date;
  }

  /** The professional's sign-off from a form, or null when none of it was given. */
  signOffInput(input: DateInput, required: boolean): SignOff | null {
    const name = cleanText(input.sign_off_name, LIMITS.name);
    const role = clean(input.sign_off_role, 10);
    const on = clean(input.sign_off_on, 10);
    if (!name && !role && !on) {
      if (required) throw new Refused(400, "invalid", SAY.signOff);
      return null;
    }
    if (!name || !(role in CONFIRM_ROLES) || !isDay(on))
      throw new Refused(400, "invalid", SAY.signOff);
    if (on > this.#core.day()) throw new Refused(400, "invalid", SAY.future);
    const contactId = clean(input.sign_off_contact_id, 64) || null;
    if (contactId) {
      const contacts = this.#core.need<{ get(id: string): unknown }>("contacts");
      if (contacts && !contacts.get(contactId))
        throw new Refused(404, "not_found", "That contact is not here.");
    }
    return { name, role: role as ConfirmWith, on, contact_id: contactId };
  }

  notForUs(date: KeyDate, input: DateInput, by: Staff): KeyDate {
    if (date.state === "not_for_us") return date;
    const signOff = this.signOffInput(input, date.statutory);
    date.state = "not_for_us";
    date.state_note = cleanText(input.note, LIMITS.notes);
    date.sign_off = signOff;
    date.updated_at = this.#core.now();
    void by;
    this.save();
    return date;
  }

  /** The sign-off recorded later, for a date marked not for us before it was asked. */
  signOff(date: KeyDate, input: DateInput, by: Staff): KeyDate {
    if (date.state !== "not_for_us") throw new Refused(409, "invalid", SAY.notNotForUs);
    date.sign_off = this.signOffInput(input, true);
    date.updated_at = this.#core.now();
    void by;
    this.save();
    return date;
  }

  setOwner(date: KeyDate, input: DateInput, by: Staff): KeyDate {
    const role = clean(input.owner_role, 10);
    if (!OWNER_KEYS.has(role)) throw new Refused(400, "invalid", SAY.ownerRole);
    date.owner_role = role as OwnerRole;
    if (Object.prototype.hasOwnProperty.call(input, "handled_by"))
      date.handled_by = cleanText(input.handled_by, LIMITS.name);
    date.updated_at = this.#core.now();
    void by;
    this.save();
    return date;
  }

  /** A record's event was taken back: an open date reads "Taken back", with why. */
  takeBack(date: KeyDate, why: string): KeyDate {
    if (!isOpen(date.state)) return date;
    date.state = "taken_back";
    date.state_note = why;
    date.updated_at = this.#core.now();
    return date;
  }

  remove(date: KeyDate): void {
    this.dates = this.dates.filter((item) => item.date_id !== date.date_id);
    this.save();
  }

  setFacts(facts: { agm_on: unknown }): { agm_on: string | null } {
    const agm = clean(facts.agm_on, 10);
    if (agm && !isDay(agm)) throw new Refused(400, "invalid", "That is not a day.");
    if (agm && agm > this.#core.day())
      throw new Refused(400, "invalid", "Give the day the last AGM was held, not a future one.");
    this.facts = { agm_on: agm || null };
    this.save();
    return this.facts;
  }
}
