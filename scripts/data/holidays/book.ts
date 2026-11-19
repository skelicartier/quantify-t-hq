/**
 * The holiday set, kept whole in `holidays/holidays.json` (rewritten on every change) with one
 * line per change in `holidays/events.jsonl` (ws-notes/duties/spec.md §7.4). Days off are the
 * national, state and company holidays; optional ones are listed and are not days off. The
 * weekly off days are his (Saturday and Sunday until he changes them). Nothing is guessed:
 * the one button adds 26 January, 15 August and 2 October of the year he picks, and every
 * other day is typed or pasted from the list his CA confirms.
 */

import { randomUUID } from "node:crypto";

import { Refused } from "../../mail-merge/engine";
import type { DataCore } from "../core";
import { addDays } from "../days";
import {
  WEEK_OFF_DEFAULT,
  addWorkingDaysWith,
  isWorkingDayWith,
  type HolidayKind,
  type HolidaysService,
  type HolidayView,
} from "../duties-contracts";
import { clean, cleanText, isDay } from "../guard";
import type { Staff } from "../protocol";
import { STATES, dayWords } from "../../../src/lib/data/labels-company";
import {
  HOLIDAYS_FALLBACK,
  HOLIDAY_KINDS,
  NATIONAL_DAYS,
  WEEKDAYS,
  isHolidayKind,
} from "../../../src/lib/data/labels-calendar";
import {
  HOLIDAY_FIRST_DAY,
  HOLIDAY_FIRST_YEAR,
  HOLIDAY_LAST_DAY,
  HOLIDAY_LAST_YEAR,
  HOLIDAY_LIMITS,
} from "./limits";
import type { Holiday, HolidayEvent, HolidayRow, HolidaySetup, HolidaysFile } from "./types";

const FILE = "holidays/holidays.json";
const EVENTS = "holidays/events.jsonl";

export const HOLIDAY_SAY = {
  day: "Choose a day from 2020 to 2040.",
  name: "Name the holiday, in 2 to 120 letters.",
  kind: "Choose national, state, company or optional.",
  missing: "That holiday is not here.",
  year: "Choose a year from 2020 to 2040.",
  weekOff: "Choose at least one weekly off day, and leave at least one working day.",
  state: "Choose a state from the list.",
  minimum: "Type the state's minimum as a whole number from 0 to 30, or leave it empty.",
  allowance: "Type the optional holidays as a whole number from 0 to 10, or leave it empty.",
  paste: "Paste one holiday a line: the day, the name and, if you like, the kind.",
  pasteLines: "Paste at most 60 lines at once.",
  count: "Type a whole number of working days from 0 to 260.",
} as const;

export const DEFAULT_SETUP: HolidaySetup = {
  week_off: [...WEEK_OFF_DEFAULT],
  state: "",
  state_minimum: null,
  optional_allowance: null,
  updated_at: null,
  updated_by: null,
};

const SHORT_MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];

/** "2027-01-26" or "26 Jan 2027" (or "26 January 2027") → "2027-01-26"; null for anything else. */
export function pastedDay(text: string): string | null {
  const value = text.trim();
  if (isDay(value)) return value;
  const match = /^(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4})$/.exec(value);
  if (!match) return null;
  const month = SHORT_MONTHS.indexOf((match[2] ?? "").slice(0, 3).toLowerCase());
  if (month < 0) return null;
  const day = `${match[3]}-${String(month + 1).padStart(2, "0")}-${String(Number(match[1])).padStart(2, "0")}`;
  return isDay(day) ? day : null;
}

const weekdayOf = (day: string): number => {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date)).getUTCDay();
};

const inRange = (day: string): boolean => day >= HOLIDAY_FIRST_DAY && day <= HOLIDAY_LAST_DAY;

const blank = (value: unknown): boolean =>
  value === undefined || value === null || (typeof value === "string" && value.trim() === "");

/** A whole number from a form or a body, within a range; null when left empty. */
function countOrNull(value: unknown, max: number, refusal: string): number | null {
  if (blank(value)) return null;
  const text = typeof value === "number" ? String(value) : clean(value, 6);
  const parsed = /^\d+$/.test(text) ? Number(text) : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > max)
    throw new Refused(400, "invalid", refusal);
  return parsed;
}

