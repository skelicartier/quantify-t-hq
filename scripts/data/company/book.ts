/**
 * The company book (ws-notes/company/spec.md §6.2, §6.3): the facts in `company/facts.json`,
 * the directors in `company/directors.json`, their contact changes in
 * `company/contact-changes.json`, and one line per change in `company/events.jsonl` that
 * names the fields and never their values. A director ceases and stays; nothing here is
 * ever deleted. Every input is checked here; the checks that compare facts are lines in
 * `checks.ts`, never refusals.
 */

import { randomUUID } from "node:crypto";

import { Refused } from "../../mail-merge/engine";
import type { Flag } from "../company-contracts";
import type { DataCore } from "../core";
import { addDays } from "../days";
import { clean, cleanText, isDay, normaliseEmail } from "../guard";
import type { Staff } from "../protocol";
import {
  CONTACT_FIELDS,
  DESIGNATIONS,
  DIRECTOR_WORDS,
  FACT_WORDS,
  STATES,
  dayWords,
  firstFyEndOptions,
  optionsWords,
} from "../../../src/lib/data/labels-company";
import { LIMIT, SAY, SHAPE, tooMany } from "./limits";
import {
  EMPTY_FACTS,
  type CompanyEvent,
  type ContactChange,
  type Designation,
  type Director,
  type Facts,
  type FactsGroup,
} from "./types";

const FACTS = "company/facts.json";
const DIRECTORS = "company/directors.json";
const CHANGES = "company/contact-changes.json";
const EVENTS = "company/events.jsonl";

export const GROUP_FIELDS: Record<FactsGroup, readonly string[]> = {
  identity: ["legal_name", "cin", "pan", "tan", "gstin", "registered_state", "registered_office"],
  dates: ["incorporated_on", "first_fy_end"],
  class: ["small", "startup", "subsidiary", "foreign_investment", "gst_registered", "exports"],
  registrations: [
    "auditor_name",
    "auditor_firm_number",
    "auditor_appointed_on",
    "auditor_appointed_by",
    "auditor_contact_id",
    "bank_name",
    "bank_branch",
    "bank_contact_id",
    "firms_registered_on",
    "firms_user_note",
    "dpiit_number",
    "dpiit_recognised_on",
  ],
};

const isGroup = (value: unknown): value is FactsGroup =>
  typeof value === "string" && Object.prototype.hasOwnProperty.call(GROUP_FIELDS, value);

const FLAG_VALUES = new Set(["yes", "no", ""]);
const flagOf = (value: unknown): Flag => (value === "yes" || value === "no" ? value : "");
const textOf = (value: unknown): string => (typeof value === "string" ? value : "");
const dayOrNull = (value: unknown): string | null => (isDay(value) ? value : null);
const staffOrNull = (value: unknown): Staff | null => {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  return record && typeof record.staff_id === "string" && typeof record.name === "string"
    ? { staff_id: record.staff_id, name: record.name }
    : null;
};
const UNKNOWN: Staff = { staff_id: "unknown", name: "Unknown" };

/** A stored facts record read back: whatever is missing or of the wrong type is empty. */
export function factsOf(raw: unknown): Facts {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const part = (key: string): Record<string, unknown> => {
    const value = r[key];
    return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  };
  const auditor = part("auditor");
  const bank = part("bank");
  const firms = part("firms");
  const dpiit = part("dpiit");
  const flags = part("flags");
  const by = auditor.appointed_by;
  return {
    ...EMPTY_FACTS,
    legal_name: textOf(r.legal_name),
    cin: textOf(r.cin),
    pan: textOf(r.pan),
    tan: textOf(r.tan),
    gstin: textOf(r.gstin),
    registered_state: textOf(r.registered_state),
    registered_office: textOf(r.registered_office),
    incorporated_on: dayOrNull(r.incorporated_on),
    first_fy_end: dayOrNull(r.first_fy_end),
    auditor: {
      name: textOf(auditor.name),
      firm_number: textOf(auditor.firm_number),
      appointed_on: dayOrNull(auditor.appointed_on),
      appointed_by: by === "board" || by === "agm" ? by : "",
      contact_id: textOf(auditor.contact_id) || null,
    },
    bank: {
      name: textOf(bank.name),
      branch: textOf(bank.branch),
      contact_id: textOf(bank.contact_id) || null,
    },
    firms: { registered_on: dayOrNull(firms.registered_on), user_note: textOf(firms.user_note) },
    dpiit: { number: textOf(dpiit.number), recognised_on: dayOrNull(dpiit.recognised_on) },
    flags: {
      small: flagOf(flags.small),
      startup: flagOf(flags.startup),
      subsidiary: flagOf(flags.subsidiary),
      foreign_investment: flagOf(flags.foreign_investment),
      gst_registered: flagOf(flags.gst_registered),
      exports: flagOf(flags.exports),
    },
    updated_at: typeof r.updated_at === "string" ? r.updated_at : null,
    updated_by: staffOrNull(r.updated_by),
  };
}

