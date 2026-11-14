/**
 * The people ledger, kept whole in `people/people.json` (rewritten on every change) with one
 * line per change in `people/events.jsonl`. An event says what changed and never an amount:
 * the stipend's figures stay in the ledger itself, for the Owner's eyes only.
 *
 * Nothing is deleted. A payment is withdrawn with a reason and stays, struck through, and its
 * month is owed again; a grant is revoked or marked never held; an engagement ends once every
 * grant is revoked or never held after offboarding starts, and the person stays in the list.
 */

import { randomUUID } from "node:crypto";

import { Refused } from "../../mail-merge/engine";
import type { DataCore, DueItem } from "../core";
import { addDays } from "../days";
import { clean, cleanText, isDay, normaliseEmail } from "../guard";
import type { Staff } from "../protocol";
import {
  DOCUMENT_KINDS,
  ENGAGEMENT_KINDS,
  EVALUATIONS,
  LETTER_KINDS,
  OUTCOMES_FOR,
  REVOKE_CRITICAL,
  REVOKE_OTHER,
  moneyText,
  periodMonth,
  periodWords,
} from "../../../src/lib/data/labels-people";
import { engagementMonths, endOf, evaluationDays, revokeBy, stipendDueOn } from "./dates";
import {
  AMOUNT_MAX,
  EVALUATION_LEAD_DAYS,
  LETTER_LEAD_DAYS,
  PEOPLE_LIMITS,
  PEOPLE_TOTALS,
  PIN_PATTERN,
  STIPEND_LEAD_DAYS,
  STIPEND_MAX,
} from "./limits";
import type {
  AccessGrant,
  EngagementKind,
  Evaluation,
  PeopleEvent,
  PersonCopy,
  Person,
  PersonDocument,
  PersonState,
  StipendPayment,
  StipendPeriod,
  Stipend,
} from "./types";

const PEOPLE = "people/people.json";
const EVENTS = "people/events.jsonl";

const NOT_A_DAY = "That is not a day.";
const FUTURE = "That day is in the future.";
const STIPEND_WORDS = "Type the stipend as a number, such as 15000.";
const AMOUNT_WORDS = "Type the amount as a number, such as 15000.";
const PAYS_ON_REFUSAL = "Choose a day from 1 to 28, or the month's last day.";
const atMost = (total: number) => `Data holds ${total.toLocaleString("en-GB")} at most.`;

type Input = Record<string, unknown>;
type Which = keyof typeof EVALUATIONS;

const has = (input: Input, name: string) => Object.prototype.hasOwnProperty.call(input, name);
const recordOf = (value: unknown): Input =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Input) : {};
const isKind = (value: string): value is EngagementKind => value in ENGAGEMENT_KINDS;
const isDocumentKind = (value: string): value is PersonDocument["kind"] => value in DOCUMENT_KINDS;
const isCurrency = (value: string): value is Stipend["currency"] =>
  value === "INR" || value === "USD";
export const isWhich = (value: string | undefined): value is Which =>
  value === "midpoint" || value === "final";

/** A tick from a form or a JSON body. */
export const ticked = (value: unknown): boolean =>
  value === true || value === "1" || value === "on" || value === "true" || value === "yes";