/** "a", "a and b", "a, b and c". */
const andWords = (items: readonly string[]): string =>
  items.length <= 1
    ? (items[0] ?? "")
    : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1] ?? ""}`;

/** "26 January". */
const dayMonthWords = (md: string): string => {
  const [month = "1", day = "1"] = md.split("-");
  const long = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return `${Number(day)} ${long[Number(month) - 1] ?? ""}`;
};

export class HolidaysBook {
  readonly #core: DataCore;
  setup: HolidaySetup;
  holidays: Holiday[];

  constructor(core: DataCore) {
    this.#core = core;
    core.store.ensureDir("holidays");
    const stored = core.store.readJson<Partial<HolidaysFile>>(FILE, {});
    this.setup = { ...DEFAULT_SETUP, ...(stored.setup ?? {}) };
    if (!Array.isArray(this.setup.week_off) || this.setup.week_off.length === 0)
      this.setup.week_off = [...WEEK_OFF_DEFAULT];
    this.holidays = Array.isArray(stored.holidays)
      ? stored.holidays.filter(
          (holiday) =>
            typeof holiday?.holiday_id === "string" &&
            isDay(holiday.on) &&
            isHolidayKind(holiday.kind) &&
            typeof holiday.name === "string",
        )
      : [];
    this.#sort();
  }

  #sort(): void {
    this.holidays.sort((a, b) => a.on.localeCompare(b.on) || a.name.localeCompare(b.name));
  }

  #save(): void {
    this.#sort();
    const file: HolidaysFile = { format: 1, setup: this.setup, holidays: this.holidays };
    this.#core.store.writeJson(FILE, file);
  }

  #event(verb: HolidayEvent["verb"], holiday: Holiday | null, by: Staff, name = ""): void {
    const event: HolidayEvent = {
      event_id: randomUUID(),
      verb,
      holiday_id: holiday?.holiday_id ?? null,
      on: holiday?.on ?? null,
      name: holiday?.name ?? name,
      by,
      at: this.#core.now(),
    };
    this.#core.store.appendLine(EVENTS, event);
  }

  // ---------------------------------------------------------------- reading

  get(id: string | undefined): Holiday {
    const holiday = id ? this.holidays.find((item) => item.holiday_id === id) : undefined;
    if (!holiday) throw new Refused(404, "not_found", HOLIDAY_SAY.missing);
    return holiday;
  }

  inYear(year: number): Holiday[] {
    const prefix = `${year}-`;
    return this.holidays.filter((holiday) => holiday.on.startsWith(prefix));
  }

  /** Every year that has a holiday, newest last. */
  years(): number[] {
    return [...new Set(this.holidays.map((holiday) => Number(holiday.on.slice(0, 4))))].sort(
      (a, b) => a - b,
    );
  }

  hasYear(year: number): boolean {
    return this.holidays.some((holiday) => Number(holiday.on.slice(0, 4)) === year);
  }

  /** National, state and company holidays: the days off for everyone. */
  off(): Set<string> {
    return new Set(
      this.holidays.filter((holiday) => holiday.kind !== "optional").map((holiday) => holiday.on),
    );
  }

  rowOf(holiday: Holiday): HolidayRow {
    const weekday = weekdayOf(holiday.on);
    return {
      ...holiday,
      weekday: WEEKDAYS[weekday] ?? "",
      on_week_off: this.setup.week_off.includes(weekday),
    };
  }

  /** The working-day arithmetic every unit uses (`holidays`, spec §3.3). */
  service(): HolidaysService {
    return {
      between: (from, to) =>
        this.holidays
          .filter((holiday) => holiday.on >= from && holiday.on <= to)
          .map((holiday): HolidayView => ({
            on: holiday.on,
            name: holiday.name,
            kind: holiday.kind,
          })),
      isWorkingDay: (day) => isWorkingDayWith(day, this.off(), this.setup.week_off),
      addWorkingDays: (day, count) =>
        addWorkingDaysWith(day, count, this.off(), this.setup.week_off),
      hasYear: (year) => this.hasYear(year),
    };
  }

  /** "5 working days after 31 Oct 2026": the day, and the holidays it skipped on working weekdays. */
  count(from: string, count: number) {
    const on = addWorkingDaysWith(from, count, this.off(), this.setup.week_off);
    const skipped = this.holidays
      .filter(
        (holiday) =>
          holiday.kind !== "optional" &&
          holiday.on > from &&
          holiday.on <= on &&
          !this.setup.week_off.includes(weekdayOf(holiday.on)),
      )
      .map((holiday): HolidayView => ({ on: holiday.on, name: holiday.name, kind: holiday.kind }));
    const years = new Set([Number(from.slice(0, 4)), Number(on.slice(0, 4))]);
    const fallback = [...years].some((year) => !this.hasYear(year));
    return { from, count, on, off_between: skipped, fallback };
  }

  // ---------------------------------------------------------------- checks, sentences, never refusals

  checks(year: number): string[] {
    const held = this.inYear(year);
    const lines: string[] = [];
    if (held.length === 0) {
      const weekdays =
        this.setup.week_off.length === 2 &&
        this.setup.week_off.includes(0) &&
        this.setup.week_off.includes(6);
      lines.push(
        weekdays
          ? HOLIDAYS_FALLBACK(year)
          : `No holidays are recorded for ${year}, so only the weekly off days are skipped.`,
      );
    } else {
      const days = new Set(held.map((holiday) => holiday.on));
      const missing = NATIONAL_DAYS.filter((item) => !days.has(`${year}-${item.md}`));
      if (missing.length === 3)
        lines.push(`None of the 3 national holidays of ${year} is recorded.`);
      else if (missing.length > 0)
        lines.push(
          `${3 - missing.length} of the 3 national holidays of ${year} ${3 - missing.length === 1 ? "is" : "are"} recorded: ${andWords(missing.map((item) => dayMonthWords(item.md)))} ${missing.length === 1 ? "is" : "are"} missing.`,
        );
    }
    const local = held.filter((holiday) => holiday.kind === "state" || holiday.kind === "company");
    if (this.setup.state_minimum === null)
      lines.push("No minimum typed yet. Your CA confirms which state's rules apply.");
    else if (local.length < this.setup.state_minimum)
      lines.push(
        `${local.length} state and company ${local.length === 1 ? "holiday" : "holidays"} in ${year}; the minimum you typed is ${this.setup.state_minimum}.`,
      );
    for (const holiday of held) {
      const weekday = weekdayOf(holiday.on);
      if (holiday.kind !== "optional" && this.setup.week_off.includes(weekday))
        lines.push(`${holiday.name} falls on a ${WEEKDAYS[weekday] ?? ""}, a weekly off day.`);
    }
    return lines;
  }

  // ---------------------------------------------------------------- writing

  #checkDay(value: unknown): string {
    const day = clean(value, 10);
    if (!isDay(day) || !inRange(day)) throw new Refused(400, "invalid", HOLIDAY_SAY.day);
    return day;
  }

  #checkName(value: unknown): string {
    const name = cleanText(value, HOLIDAY_LIMITS.name + 1);
    if (name.length < HOLIDAY_LIMITS.name_min || name.length > HOLIDAY_LIMITS.name)
      throw new Refused(400, "invalid", HOLIDAY_SAY.name);
    return name;
  }

  /** One holiday a day; at most 60 a year. `except` is the holiday being changed. */
  #checkRoom(on: string, except: string | null, extra: readonly string[] = []): void {
    const same = this.holidays.find(
      (holiday) => holiday.on === on && holiday.holiday_id !== except,
    );
    if (same)
      throw new Refused(409, "taken", `${dayWords(on)} is already a holiday: ${same.name}.`);
    const year = Number(on.slice(0, 4));
    const inYear =
      this.inYear(year).filter((holiday) => holiday.holiday_id !== except).length +
      extra.filter((day) => day.startsWith(`${year}-`)).length;
    if (inYear >= HOLIDAY_LIMITS.per_year)
      throw new Refused(
        400,
        "invalid",
        `${year} has ${HOLIDAY_LIMITS.per_year} holidays already, the most Data keeps for a year.`,
      );
  }

  add(input: Record<string, unknown>, by: Staff): Holiday {
    const on = this.#checkDay(input.on);
    const name = this.#checkName(input.name);
    const kind = clean(input.kind, 12);
    if (!isHolidayKind(kind)) throw new Refused(400, "invalid", HOLIDAY_SAY.kind);
    const note = cleanText(input.note, HOLIDAY_LIMITS.note);
    this.#checkRoom(on, null);
    const holiday: Holiday = {
      holiday_id: randomUUID(),
      on,
      name,
      kind,
      note,
      created_at: this.#core.now(),
      created_by: by,
    };
    this.holidays.push(holiday);
    this.#save();
    this.#event("added", holiday, by);
    return holiday;
  }

  update(holiday: Holiday, input: Record<string, unknown>, by: Staff): Holiday {
    const has = (name: string) => Object.prototype.hasOwnProperty.call(input, name);
    const on = has("on") ? this.#checkDay(input.on) : holiday.on;
    const name = has("name") ? this.#checkName(input.name) : holiday.name;
    const kindText = has("kind") ? clean(input.kind, 12) : holiday.kind;
    if (!isHolidayKind(kindText)) throw new Refused(400, "invalid", HOLIDAY_SAY.kind);
    const note = has("note") ? cleanText(input.note, HOLIDAY_LIMITS.note) : holiday.note;
    if (on !== holiday.on) this.#checkRoom(on, holiday.holiday_id);
    Object.assign(holiday, { on, name, kind: kindText, note });
    this.#save();
    this.#event("changed", holiday, by);
    return holiday;
  }

  remove(holiday: Holiday, by: Staff): void {
    this.holidays = this.holidays.filter((item) => item.holiday_id !== holiday.holiday_id);
    this.#save();
    this.#event("removed", holiday, by);
  }

  /** 26 January, 15 August and 2 October of a year, skipping days already recorded. */
  national(yearValue: unknown, by: Staff): number {
    const text = typeof yearValue === "number" ? String(yearValue) : clean(yearValue, 4);
    const year = /^\d{4}$/.test(text) ? Number(text) : Number.NaN;
    if (!(year >= HOLIDAY_FIRST_YEAR && year <= HOLIDAY_LAST_YEAR))
      throw new Refused(400, "invalid", HOLIDAY_SAY.year);
    const taken = new Set(this.holidays.map((holiday) => holiday.on));
    const added: Holiday[] = [];
    for (const item of NATIONAL_DAYS) {
      const on = `${year}-${item.md}`;
      if (taken.has(on)) continue;
      added.push({
        holiday_id: randomUUID(),
        on,
        name: item.name,
        kind: "national",
        note: "",
        created_at: this.#core.now(),
        created_by: by,
      });
    }
    if (added.length === 0) return 0;
    if (this.inYear(year).length + added.length > HOLIDAY_LIMITS.per_year)
      throw new Refused(
        400,
        "invalid",
        `${year} has ${HOLIDAY_LIMITS.per_year} holidays already, the most Data keeps for a year.`,
      );
    this.holidays.push(...added);
    this.#save();
    for (const holiday of added) this.#event("added", holiday, by);
    return added.length;
  }

  /**
   * A pasted list: one holiday a line, `day, name[, kind]`, the day as 2027-01-26 or 26 Jan
   * 2027, the kind "state" when not given. Every line is checked first; when any fails, nothing
   * is added and the refusal names the line.
   */
  bulk(textValue: unknown, by: Staff): number {
    const text = typeof textValue === "string" ? textValue.slice(0, HOLIDAY_LIMITS.paste) : "";
    const lines = text
      .split(/\r?\n/)
      .map((line, index) => ({ line: line.trim(), n: index + 1 }))
      .filter((entry) => entry.line !== "");
    if (lines.length === 0) throw new Refused(400, "invalid", HOLIDAY_SAY.paste);
    if (lines.length > HOLIDAY_LIMITS.paste_lines)
      throw new Refused(400, "invalid", HOLIDAY_SAY.pasteLines);
    const made: Holiday[] = [];
    for (const { line, n } of lines) {
      const parts = line.split(",").map((part) => part.trim());
      const dayText = parts[0] ?? "";
      const on = pastedDay(dayText);
      if (!on) throw new Refused(400, "invalid", `Line ${n}: “${dayText}” is not a day.`);
      if (!inRange(on)) throw new Refused(400, "invalid", `Line ${n}: ${HOLIDAY_SAY.day}`);
      let kind: HolidayKind = "state";
      let nameParts = parts.slice(1);
      const last = (nameParts[nameParts.length - 1] ?? "").toLowerCase();
      if (nameParts.length >= 2 && isHolidayKind(last)) {
        kind = last;
        nameParts = nameParts.slice(0, -1);
      }
      const name = nameParts.join(", ").trim();
      if (name.length < HOLIDAY_LIMITS.name_min || name.length > HOLIDAY_LIMITS.name)
        throw new Refused(400, "invalid", `Line ${n}: ${HOLIDAY_SAY.name}`);
      try {
        cleanText(name, HOLIDAY_LIMITS.name);
        this.#checkRoom(
          on,
          null,
          made.map((holiday) => holiday.on),
        );
      } catch (error) {
        if (error instanceof Refused)
          throw new Refused(error.status, error.code, `Line ${n}: ${error.message}`);
        throw error;
      }
      const twin = made.find((holiday) => holiday.on === on);
      if (twin)
        throw new Refused(
          409,
          "taken",
          `Line ${n}: ${dayWords(on)} is already a holiday: ${twin.name}.`,
        );
      made.push({
        holiday_id: randomUUID(),
        on,
        name,
        kind,
        note: "",
        created_at: this.#core.now(),
        created_by: by,
      });
    }
    this.holidays.push(...made);
    this.#save();
    for (const holiday of made) this.#event("added", holiday, by);
    return made.length;
  }

  saveSetup(input: Record<string, unknown>, by: Staff): HolidaySetup {
    const has = (name: string) => Object.prototype.hasOwnProperty.call(input, name);
    let weekOff = this.setup.week_off;
    if (has("week_off")) {
      const given = Array.isArray(input.week_off) ? input.week_off : [input.week_off];
      const days = [
        ...new Set(
          given
            .map((value) => (typeof value === "number" ? value : Number(clean(value, 2))))
            .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6),
        ),
      ].sort((a, b) => a - b);
      if (days.length === 0 || days.length > 6 || days.length !== given.length)
        throw new Refused(400, "invalid", HOLIDAY_SAY.weekOff);
      weekOff = days;
    }
    const state = has("state") ? clean(input.state, 4).toUpperCase() : this.setup.state;
    if (state && !Object.prototype.hasOwnProperty.call(STATES, state))
      throw new Refused(400, "invalid", HOLIDAY_SAY.state);
    const minimum = has("state_minimum")
      ? countOrNull(input.state_minimum, HOLIDAY_LIMITS.state_minimum, HOLIDAY_SAY.minimum)
      : this.setup.state_minimum;
    const allowance = has("optional_allowance")
      ? countOrNull(
          input.optional_allowance,
          HOLIDAY_LIMITS.optional_allowance,
          HOLIDAY_SAY.allowance,
        )
      : this.setup.optional_allowance;
    this.setup = {
      week_off: weekOff,
      state,
      state_minimum: minimum,
      optional_allowance: allowance,
      updated_at: this.#core.now(),
      updated_by: by,
    };
    this.#save();
    this.#event("setup", null, by, "The working week");
    return this.setup;
  }

  /** Test routes only: start again with nothing recorded. */
  reset(): void {
    this.holidays = [];
    this.setup = { ...DEFAULT_SETUP, week_off: [...WEEK_OFF_DEFAULT] };
    this.#save();
  }
}

/** The agenda's items: every holiday from today to a year on (spec §7.4). */
export function holidayAgenda(book: HolidaysBook, today: string, days: number) {
  const until = addDays(today, days);
  return book.holidays
    .filter((holiday) => holiday.on >= today && holiday.on <= until)
    .map((holiday) => ({
      key: `holiday:${holiday.holiday_id}`,
      kind: "holiday" as const,
      title: holiday.name,
      plain: "Holiday",
      sub: HOLIDAY_KINDS[holiday.kind],
      on: holiday.on,
      remind_days: [] as number[],
      href: `/data/registers/holidays?year=${holiday.on.slice(0, 4)}#holiday-${holiday.holiday_id}`,
    }));
}