/** Whether nothing at all has been filled in (the page's empty state). */
export function factsEmpty(facts: Facts): boolean {
  return facts.updated_at === null;
}

/** Facts read flat, the way the forms send them and the "Changes" lines name them. */
export function flatFacts(facts: Facts): Record<string, string> {
  return {
    legal_name: facts.legal_name,
    cin: facts.cin,
    pan: facts.pan,
    tan: facts.tan,
    gstin: facts.gstin,
    registered_state: facts.registered_state,
    registered_office: facts.registered_office,
    incorporated_on: facts.incorporated_on ?? "",
    first_fy_end: facts.first_fy_end ?? "",
    small: facts.flags.small,
    startup: facts.flags.startup,
    subsidiary: facts.flags.subsidiary,
    foreign_investment: facts.flags.foreign_investment,
    gst_registered: facts.flags.gst_registered,
    exports: facts.flags.exports,
    auditor_name: facts.auditor.name,
    auditor_firm_number: facts.auditor.firm_number,
    auditor_appointed_on: facts.auditor.appointed_on ?? "",
    auditor_appointed_by: facts.auditor.appointed_by,
    auditor_contact_id: facts.auditor.contact_id ?? "",
    bank_name: facts.bank.name,
    bank_branch: facts.bank.branch,
    bank_contact_id: facts.bank.contact_id ?? "",
    firms_registered_on: facts.firms.registered_on ?? "",
    firms_user_note: facts.firms.user_note,
    dpiit_number: facts.dpiit.number,
    dpiit_recognised_on: facts.dpiit.recognised_on ?? "",
  };
}

function directorOf(raw: unknown): Director | null {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  if (!r || typeof r.director_id !== "string" || typeof r.name !== "string") return null;
  const part = (key: string): Record<string, unknown> => {
    const value = r[key];
    return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  };
  const dsc = part("dsc");
  const kyc = part("kyc");
  const mca = part("mca");
  const designation = textOf(r.designation);
  return {
    director_id: r.director_id,
    name: r.name,
    din: textOf(r.din),
    din_allotted_on: dayOrNull(r.din_allotted_on),
    designation: designation in DESIGNATIONS ? (designation as Designation) : "director",
    appointed_on: dayOrNull(r.appointed_on),
    ceased_on: dayOrNull(r.ceased_on),
    is_founder: r.is_founder === true,
    dsc: { expires_on: dayOrNull(dsc.expires_on), kept: textOf(dsc.kept) },
    kyc: { last_filed_on: dayOrNull(kyc.last_filed_on), srn: textOf(kyc.srn) },
    mca: { email: textOf(mca.email), mobile: textOf(mca.mobile), address: textOf(mca.address) },
    created_at: textOf(r.created_at),
    created_by: staffOrNull(r.created_by) ?? UNKNOWN,
    updated_at: textOf(r.updated_at),
    updated_by: staffOrNull(r.updated_by) ?? UNKNOWN,
  };
}

/** In office on a day: appointed on or before it (or no day recorded), and not ceased by it. */
export function inOffice(director: Director, day: string): boolean {
  if (director.appointed_on && director.appointed_on > day) return false;
  return !(director.ceased_on && director.ceased_on <= day);
}

/** The DSC needs looking at: it expires within 60 days, or has. */
export function dscSoon(director: Director, today: string): boolean {
  return Boolean(director.dsc.expires_on && director.dsc.expires_on <= addDays(today, 60));
}

export type DirectorInput = Record<string, unknown>;

export class CompanyBook {
  readonly #core: DataCore;
  facts: Facts;
  directors: Director[];
  changes: ContactChange[];