/** A whole number typed as a number or as text ("15,000", "₹15000"); null when it is not one. */
export function wholeAmount(value: unknown): number | null {
  if (typeof value === "number") return Number.isSafeInteger(value) ? value : null;
  if (typeof value !== "string") return null;
  const text = value.replace(/[\s,₹$]/g, "");
  if (!/^\d{1,16}$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

const blank = (value: unknown): boolean =>
  value === undefined || value === null || (typeof value === "string" && value.trim() === "");

/** A typed day: null when left blank; refused when it is not a day or (by default) after today. */
function dayOrNull(value: unknown, today: string, future = false): string | null {
  if (blank(value)) return null;
  const day = clean(value, 10);
  if (!isDay(day)) throw new Refused(400, "invalid", NOT_A_DAY);
  if (!future && day > today) throw new Refused(400, "invalid", FUTURE);
  return day;
}

// ------------------------------------------------------------------ what a record says

export const isLetter = (document: PersonDocument): boolean =>
  (LETTER_KINDS as readonly string[]).includes(document.kind);

/** The latest signed letter's day (appointment, internship or contractor), or null. */
export function letterSignedOn(person: Person, onOrBefore?: string): string | null {
  let found: string | null = null;
  for (const document of person.documents)
    if (
      isLetter(document) &&
      document.signed_on &&
      (!onOrBefore || document.signed_on <= onOrBefore) &&
      (!found || document.signed_on > found)
    )
      found = document.signed_on;
  return found;
}

/** The first day IP was assigned in writing: a signed IP assignment, or a signed letter with IP. */
export function ipSignedOn(person: Person, onOrBefore?: string): string | null {
  let found: string | null = null;
  for (const document of person.documents)
    if (
      (document.kind === "ip_assignment" || (isLetter(document) && document.includes_ip)) &&
      document.signed_on &&
      (!onOrBefore || document.signed_on <= onOrBefore) &&
      (!found || document.signed_on < found)
    )
      found = document.signed_on;
  return found;
}

export function stateOf(person: Person, today: string): PersonState {
  if (person.ended_on !== null && person.ended_on <= today) return "ended";
  if (person.offboarding) return "offboarding";
  if (person.starts_on > today) return "starting";
  return "engaged";
}

/** Engaged on a day: started, not ended, and the last day not before it. */
export function engagedOn(person: Person, day: string): boolean {
  const state = stateOf(person, day);
  if (state !== "engaged" && state !== "offboarding") return false;
  const end = endOf(person);
  return end === null || end >= day;
}

/** Grants still held: neither revoked nor never held. */
export const heldGrants = (person: Person): AccessGrant[] =>
  person.access.filter((grant) => grant.revoked_on === null && !grant.never_had);

/** Once offboarding has started, each grant still held and the day it must be revoked by. */
export function deadlinesOf(person: Person): { access_id: string; by: string }[] {
  const lastDay = person.offboarding?.last_day;
  if (!lastDay) return [];
  return heldGrants(person).map((grant) => ({
    access_id: grant.access_id,
    by: revokeBy(lastDay, grant.critical),
  }));
}

const livePayment = (payment: StipendPayment): boolean => payment.withdrawn === null;

/** Each month of the stipend with its due day and payments; open while nothing live pays it. */
export function periodsOf(person: Person, today: string): StipendPeriod[] {
  const months = person.stipend ? engagementMonths(person, today) : [];
  const all = [...new Set([...months, ...person.payments.map((payment) => payment.period)])].sort();
  return all.map((period) => {
    const paid = person.payments
      .filter((payment) => payment.period === period)
      .sort((a, b) => a.paid_on.localeCompare(b.paid_on) || a.at.localeCompare(b.at));
    return {
      period,
      due_on: person.stipend ? stipendDueOn(period, person.stipend.pays_on) : null,
      paid,
      open: person.stipend !== null && months.includes(period) && !paid.some(livePayment),
    };
  });
}

/** The evaluations still owed, in order; the midpoint is moot once the final is held. */
function owedEvaluations(person: Person): { which: Which; evaluation: Evaluation }[] {
  const { midpoint, final } = person.evaluations;
  const owed: { which: Which; evaluation: Evaluation }[] = [];
  if (midpoint.held_on === null && final.held_on === null && midpoint.due_on)
    owed.push({ which: "midpoint", evaluation: midpoint });
  if (final.held_on === null && final.due_on) owed.push({ which: "final", evaluation: final });
  return owed;
}

export const WARNINGS = {
  noLetter: "No signed letter yet.",
  accessFirst:
    "Access was granted before a signed IP assignment. The usual control is documents before access.",
  finalDue: "The final evaluation is due; the certificate follows it.",
} as const;

export function warningsOf(person: Person, today: string): string[] {
  const warnings: string[] = [];
  if (stateOf(person, today) !== "ended" && !letterSignedOn(person))
    warnings.push(WARNINGS.noLetter);
  if (person.kind === "intern" || person.kind === "contractor") {
    const ipOn = ipSignedOn(person);
    const early = person.access.some(
      (grant) =>
        !grant.never_had &&
        (ipOn === null || (grant.granted_on !== null && grant.granted_on < ipOn)),
    );
    if (early) warnings.push(WARNINGS.accessFirst);
  }
  const final = person.evaluations.final;
  if (
    person.kind === "intern" &&
    final.held_on === null &&
    final.due_on !== null &&
    final.due_on <= today
  )
    warnings.push(WARNINGS.finalDue);
  return warnings;
}

/** What comes next for the People page: the earliest owed thing, or null. */
export function nextOf(person: Person, today: string): { what: string; on: string } | null {
  const candidates: { what: string; on: string }[] = [];
  const deadlines = deadlinesOf(person);
  if (deadlines.length > 0)
    candidates.push({
      what: `Revoke ${deadlines.length} ${deadlines.length === 1 ? "system" : "systems"}`,
      on: deadlines.map((item) => item.by).sort()[0]!,
    });
  const open = periodsOf(person, today).find((period) => period.open && period.due_on);
  if (open?.due_on)
    candidates.push({ what: `Stipend for ${periodMonth(open.period)}`, on: open.due_on });
  if (stateOf(person, today) !== "ended")
    for (const { which, evaluation } of owedEvaluations(person))
      candidates.push({ what: `${EVALUATIONS[which]} evaluation`, on: evaluation.due_on! });
  candidates.sort((a, b) => a.on.localeCompare(b.on));
  return candidates[0] ?? null;
}

/** The person's rows on Due: every one for the Owner only. */
export function dueRowsOf(person: Person, today: string): DueItem[] {
  const rows: DueItem[] = [];
  const id = person.person_id;
  const href = `/data/people/${id}`;
  const row = (key: string, title: string, sub: string, due_on: string): DueItem => ({
    key: `person:${id}:${key}`,
    kind: "person",
    title,
    sub,
    due_on,
    href,
    owner_only: true,
  });
  for (const deadline of deadlinesOf(person)) {
    const grant = person.access.find((item) => item.access_id === deadline.access_id);
    if (!grant) continue;
    rows.push(
      row(
        `access:${grant.access_id}`,
        `Revoke ${grant.system} for ${person.name}`,
        grant.critical ? REVOKE_CRITICAL : REVOKE_OTHER,
        deadline.by,
      ),
    );
  }
  if (person.stipend)
    for (const period of periodsOf(person, today))
      if (period.open && period.due_on && addDays(period.due_on, -STIPEND_LEAD_DAYS) <= today)
        rows.push(
          row(
            `stipend:${period.period}`,
            `Pay ${person.name}'s stipend for ${periodWords(period.period)}`,
            moneyText(person.stipend.amount, person.stipend.currency),
            period.due_on,
          ),
        );
  const state = stateOf(person, today);
  if (state !== "ended") {
    for (const { which, evaluation } of owedEvaluations(person))
      if (addDays(evaluation.due_on!, -EVALUATION_LEAD_DAYS) <= today)
        rows.push(
          row(
            which,
            `${EVALUATIONS[which]} evaluation: ${person.name}`,
            person.mentor ? `With ${person.mentor}` : "No mentor named",
            evaluation.due_on!,
          ),
        );
    const soon = state !== "starting" || person.starts_on <= addDays(today, LETTER_LEAD_DAYS);
    if (soon && !letterSignedOn(person))
      rows.push(
        row("letter", `Signed letter for ${person.name}`, "Before the first day", person.starts_on),
      );
  }
  return rows;
}

// ------------------------------------------------------------------ the book

const copyOrNull = (value: unknown): PersonCopy | null =>
  value && typeof value === "object" && typeof (value as PersonCopy).copy_id === "string"
    ? (value as PersonCopy)
    : null;

const EMPTY_EVALUATION = (due_on: string | null): Evaluation => ({
  due_on,
  held_on: null,
  by_name: "",
  outcome: "",
  summary: "",
});

/** The fields an edit may change, in the activity's words (never their values). */
const FIELD_WORDS: Record<string, string> = {
  name: "name",
  email: "email",
  kind: "kind",
  role_title: "role",
  starts_on: "first day",
  ends_on: "last day",
  mentor: "mentor",
  brief: "brief",
  stipend: "stipend",
  notes: "notes",
};

export type DocumentFields = Pick<
  PersonDocument,
  "kind" | "title" | "signed_on" | "includes_ip" | "includes_confidentiality"
>;

export class PeopleBook {
  readonly #core: DataCore;
  people: Person[];
  events: PeopleEvent[];

  constructor(core: DataCore) {
    this.#core = core;
    core.store.ensureDir("people");
    const stored = core.store.readJson<{ people?: Person[] }>(PEOPLE, {});
    this.people = Array.isArray(stored.people)
      ? stored.people.filter(
          (person) =>
            typeof person?.person_id === "string" &&
            isDay(person.starts_on) &&
            isKind(String(person.kind)),
        )
      : [];
    // A record written before the ledger kept its own copies (a link into Files) reads as no copy.
    for (const person of this.people) {
      for (const document of person.documents) document.copy = copyOrNull(document.copy);
      if (person.certificate) person.certificate.copy = copyOrNull(person.certificate.copy);
    }
    this.events = core.store
      .readLines<PeopleEvent>(EVENTS)
      .filter((event) => typeof event?.event_id === "string");
  }

  // ---------------------------------------------------------------- files

  save(): void {
    this.#core.store.writeJson(PEOPLE, { format: 1, people: this.people });
  }

  /** One line of what changed: the detail is words and days, never an amount. */
  event(person: Person, verb: string, detail: string, by: Staff): void {
    const event: PeopleEvent = {
      event_id: randomUUID(),
      person_id: person.person_id,
      verb,
      detail,
      by,
      at: this.#core.now(),
    };
    this.events.push(event);
    this.#core.store.appendLine(EVENTS, event);
  }

  /** What happened to one person, newest first. */
  eventsOf(personId: string): PeopleEvent[] {
    return this.events
      .filter((event) => event.person_id === personId)
      .reverse()
      .sort((a, b) => b.at.localeCompare(a.at));
  }

  #touch(person: Person, by: Staff): void {
    person.updated_at = this.#core.now();
    person.updated_by = by;
  }

  /** One of the person's copies (a document's or the certificate's), or 404. */
  copy(person: Person, copyId: string | undefined): PersonCopy {
    const copies = [
      ...person.documents.map((document) => document.copy),
      person.certificate?.copy ?? null,
    ];
    const copy = copyId ? copies.find((item) => item?.copy_id === copyId) : undefined;
    if (!copy) throw new Refused(404, "not_found", "That copy is not in the ledger.");
    return copy;
  }

  person(id: string | undefined): Person {
    const person = id ? this.people.find((item) => item.person_id === id) : undefined;
    if (!person) throw new Refused(404, "not_found", "That person is not in the ledger.");
    return person;
  }

  // ---------------------------------------------------------------- the person's own fields

  #stipendOf(value: unknown): Stipend | null {
    if (blank(value)) return null;
    const record = recordOf(value);
    if (blank(record.amount)) return null;
    const amount = wholeAmount(record.amount);
    if (amount === null || amount < 1 || amount > STIPEND_MAX)
      throw new Refused(400, "invalid", STIPEND_WORDS);
    const currency = clean(record.currency, 3).toUpperCase() || "INR";
    if (!isCurrency(currency)) throw new Refused(400, "invalid", "Choose rupees or US dollars.");
    const pays = record.pays_on;
    let pays_on: Stipend["pays_on"];
    if (pays === "month_end") pays_on = "month_end";
    else {
      const day = wholeAmount(pays);
      if (day === null || day < 1 || day > 28) throw new Refused(400, "invalid", PAYS_ON_REFUSAL);
      pays_on = day;
    }
    return { amount, currency, pays_on };
  }

  /** The fields given, read over the person's own (or nothing, for a new one), and checked. */
  #fields(input: Input, base: Person | null) {
    const name = has(input, "name")
      ? cleanText(input.name, PEOPLE_LIMITS.name)
      : (base?.name ?? "");
    if (!name) throw new Refused(400, "invalid", "Give the person's name.");
    let email = base?.email ?? "";
    if (has(input, "email")) {
      const typed = clean(input.email, 254);
      email = typed ? normaliseEmail(typed) : "";
      if (typed && !email) throw new Refused(400, "invalid", "That is not an email address.");
    }
    const kind = has(input, "kind") ? clean(input.kind, 20) : (base?.kind ?? "");
    if (!isKind(kind)) throw new Refused(400, "invalid", "Choose intern, employee or contractor.");
    const role_title = has(input, "role_title")
      ? cleanText(input.role_title, PEOPLE_LIMITS.role_title)
      : (base?.role_title ?? "");
    const mentor = has(input, "mentor")
      ? cleanText(input.mentor, PEOPLE_LIMITS.mentor)
      : (base?.mentor ?? "");
    const typedStart = has(input, "starts_on") ? clean(input.starts_on, 10) : base?.starts_on;
    if (!typedStart) throw new Refused(400, "invalid", "Give the first day.");
    if (!isDay(typedStart)) throw new Refused(400, "invalid", NOT_A_DAY);
    const starts_on = typedStart;
    let ends_on = base?.ends_on ?? null;
    if (has(input, "ends_on")) {
      const typed = clean(input.ends_on, 10);
      if (typed && !isDay(typed)) throw new Refused(400, "invalid", NOT_A_DAY);
      ends_on = typed || null;
    }
    if (ends_on !== null && ends_on < starts_on)
      throw new Refused(400, "invalid", "It cannot end before it starts.");
    if (ends_on === null && kind !== "employee")
      throw new Refused(400, "invalid", "An internship or a contract needs an end day.");
    const brief = has(input, "brief")
      ? cleanText(input.brief, PEOPLE_LIMITS.brief)
      : (base?.brief ?? "");
    const notes = has(input, "notes")
      ? cleanText(input.notes, PEOPLE_LIMITS.notes)
      : (base?.notes ?? "");
    const stipend = has(input, "stipend")
      ? this.#stipendOf(input.stipend)
      : (base?.stipend ?? null);
    return { name, email, kind, role_title, starts_on, ends_on, mentor, brief, notes, stipend };
  }

  /** The worked-out evaluation days follow the dates; a day he moved by hand stays. */
  #rework(person: Person, before: { midpoint: string | null; final: string | null }): void {
    const after = evaluationDays(person);
    for (const which of ["midpoint", "final"] as const) {
      const evaluation = person.evaluations[which];
      if (evaluation.held_on === null && evaluation.due_on === before[which])
        evaluation.due_on = after[which];
    }
  }

  /** Ended once offboarding has started and every grant is revoked or was never held. */
  #settle(person: Person, by: Staff): void {
    const was = person.ended_on;
    const lastDay = person.offboarding?.last_day ?? null;
    person.ended_on = lastDay && heldGrants(person).length === 0 ? lastDay : null;
    if (person.ended_on && person.ended_on !== was)
      this.event(person, "ended", person.ended_on, by);
  }

  add(input: Input, by: Staff, personId: string = randomUUID()): Person {
    if (this.people.length >= PEOPLE_TOTALS.people)
      throw new Refused(400, "invalid", atMost(PEOPLE_TOTALS.people));
    const fields = this.#fields(input, null);
    const now = this.#core.now();
    const days = evaluationDays({ ...fields, offboarding: null });
    const person: Person = {
      person_id: personId,
      ...fields,
      documents: [],
      evaluations: {
        midpoint: EMPTY_EVALUATION(days.midpoint),
        final: EMPTY_EVALUATION(days.final),
      },
      certificate: null,
      access: [],
      offboarding: null,
      ended_on: null,
      hq_staff_id: null,
      payments: [],
      created_at: now,
      created_by: by,
      updated_at: now,
      updated_by: by,
    };
    this.people.push(person);
    this.save();
    this.event(person, "added", ENGAGEMENT_KINDS[person.kind], by);
    return person;
  }

  update(person: Person, input: Input, by: Staff): Person {
    const fields = this.#fields(input, person);
    const before = evaluationDays(person);
    const changed = (Object.keys(fields) as (keyof typeof fields)[]).filter(
      (key) => JSON.stringify(person[key]) !== JSON.stringify(fields[key]),
    );
    if (changed.length === 0) return person;
    Object.assign(person, fields);
    this.#rework(person, before);
    this.#touch(person, by);
    this.save();
    this.event(person, "changed", changed.map((key) => FIELD_WORDS[key] ?? key).join(", "), by);
    return person;
  }

  // ---------------------------------------------------------------- documents and the certificate

  documentFields(person: Person, input: Input, today: string): DocumentFields {
    if (person.documents.length >= PEOPLE_TOTALS.documents)
      throw new Refused(400, "invalid", atMost(PEOPLE_TOTALS.documents));
    const kind = clean(input.kind, 20);
    if (!isDocumentKind(kind)) throw new Refused(400, "invalid", "Choose the kind of document.");
    const title = cleanText(input.title, PEOPLE_LIMITS.document_title);
    if (!title) throw new Refused(400, "invalid", "Give the document a title.");
    return {
      kind,
      title,
      signed_on: dayOrNull(input.signed_on, today),
      includes_ip: ticked(input.includes_ip),
      includes_confidentiality: ticked(input.includes_confidentiality),
    };
  }

  addDocument(person: Person, fields: DocumentFields, copy: PersonCopy | null, by: Staff): Person {
    person.documents.push({
      document_id: randomUUID(),
      ...fields,
      copy,
      at: this.#core.now(),
      by,
    });
    this.#touch(person, by);
    this.save();
    this.event(
      person,
      "document added",
      `${DOCUMENT_KINDS[fields.kind]}: ${fields.title}${fields.signed_on ? `, signed ${fields.signed_on}` : ""}`,
      by,
    );
    return person;
  }

  certificateFields(
    person: Person,
    input: Input,
    today: string,
  ): { number: string; issued_on: string } {
    if (person.evaluations.final.outcome !== "completed")
      throw new Refused(
        409,
        "needs_final",
        "Record the final evaluation as completed first: the certificate follows it.",
      );
    const number = cleanText(input.number, PEOPLE_LIMITS.certificate_number);
    if (!number) throw new Refused(400, "invalid", "Give the certificate's number.");
    const issued_on = dayOrNull(input.issued_on, today);
    if (!issued_on) throw new Refused(400, "invalid", "Give the day it was issued.");
    return { number, issued_on };
  }

  recordCertificate(
    person: Person,
    fields: { number: string; issued_on: string },
    copy: PersonCopy | null,
    by: Staff,
  ): Person {
    person.certificate = { ...fields, copy: copy ?? person.certificate?.copy ?? null };
    this.#touch(person, by);
    this.save();
    this.event(person, "certificate recorded", `${fields.number}, issued ${fields.issued_on}`, by);
    return person;
  }

  // ---------------------------------------------------------------- evaluations

  recordEvaluation(
    person: Person,
    which: string | undefined,
    input: Input,
    by: Staff,
    today: string,
  ): Person {
    if (!isWhich(which))
      throw new Refused(400, "invalid", "Choose the midpoint or the final evaluation.");
    const evaluation = person.evaluations[which];
    const moved = blank(input.due_on) ? null : dayOrNull(input.due_on, today, true);
    const outcome = clean(input.outcome, 20);
    if (!outcome && blank(input.held_on)) {
      if (!moved) throw new Refused(400, "invalid", "Choose how it went.");
      evaluation.due_on = moved;
      this.#touch(person, by);
      this.save();
      this.event(person, "evaluation moved", `${EVALUATIONS[which]}: ${moved}`, by);
      return person;
    }
    if (!(OUTCOMES_FOR[which] as readonly string[]).includes(outcome))
      throw new Refused(400, "invalid", "Choose how it went.");
    const held_on = dayOrNull(input.held_on, today) ?? today;
    evaluation.held_on = held_on;
    evaluation.outcome = outcome as Evaluation["outcome"];
    evaluation.by_name = has(input, "by_name")
      ? cleanText(input.by_name, PEOPLE_LIMITS.mentor)
      : evaluation.by_name || person.mentor;
    evaluation.summary = cleanText(input.summary, PEOPLE_LIMITS.summary);
    if (moved) evaluation.due_on = moved;
    this.#touch(person, by);
    this.save();
    this.event(person, "evaluation recorded", `${EVALUATIONS[which]}, held ${held_on}`, by);
    return person;
  }

  // ---------------------------------------------------------------- the stipend ledger

  recordPayment(person: Person, input: Input, by: Staff, today: string): Person {
    const total = this.people.reduce((sum, item) => sum + item.payments.length, 0);
    if (total >= PEOPLE_TOTALS.payments)
      throw new Refused(400, "invalid", atMost(PEOPLE_TOTALS.payments));
    const period = clean(input.period, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))
      throw new Refused(400, "invalid", "Choose the month it pays for.");
    if (!engagementMonths(person, today).includes(period))
      throw new Refused(400, "invalid", `That month is outside ${person.name}'s engagement.`);
    const amount = wholeAmount(input.amount);
    if (amount === null || amount < 1 || amount > AMOUNT_MAX)
      throw new Refused(400, "invalid", AMOUNT_WORDS);
    const currency = clean(input.currency, 3).toUpperCase() || person.stipend?.currency || "INR";
    if (!isCurrency(currency)) throw new Refused(400, "invalid", "Choose rupees or US dollars.");
    const paid_on = dayOrNull(input.paid_on, today);
    if (!paid_on) throw new Refused(400, "invalid", "Give the day it was paid.");
    const reference = cleanText(input.reference, PEOPLE_LIMITS.reference);
    if (PIN_PATTERN.test(reference))
      throw new Refused(400, "invalid", "Write the bank's reference, never a password.");
    let tds_deducted: number | null = null;
    if (!blank(input.tds_deducted)) {
      tds_deducted = wholeAmount(input.tds_deducted);
      if (tds_deducted === null || tds_deducted > AMOUNT_MAX)
        throw new Refused(400, "invalid", "Type the TDS deducted as a number, or leave it empty.");
    }
    const note = cleanText(input.note, PEOPLE_LIMITS.payment_note);
    person.payments.push({
      payment_id: randomUUID(),
      period,
      amount,
      currency,
      paid_on,
      reference,
      tds_deducted,
      note,
      at: this.#core.now(),
      by,
      withdrawn: null,
    });
    this.#touch(person, by);
    this.save();
    this.event(person, "payment recorded", `${period}, paid ${paid_on}`, by);
    return person;
  }

  withdrawPayment(person: Person, paymentId: string | undefined, input: Input, by: Staff): Person {
    const payment = paymentId
      ? person.payments.find((item) => item.payment_id === paymentId)
      : undefined;
    if (!payment) throw new Refused(404, "not_found", "That payment is not here.");
    if (payment.withdrawn)
      throw new Refused(409, "withdrawn", "That payment is withdrawn already.");
    const why = cleanText(input.why, PEOPLE_LIMITS.why);
    if (!why) throw new Refused(400, "invalid", "Say why it is withdrawn.");
    payment.withdrawn = { at: this.#core.now(), by, why };
    this.#touch(person, by);
    this.save();
    this.event(person, "payment withdrawn", `${payment.period}: ${why}`, by);
    return person;
  }

  // ---------------------------------------------------------------- access and offboarding

  grant(person: Person, accessId: string | undefined): AccessGrant {
    const grant = accessId ? person.access.find((item) => item.access_id === accessId) : undefined;
    if (!grant) throw new Refused(404, "not_found", "That access is not on this person.");
    return grant;
  }

  grantAccess(person: Person, input: Input, by: Staff, today: string): Person {
    if (person.access.length >= PEOPLE_TOTALS.access)
      throw new Refused(400, "invalid", atMost(PEOPLE_TOTALS.access));
    const system = cleanText(input.system, PEOPLE_LIMITS.system);
    if (!system) throw new Refused(400, "invalid", "Name the system.");
    const grant: AccessGrant = {
      access_id: randomUUID(),
      system,
      level: cleanText(input.level, PEOPLE_LIMITS.level),
      critical: ticked(input.critical),
      granted_on: dayOrNull(input.granted_on, today),
      revoked_on: null,
      never_had: false,
      notes: cleanText(input.notes, PEOPLE_LIMITS.access_notes),
    };
    person.access.push(grant);
    this.#settle(person, by);
    this.#touch(person, by);
    this.save();
    this.event(person, "access granted", `${system}${grant.critical ? " (critical)" : ""}`, by);
    return person;
  }

  revokeAccess(
    person: Person,
    accessId: string | undefined,
    input: Input,
    by: Staff,
    today: string,
  ): Person {
    const grant = this.grant(person, accessId);
    if (grant.revoked_on || grant.never_had)
      throw new Refused(409, "revoked", "That access is revoked already.");
    const on = dayOrNull(input.on, today) ?? today;
    if (grant.granted_on && on < grant.granted_on)
      throw new Refused(400, "invalid", "It cannot be revoked before it was granted.");
    grant.revoked_on = on;
    this.event(person, "access revoked", `${grant.system} on ${on}`, by);
    this.#settle(person, by);
    this.#touch(person, by);
    this.save();
    return person;
  }

  neverHad(person: Person, accessId: string | undefined, by: Staff): Person {
    const grant = this.grant(person, accessId);
    if (grant.revoked_on || grant.never_had)
      throw new Refused(409, "revoked", "That access is revoked already.");
    grant.never_had = true;
    this.event(person, "never had", grant.system, by);
    this.#settle(person, by);
    this.#touch(person, by);
    this.save();
    return person;
  }

  startOffboarding(person: Person, input: Input, by: Staff): Person {
    const lastDay = clean(input.last_day, 10);
    if (!isDay(lastDay)) throw new Refused(400, "invalid", "Give the last working day.");
    if (lastDay < person.starts_on)
      throw new Refused(400, "invalid", "The last day cannot be before the first day.");
    const before = evaluationDays(person);
    person.offboarding = person.offboarding
      ? { ...person.offboarding, last_day: lastDay }
      : { last_day: lastDay, started_at: this.#core.now(), started_by: by };
    this.#rework(person, before);
    this.event(person, "offboarding started", `Last day ${lastDay}`, by);
    this.#settle(person, by);
    this.#touch(person, by);
    this.save();
    return person;
  }

  cancelOffboarding(person: Person, by: Staff): Person {
    const offboarding = person.offboarding;
    if (!offboarding) throw new Refused(409, "not_offboarding", "Offboarding has not started.");
    const revoked = this.events.some(
      (event) =>
        event.person_id === person.person_id &&
        event.verb === "access revoked" &&
        event.at >= offboarding.started_at,
    );
    if (revoked)
      throw new Refused(
        409,
        "offboarding_moved",
        "Access has been revoked since; the offboarding stays.",
      );
    const before = evaluationDays(person);
    person.offboarding = null;
    this.#rework(person, before);
    this.#settle(person, by);
    this.#touch(person, by);
    this.save();
    this.event(person, "offboarding cancelled", "", by);
    return person;
  }

  // ---------------------------------------------------------------- the walk

  /** Give a person the walk's fixed id, once (test routes only). */
  pin(id: string, to: string): Person {
    const already = this.people.find((item) => item.person_id === to);
    if (already) return already;
    const person = this.person(id);
    person.person_id = to;
    for (const event of this.events) if (event.person_id === id) event.person_id = to;
    this.save();
    this.#core.store.writeText(
      EVENTS,
      this.events.map((event) => JSON.stringify(event)).join("\n") +
        (this.events.length ? "\n" : ""),
    );
    return person;
  }
}
