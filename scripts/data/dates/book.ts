/**
 * Key dates: filings, tax payments, board meetings and renewals he keeps, each with a due
 * date, a repeat, who handles it and a reminder window, kept whole in `dates/dates.json`
 * with the company facts the suggestions are worked out from (the AGM date).
 *
 * "Done" on a repeating date moves it to its next due date and keeps what was done in its
 * history; on a one-off it stays, marked done. A suggested date is only ever here because
 * he pressed "Add it".
 */

import { randomUUID } from "node:crypto";

import { Refused } from "../../mail-merge/engine";
import type { DataCore } from "../core";
import { addDays } from "../days";
import { LIMITS, clean, cleanText, isDay } from "../guard";
import type { Staff } from "../protocol";
import { DATE_KINDS, REPEATS, type DateKind, type Repeats } from "../../../src/lib/data/labels";
import { CATALOGUE, CHECKED_ON, catalogueItem, type Facts } from "./catalogue";

const FILE = "dates/dates.json";
export const DEFAULT_ENTITY = "The Indian company";
const REMIND = new Set([0, 2, 7, 14]);

export type DateState = "coming_up" | "done" | "not_for_us";

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
  history: { due_on: string; done_at: string; by: Staff; note: string }[];
  created_at: string;
  created_by: Staff;
  updated_at: string;
};

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

/** How a date reads today: done and not for us as stored; otherwise by how near it is. */
export function shownState(
  date: Pick<KeyDate, "state" | "due_on">,
  today: string,
): "coming_up" | "due_this_week" | "done" | "not_for_us" {
  if (date.state !== "coming_up") return date.state;
  return date.due_on <= addDays(today, 6) ? "due_this_week" : "coming_up";
}

/** Inside its reminder window (or overdue): what the overview's Due lists. */
export function inWindow(
  date: Pick<KeyDate, "state" | "due_on" | "remind_days">,
  today: string,
): boolean {
  return date.state === "coming_up" && addDays(date.due_on, -date.remind_days) <= today;
}

export type DateInput = Record<string, unknown>;

export class DatesBook {
  readonly #core: DataCore;
  dates: KeyDate[];
  facts: Facts;

  constructor(core: DataCore) {
    this.#core = core;
    core.store.ensureDir("dates");
    const stored = core.store.readJson<{ dates?: KeyDate[]; facts?: Partial<Facts> }>(FILE, {});
    this.dates = Array.isArray(stored.dates)
      ? stored.dates.filter((item) => typeof item?.date_id === "string" && isDay(item.due_on))
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
  ): KeyDate {
    const now = this.#core.now();
    const date: KeyDate = {
      date_id: randomUUID(),
      ...this.#fields(input, {}, fileExists),
      from_suggestion,
      state: "coming_up",
      state_note: "",
      history: [],
      created_at: now,
      created_by: by,
      updated_at: now,
    };
    this.dates.push(date);
    this.save();
    return date;
  }

  /** A suggestion added: its title, kind, repeat and reminder from the catalogue, its date worked out. */
  addSuggested(
    key: string,
    input: DateInput,
    by: Staff,
    fileExists: (id: string) => boolean,
  ): KeyDate {
    const item = catalogueItem(key);
    if (!item) throw new Refused(404, "not_found", "That suggestion is not here.");
    if (this.dates.some((date) => date.from_suggestion === key))
      throw new Refused(409, "already_added", "That date is in your list already.");
    const today = this.#core.day();
    const agm = clean(input.agm_on, 10);
    const facts: Facts = isDay(agm) ? { agm_on: agm } : this.facts;
    if (isDay(agm) && agm !== this.facts.agm_on) this.setFacts({ agm_on: agm });
    const typedDay = clean(input.due_on, 10);
    const due_on = isDay(typedDay) ? typedDay : item.next(today, facts);
    if (!due_on)
      throw new Refused(
        400,
        "invalid",
        item.needs_agm ? "Say when the AGM was held first." : "Choose the day it is due.",
      );
    return this.add(
      {
        title: item.title,
        kind: item.kind,
        due_on,
        repeats: item.repeats,
        remind_days: item.remind_days,
        entity: input.entity ?? DEFAULT_ENTITY,
        handled_by: input.handled_by ?? "",
        notes:
          clean(input.notes, LIMITS.notes) ||
          `${item.rule}. Applies when: ${item.applies}. Checked on 10 Nov 2026; check with your CA.`,
      },
      by,
      fileExists,
      key,
    );
  }

  update(date: KeyDate, input: DateInput, by: Staff, fileExists: (id: string) => boolean): KeyDate {
    Object.assign(date, this.#fields(input, date, fileExists));
    if (clean(input.state, 20) === "coming_up" && date.state !== "coming_up") {
      date.state = "coming_up";
      date.state_note = "";
    }
    date.updated_at = this.#core.now();
    void by;
    this.save();
    return date;
  }

  done(date: KeyDate, note: unknown, by: Staff): KeyDate {
    if (date.state !== "coming_up")
      throw new Refused(409, "invalid", "That date is not coming up.");
    const at = this.#core.now();
    const text = cleanText(note, LIMITS.notes);
    date.history.push({ due_on: date.due_on, done_at: at, by, note: text });
    const next = nextDue(date, this.facts);
    if (next) date.due_on = next;
    else {
      date.state = "done";
      date.state_note = text;
    }
    date.updated_at = at;
    this.save();
    return date;
  }

  notForUs(date: KeyDate, note: unknown, by: Staff): KeyDate {
    if (date.state === "not_for_us") return date;
    date.state = "not_for_us";
    date.state_note = cleanText(note, LIMITS.notes);
    date.updated_at = this.#core.now();
    void by;
    this.save();
    return date;
  }

  remove(date: KeyDate): void {
    this.dates = this.dates.filter((item) => item.date_id !== date.date_id);
    this.save();
  }

  setFacts(facts: { agm_on: unknown }): Facts {
    const agm = clean(facts.agm_on, 10);
    if (agm && !isDay(agm)) throw new Refused(400, "invalid", "That is not a day.");
    if (agm && agm > this.#core.day())
      throw new Refused(400, "invalid", "Give the day the last AGM was held, not a future one.");
    this.facts = { agm_on: agm || null };
    this.save();
    return this.facts;
  }

  /** The suggestions not added yet, each with its next date worked out for today. */
  suggestions(today: string) {
    const added = new Set(this.dates.map((date) => date.from_suggestion).filter(Boolean));
    return CATALOGUE.filter((item) => !added.has(item.key)).map((item) => ({
      key: item.key,
      title: item.title,
      kind: item.kind,
      group: item.group,
      rule: item.rule,
      applies: item.applies,
      repeats: item.repeats,
      needs_agm: item.needs_agm,
      typed: item.typed,
      next: item.next(today, this.facts),
      checked_on: CHECKED_ON,
    }));
  }
}