  constructor(core: DataCore) {
    this.#core = core;
    core.store.ensureDir("company");
    const facts = core.store.readJson<{ facts?: unknown }>(FACTS, {});
    this.facts = factsOf(facts.facts);
    const directors = core.store.readJson<{ directors?: unknown[] }>(DIRECTORS, {});
    this.directors = Array.isArray(directors.directors)
      ? directors.directors.map(directorOf).filter((item): item is Director => item !== null)
      : [];
    const changes = core.store.readJson<{ changes?: ContactChange[] }>(CHANGES, {});
    this.changes = Array.isArray(changes.changes)
      ? changes.changes.filter(
          (item) =>
            typeof item?.change_id === "string" &&
            typeof item.director_id === "string" &&
            isDay(item.changed_on),
        )
      : [];
  }

  // ---------------------------------------------------------------- storing

  #saveFacts(): void {
    this.#core.store.writeJson(FACTS, { format: 1, facts: this.facts });
  }

  #saveDirectors(): void {
    this.#core.store.writeJson(DIRECTORS, { format: 1, directors: this.directors });
  }

  #saveChanges(): void {
    this.#core.store.writeJson(CHANGES, { format: 1, changes: this.changes });
  }

  log(event: Omit<CompanyEvent, "event_id" | "at">): CompanyEvent {
    const line: CompanyEvent = { event_id: randomUUID(), at: this.#core.now(), ...event };
    this.#core.store.appendLine(EVENTS, line);
    return line;
  }

  events(filter: (event: CompanyEvent) => boolean, limit = 50): CompanyEvent[] {
    return this.#core.store
      .readLines<CompanyEvent>(EVENTS)
      .filter((event) => typeof event?.event_id === "string" && filter(event))
      .reverse()
      .slice(0, limit);
  }

  // ---------------------------------------------------------------- reading inputs

  #notFuture(day: string): string {
    if (day > this.#core.day()) throw new Refused(400, "invalid", SAY.future);
    return day;
  }

  /** Blank, or a day that is not after today. */
  #pastDay(value: unknown): string | null {
    const day = clean(value, 10);
    if (!day) return null;
    if (!isDay(day)) throw new Refused(400, "invalid", SAY.notADay);
    return this.#notFuture(day);
  }

  /** Blank, or any day. */
  #anyDay(value: unknown): string | null {
    const day = clean(value, 10);
    if (!day) return null;
    if (!isDay(day)) throw new Refused(400, "invalid", SAY.notADay);
    return day;
  }

  #shaped(value: unknown, shape: RegExp, sentence: string, limit = 30): string {
    const text = clean(value, limit).toUpperCase().replace(/\s+/g, "");
    if (text && !shape.test(text)) throw new Refused(400, "invalid", sentence);
    return text;
  }

  #note(value: unknown, limit: number): string {
    const text = cleanText(value, limit);
    if (SHAPE.pin.test(text)) throw new Refused(400, "invalid", SAY.pin);
    return text;
  }

  #contact(value: unknown): string | null {
    const id = clean(value, 64);
    if (!id) return null;
    const contacts = this.#core.need<{ get(contactId: string): unknown }>("contacts");
    if (!contacts) return null;
    if (!contacts.get(id)) throw new Refused(404, "not_found", SAY.contact);
    return id;
  }

  #email(value: unknown): string {
    const text = clean(value, 254);
    if (!text) return "";
    const email = normaliseEmail(text);
    if (!email) throw new Refused(400, "invalid", SAY.email);
    return email;
  }

  #mobile(value: unknown): string {
    const text = clean(value, 40);
    if (text && !SHAPE.mobile.test(text)) throw new Refused(400, "invalid", SAY.mobile);
    return text;
  }

  // ---------------------------------------------------------------- the facts

  /** One group of facts, checked; the other groups stay as they are. */
  saveFacts(group: unknown, input: Record<string, unknown>, by: Staff): Facts {
    if (!isGroup(group)) throw new Refused(400, "invalid", SAY.group);
    const has = (name: string) => Object.prototype.hasOwnProperty.call(input, name);
    const next: Facts = structuredClone(this.facts);
    if (group === "identity") {
      if (has("legal_name")) next.legal_name = cleanText(input.legal_name, LIMIT.legal_name);
      if (has("cin")) next.cin = this.#shaped(input.cin, SHAPE.cin, SAY.cin);
      if (has("pan")) next.pan = this.#shaped(input.pan, SHAPE.pan, SAY.pan);
      if (has("tan")) next.tan = this.#shaped(input.tan, SHAPE.tan, SAY.tan);
      if (has("gstin")) next.gstin = this.#shaped(input.gstin, SHAPE.gstin, SAY.gstin);
      if (has("registered_state")) {
        const state = clean(input.registered_state, 4).toUpperCase();
        if (state && !(state in STATES)) throw new Refused(400, "invalid", SAY.choose);
        next.registered_state = state;
      }
      if (has("registered_office"))
        next.registered_office = cleanText(input.registered_office, LIMIT.registered_office);
    } else if (group === "dates") {
      if (has("incorporated_on")) next.incorporated_on = this.#pastDay(input.incorporated_on);
      const end = has("first_fy_end") ? clean(input.first_fy_end, 10) : (next.first_fy_end ?? "");
      if (end) {
        if (!next.incorporated_on) throw new Refused(400, "invalid", SAY.incorporatedFirst);
        const options = firstFyEndOptions(next.incorporated_on);
        if (!options.includes(end))
          throw new Refused(
            400,
            "invalid",
            `For a company incorporated on ${dayWords(next.incorporated_on)}, the first financial year ends on ${optionsWords(options)}.`,
          );
        next.first_fy_end = end;
      } else next.first_fy_end = null;
    } else if (group === "class") {
      for (const key of GROUP_FIELDS.class) {
        if (!has(key)) continue;
        const value = clean(input[key], 4);
        if (!FLAG_VALUES.has(value)) throw new Refused(400, "invalid", SAY.flag);
        next.flags[key as keyof Facts["flags"]] = value as Flag;
      }
    } else {
      if (has("auditor_name"))
        next.auditor.name = cleanText(input.auditor_name, LIMIT.auditor_name);
      if (has("auditor_firm_number"))
        next.auditor.firm_number = cleanText(input.auditor_firm_number, LIMIT.auditor_firm_number);
      if (has("auditor_appointed_on"))
        next.auditor.appointed_on = this.#pastDay(input.auditor_appointed_on);
      if (has("auditor_appointed_by")) {
        const by = clean(input.auditor_appointed_by, 10);
        if (by !== "" && by !== "board" && by !== "agm")
          throw new Refused(400, "invalid", SAY.appointedBy);
        next.auditor.appointed_by = by;
      }
      if (has("auditor_contact_id"))
        next.auditor.contact_id = this.#contact(input.auditor_contact_id);
      if (has("bank_name")) next.bank.name = cleanText(input.bank_name, LIMIT.auditor_name);
      if (has("bank_branch")) next.bank.branch = cleanText(input.bank_branch, LIMIT.auditor_name);
      if (has("bank_contact_id")) next.bank.contact_id = this.#contact(input.bank_contact_id);
      if (has("firms_registered_on"))
        next.firms.registered_on = this.#pastDay(input.firms_registered_on);
      if (has("firms_user_note"))
        next.firms.user_note = this.#note(input.firms_user_note, LIMIT.note);
      if (has("dpiit_number"))
        next.dpiit.number = cleanText(input.dpiit_number, LIMIT.dpiit_number).toUpperCase();
      if (has("dpiit_recognised_on"))
        next.dpiit.recognised_on = this.#pastDay(input.dpiit_recognised_on);
    }
    const before = flatFacts(this.facts);
    const after = flatFacts(next);
    const changed = Object.keys(after).filter((key) => after[key] !== before[key]);
    next.updated_at = this.#core.now();
    next.updated_by = by;
    this.facts = next;
    this.#saveFacts();
    this.log({
      target: "facts",
      id: "facts",
      verb: "changed",
      detail: changed.length ? changed.map((key) => FACT_WORDS[key] ?? key).join(", ") : "Nothing",
      by,
    });
    return this.facts;
  }

  // ---------------------------------------------------------------- directors

  director(id: string | undefined): Director {
    const found = id ? this.directors.find((item) => item.director_id === id) : undefined;
    if (!found) throw new Refused(404, "not_found", SAY.director);
    return found;
  }

  #din(value: unknown, self: string | null): string {
    const din = clean(value, 12).replace(/\s+/g, "");
    if (!din) return "";
    if (!SHAPE.din.test(din)) throw new Refused(400, "invalid", SAY.din);
    const other = this.directors.find((item) => item.din === din && item.director_id !== self);
    if (other) throw new Refused(409, "din_taken", `DIN ${din} is already ${other.name}'s.`);
    return din;
  }

  /** The fields of a director, checked; a field not given keeps `base`'s value. */
  #directorFields(input: DirectorInput, base: Director | null) {
    const has = (name: string) => Object.prototype.hasOwnProperty.call(input, name);
    const name = has("name") ? cleanText(input.name, LIMIT.director_name) : (base?.name ?? "");
    if (!name) throw new Refused(400, "invalid", SAY.name);
    const designation = has("designation")
      ? clean(input.designation, 20)
      : (base?.designation ?? "director");
    if (!(designation in DESIGNATIONS)) throw new Refused(400, "invalid", SAY.designation);
    const founder = has("is_founder")
      ? input.is_founder === true || input.is_founder === "on" || input.is_founder === "true"
      : (base?.is_founder ?? false);
    const dscExpiry = has("dsc_expires_on")
      ? this.#anyDay(input.dsc_expires_on)
      : (base?.dsc.expires_on ?? null);
    return {
      name,
      din: has("din") ? this.#din(input.din, base?.director_id ?? null) : (base?.din ?? ""),
      din_allotted_on: has("din_allotted_on")
        ? this.#pastDay(input.din_allotted_on)
        : (base?.din_allotted_on ?? null),
      designation: designation as Designation,
      appointed_on: has("appointed_on")
        ? this.#anyDay(input.appointed_on)
        : (base?.appointed_on ?? null),
      is_founder: founder,
      dsc: {
        expires_on: dscExpiry,
        kept: has("dsc_kept") ? this.#note(input.dsc_kept, LIMIT.note) : (base?.dsc.kept ?? ""),
      },
      kyc: {
        last_filed_on: has("kyc_filed_on")
          ? this.#pastDay(input.kyc_filed_on)
          : (base?.kyc.last_filed_on ?? null),
        srn: has("kyc_srn") ? cleanText(input.kyc_srn, LIMIT.srn) : (base?.kyc.srn ?? ""),
      },
    };
  }

  addDirector(input: DirectorInput, by: Staff, pinnedId?: string): Director {
    if (this.directors.length >= LIMIT.directors)
      throw new Refused(409, "too_many", tooMany(LIMIT.directors));
    const fields = this.#directorFields(input, null);
    const now = this.#core.now();
    const director: Director = {
      director_id: pinnedId ?? randomUUID(),
      ...fields,
      ceased_on: null,
      mca: {
        email: this.#email(input.mca_email),
        mobile: this.#mobile(input.mca_mobile),
        address: cleanText(input.mca_address, LIMIT.address),
      },
      created_at: now,
      created_by: by,
      updated_at: now,
      updated_by: by,
    };
    this.directors.push(director);
    this.#saveDirectors();
    this.log({ target: "director", id: director.director_id, verb: "added", detail: "", by });
    return director;
  }

  /** Every field but the MCA contact, which changes only through a contact change. */
  updateDirector(director: Director, input: DirectorInput, by: Staff): Director {
    const fields = this.#directorFields(input, director);
    const before = flatDirector(director);
    Object.assign(director, fields);
    const after = flatDirector(director);
    const changed = Object.keys(after).filter((key) => after[key] !== before[key]);
    director.updated_at = this.#core.now();
    director.updated_by = by;
    this.#saveDirectors();
    this.log({
      target: "director",
      id: director.director_id,
      verb: "changed",
      detail: changed.length
        ? changed.map((key) => DIRECTOR_WORDS[key] ?? key).join(", ")
        : "Nothing",
      by,
    });
    return director;
  }

  cease(director: Director, value: unknown, by: Staff): Director {
    if (director.ceased_on) throw new Refused(409, "invalid", SAY.ceased);
    const day = clean(value, 10);
    if (!isDay(day)) throw new Refused(400, "invalid", SAY.notADay);
    this.#notFuture(day);
    if (director.appointed_on && day < director.appointed_on)
      throw new Refused(400, "invalid", SAY.ceasedBefore);
    director.ceased_on = day;
    director.updated_at = this.#core.now();
    director.updated_by = by;
    this.#saveDirectors();
    this.log({ target: "director", id: director.director_id, verb: "ceased", detail: "", by });
    return director;
  }

  kyc(director: Director, input: Record<string, unknown>, by: Staff): Director {
    const day = clean(input.filed_on, 10);
    if (!isDay(day)) throw new Refused(400, "invalid", SAY.notADay);
    this.#notFuture(day);
    director.kyc = { last_filed_on: day, srn: cleanText(input.srn, LIMIT.srn) };
    director.updated_at = this.#core.now();
    director.updated_by = by;
    this.#saveDirectors();
    this.log({ target: "director", id: director.director_id, verb: "KYC filed", detail: "", by });
    return director;
  }

  // ---------------------------------------------------------------- contact changes

  contactChange(director: Director, input: Record<string, unknown>, by: Staff): ContactChange {
    if (this.changes.length >= LIMIT.changes)
      throw new Refused(409, "too_many", tooMany(LIMIT.changes));
    const field = clean(input.field, 10);
    if (field !== "email" && field !== "mobile" && field !== "address")
      throw new Refused(400, "invalid", SAY.field);
    const to =
      field === "email"
        ? this.#email(input.to)
        : field === "mobile"
          ? this.#mobile(input.to)
          : cleanText(input.to, LIMIT.address);
    if (!to)
      throw new Refused(
        400,
        "invalid",
        `Give the new ${CONTACT_FIELDS[field].toLowerCase()} on the MCA record.`,
      );
    if (to === director.mca[field])
      throw new Refused(
        400,
        "invalid",
        `That is the ${CONTACT_FIELDS[field].toLowerCase()} already on the record.`,
      );
    const day = clean(input.changed_on, 10) || this.#core.day();
    if (!isDay(day)) throw new Refused(400, "invalid", SAY.notADay);
    this.#notFuture(day);
    const change: ContactChange = {
      change_id: randomUUID(),
      director_id: director.director_id,
      field,
      from: director.mca[field],
      to,
      changed_on: day,
      filed: null,
      at: this.#core.now(),
      by,
    };
    this.changes.push(change);
    director.mca[field] = to;
    director.updated_at = change.at;
    director.updated_by = by;
    this.#saveChanges();
    this.#saveDirectors();
    this.log({
      target: "director",
      id: director.director_id,
      verb: "contact change",
      detail: CONTACT_FIELDS[field],
      by,
    });
    return change;
  }

  change(director: Director, id: string | undefined): ContactChange {
    const found = this.changes.find(
      (item) => item.change_id === id && item.director_id === director.director_id,
    );
    if (!found) throw new Refused(404, "not_found", SAY.change);
    return found;
  }

  changeFiled(
    director: Director,
    change: ContactChange,
    input: Record<string, unknown>,
    by: Staff,
  ): ContactChange {
    if (change.filed) throw new Refused(409, "invalid", SAY.filedAlready);
    const day = clean(input.filed_on, 10);
    if (!isDay(day)) throw new Refused(400, "invalid", SAY.notADay);
    this.#notFuture(day);
    change.filed = { on: day, srn: cleanText(input.srn, LIMIT.srn) };
    this.#saveChanges();
    this.log({
      target: "director",
      id: director.director_id,
      verb: "contact change filed",
      detail: CONTACT_FIELDS[change.field],
      by,
    });
    return change;
  }

  changesOf(directorId: string): ContactChange[] {
    return this.changes
      .filter((change) => change.director_id === directorId)
      .sort((a, b) => b.changed_on.localeCompare(a.changed_on) || b.at.localeCompare(a.at));
  }
}

function flatDirector(director: Director): Record<string, string> {
  return {
    name: director.name,
    din: director.din,
    din_allotted_on: director.din_allotted_on ?? "",
    designation: director.designation,
    appointed_on: director.appointed_on ?? "",
    is_founder: director.is_founder ? "yes" : "no",
    dsc_expires_on: director.dsc.expires_on ?? "",
    dsc_kept: director.dsc.kept,
    kyc_filed_on: director.kyc.last_filed_on ?? "",
    kyc_srn: director.kyc.srn,
  };
}
