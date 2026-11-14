/**
 * Notes, the Investor FAQ and decisions, each kept whole in its own file under `notes/`
 * (rewritten on every change) with one line per change in `notes/events.jsonl`.
 *
 * A note taken back stays, muted: it leaves Due, the agenda, search and the FAQ's counts,
 * and restoring it brings it back to all four. Objections are matched by their text when
 * a note is edited, so a line he keeps keeps its FAQ answer. A note has at most one
 * decision; a decision is replaced only by a decided one, and only once.
 */

import { randomUUID } from "node:crypto";

import { Refused } from "../../mail-merge/engine";
import type { DataCore } from "../core";
import { clean, cleanText, isDay, isUuid } from "../guard";
import type { Staff } from "../protocol";
import { RAISE_SERVICES, type InvestorsRaise } from "../raise-contracts";
import { DECISION_STATUSES, NOTE_KINDS } from "../../../src/lib/data/labels";
import { NOTE_LIMITS, NOTE_TOTALS } from "./limits";
import type {
  ActionItem,
  Decision,
  DecisionStatus,
  FaqEntry,
  Note,
  NoteKind,
  NoteSubject,
  NotesEvent,
  Objection,
} from "./types";

const NOTES = "notes/notes.json";
const FAQ = "notes/faq.json";
const DECISIONS = "notes/decisions.json";
const EVENTS = "notes/events.jsonl";

/** An investor firm's id: 32 hex, `sha256("investor:" + firm key)`. */
const INVESTOR_ID = /^[0-9a-f]{32}$/;

const NOT_A_DAY = "That is not a day.";
const NO_FIRM = "Say which firm the note is about.";
const atMost = (total: number) => `Data holds ${total.toLocaleString("en-GB")} at most.`;

type Input = Record<string, unknown>;

const has = (input: Input, name: string) => Object.prototype.hasOwnProperty.call(input, name);
const isKind = (value: string): value is NoteKind => value in NOTE_KINDS;
const isStatus = (value: string): value is DecisionStatus => value in DECISION_STATUSES;
const recordOf = (value: unknown): Input =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Input) : {};

/** The firm's own page. */
export function firmHref(subject: NoteSubject): string {
  return subject.kind === "investor"
    ? `/data/investors/${subject.id}`
    : `/data/waitlist/${subject.id}`;
}

export const isLive = (note: Note): boolean => note.withdrawn === null;

export const openActions = (note: Note): ActionItem[] =>
  note.actions.filter((action) => action.state === "open");

/** Decisions newest first: by the day decided (undated last), then by when written. */
export function byDecidedOn(a: Decision, b: Decision): number {
  if (a.decided_on !== b.decided_on) {
    if (a.decided_on === null) return 1;
    if (b.decided_on === null) return -1;
    return b.decided_on.localeCompare(a.decided_on);
  }
  return b.created_at.localeCompare(a.created_at);
}

/** Notes newest first: by the day held, then by when written. */
export function byHeldOn(a: Note, b: Note): number {
  return b.held_on.localeCompare(a.held_on) || b.created_at.localeCompare(a.created_at);
}

export class NotesBook {
  readonly #core: DataCore;
  notes: Note[];
  faq: FaqEntry[];
  decisions: Decision[];
  events: NotesEvent[];

  constructor(core: DataCore) {
    this.#core = core;
    core.store.ensureDir("notes");
    const notes = core.store.readJson<{ notes?: Note[] }>(NOTES, {});
    this.notes = Array.isArray(notes.notes)
      ? notes.notes.filter(
          (note) => typeof note?.note_id === "string" && isDay(note.held_on) && note.subject,
        )
      : [];
    const faq = core.store.readJson<{ entries?: FaqEntry[] }>(FAQ, {});
    this.faq = Array.isArray(faq.entries)
      ? faq.entries.filter((entry) => typeof entry?.faq_id === "string")
      : [];
    const decisions = core.store.readJson<{ decisions?: Decision[] }>(DECISIONS, {});
    this.decisions = Array.isArray(decisions.decisions)
      ? decisions.decisions.filter(
          (decision) =>
            typeof decision?.decision_id === "string" && isStatus(String(decision.status)),
        )
      : [];
    this.events = core.store
      .readLines<NotesEvent>(EVENTS)
      .filter((event) => typeof event?.event_id === "string");
  }

  // ---------------------------------------------------------------- files

  saveNotes(): void {
    this.#core.store.writeJson(NOTES, { format: 1, notes: this.notes });
  }

  saveFaq(): void {
    this.#core.store.writeJson(FAQ, { format: 1, entries: this.faq });
  }

  saveDecisions(): void {
    this.#core.store.writeJson(DECISIONS, { format: 1, decisions: this.decisions });
  }

  event(target: NotesEvent["target"], id: string, verb: string, detail: string, by: Staff): void {
    const event: NotesEvent = {
      event_id: randomUUID(),
      target,
      id,
      verb,
      detail,
      by,
      at: this.#core.now(),
    };
    this.events.push(event);
    this.#core.store.appendLine(EVENTS, event);
  }

  /** What happened to one record, newest first. */
  eventsOf(target: NotesEvent["target"], id: string): NotesEvent[] {
    // Appended in order, so reversed first: two in the same millisecond stay newest first.
    return this.events
      .filter((event) => event.target === target && event.id === id)
      .reverse()
      .sort((a, b) => b.at.localeCompare(a.at));
  }

  #touch(record: { updated_at: string; updated_by: Staff }, by: Staff): void {
    record.updated_at = this.#core.now();
    record.updated_by = by;
  }

  // ---------------------------------------------------------------- lookups

  note(id: string | undefined): Note {
    const note = id ? this.notes.find((item) => item.note_id === id) : undefined;
    if (!note) throw new Refused(404, "not_found", "That note is not here.");
    return note;
  }

  faqEntry(id: string | undefined): FaqEntry {
    const entry = id ? this.faq.find((item) => item.faq_id === id) : undefined;
    if (!entry) throw new Refused(404, "not_found", "That question is not in the FAQ.");
    return entry;
  }

  decision(id: string | undefined): Decision {
    const decision = id ? this.decisions.find((item) => item.decision_id === id) : undefined;
    if (!decision) throw new Refused(404, "not_found", "That decision is not here.");
    return decision;
  }

  action(note: Note, id: string | undefined): ActionItem {
    const action = id ? note.actions.find((item) => item.action_id === id) : undefined;
    if (!action) throw new Refused(404, "not_found", "That action is not on this note.");
    return action;
  }

  /** How often a question was asked: live objections linked to it, and the firms they came from. */
  asked(faqId: string): { asked: number; firms: number } {
    let asked = 0;
    const firms = new Set<string>();
    for (const note of this.notes) {
      if (!isLive(note)) continue;
      for (const objection of note.objections)
        if (objection.faq_id === faqId) {
          asked += 1;
          firms.add(`${note.subject.kind}:${note.subject.id}`);
        }
    }
    return { asked, firms: firms.size };
  }

  // ---------------------------------------------------------------- the fields

  /**
   * The firm a note is about. An investor firm is checked against the investors module
   * when it is here, and its own name is used; otherwise the name the page sent is kept.
   */
  subjectOf(input: Input): { subject: NoteSubject; name: string } {
    const kind = clean(input.subject_kind, 20);
    const id = clean(input.subject_id, 64).toLowerCase();
    if (!((kind === "investor" && INVESTOR_ID.test(id)) || (kind === "waitlist" && isUuid(id))))
      throw new Refused(400, "invalid", NO_FIRM);
    let name = cleanText(input.subject_name, NOTE_LIMITS.subject_name);
    if (kind === "investor") {
      const raise = this.#core.need<InvestorsRaise>(RAISE_SERVICES.investorsRaise);
      if (raise) {
        const real = raise.name(id);
        if (real === null) throw new Refused(404, "not_found", "That firm is not here.");
        name = real;
      }
    }
    if (!name) throw new Refused(400, "invalid", NO_FIRM);
    return { subject: { kind, id }, name };
  }

  #noteFields(input: Input, base: Partial<Note>, today: string) {
    const kind = has(input, "kind") ? clean(input.kind, 20) : (base.kind ?? "");
    if (!isKind(kind)) throw new Refused(400, "invalid", "Choose the kind of note.");
    const typedDay = has(input, "held_on") ? clean(input.held_on, 10) : "";
    const held_on = typedDay || base.held_on || today;
    if (!isDay(held_on)) throw new Refused(400, "invalid", NOT_A_DAY);
    if (held_on > today) throw new Refused(400, "invalid", "That day is in the future.");
    const title = has(input, "title")
      ? cleanText(input.title, NOTE_LIMITS.title)
      : (base.title ?? "");
    if (!title) throw new Refused(400, "invalid", "Give the note a title.");
    const body = has(input, "body") ? cleanText(input.body, NOTE_LIMITS.body) : (base.body ?? "");
    const people = has(input, "people")
      ? cleanText(input.people, NOTE_LIMITS.people)
      : (base.people ?? "");
    return { kind, held_on, title, body, people };
  }

  /** One objection per line, empties dropped, ten at most. */
  #objectionLines(value: unknown): string[] {
    const text = Array.isArray(value)
      ? value.filter((line) => typeof line === "string").join("\n")
      : clean(value, 20_000);
    const lines = text
      .split(/\r?\n/)
      .map((line) => cleanText(line, NOTE_LIMITS.objection))
      .filter(Boolean);
    if (lines.length > NOTE_LIMITS.objections)
      throw new Refused(400, "invalid", "Ten objections at most on one note.");
    return lines;
  }

  /** One action from a form's row, or null for a row left blank. A new one may not be due before today. */
  #actionOf(input: Input, today: string, by: Staff): ActionItem | null {
    const title = cleanText(input.title, NOTE_LIMITS.action_title);
    const due = clean(input.due_on, 10);
    const owner = cleanText(input.owner, NOTE_LIMITS.owner);
    if (!title && !due && !owner) return null;
    if (!title) throw new Refused(400, "invalid", "Write what each action is.");
    if (due && !isDay(due)) throw new Refused(400, "invalid", NOT_A_DAY);
    if (due && due < today) throw new Refused(400, "invalid", "That day is in the past.");
    return {
      action_id: randomUUID(),
      title,
      due_on: due || null,
      owner,
      state: "open",
      done_at: null,
      done_by: null,
      created_at: this.#core.now(),
      created_by: by,
    };
  }

  // ---------------------------------------------------------------- notes

  addNote(input: Input, by: Staff, today: string, noteId: string = randomUUID()): Note {
    if (this.notes.length >= NOTE_TOTALS.notes)
      throw new Refused(400, "invalid", atMost(NOTE_TOTALS.notes));
    const { subject, name } = this.subjectOf(input);
    const fields = this.#noteFields(input, {}, today);
    const objections: Objection[] = this.#objectionLines(input.objections).map((text) => ({
      objection_id: randomUUID(),
      text,
      faq_id: null,
    }));
    const rows = Array.isArray(input.actions) ? input.actions.slice(0, 40) : [];
    const actions = rows
      .map((row) => this.#actionOf(recordOf(row), today, by))
      .filter((action): action is ActionItem => action !== null);
    if (actions.length > NOTE_LIMITS.actions)
      throw new Refused(400, "invalid", "Ten actions at most on one note.");
    const now = this.#core.now();
    const note: Note = {
      note_id: noteId,
      subject,
      subject_name: name,
      ...fields,
      objections,
      actions,
      decision_id: null,
      created_at: now,
      created_by: by,
      updated_at: now,
      updated_by: by,
      withdrawn: null,
    };
    this.notes.push(note);
    this.saveNotes();
    this.event("note", note.note_id, "added", note.title, by);
    return note;
  }

  /** Objections are matched by text: a line he kept keeps its id and its FAQ answer. */
  updateNote(note: Note, input: Input, by: Staff, today: string): Note {
    const fields = this.#noteFields(input, note, today);
    let objections = note.objections;
    if (has(input, "objections")) {
      const pool = [...note.objections];
      objections = this.#objectionLines(input.objections).map((text) => {
        const index = pool.findIndex((objection) => objection.text === text);
        return index >= 0
          ? pool.splice(index, 1)[0]!
          : { objection_id: randomUUID(), text, faq_id: null };
      });
    }
    const changed = [
      ...(Object.keys(fields) as (keyof typeof fields)[]).filter(
        (key) => note[key] !== fields[key],
      ),
      ...(objections.map((item) => item.text).join("\n") !==
      note.objections.map((item) => item.text).join("\n")
        ? ["objections"]
        : []),
    ];
    Object.assign(note, fields);
    note.objections = objections;
    this.#touch(note, by);
    this.saveNotes();
    if (changed.length) this.event("note", note.note_id, "changed", changed.join(", "), by);
    return note;
  }

  withdraw(note: Note, by: Staff): Note {
    if (note.withdrawn) return note;
    note.withdrawn = { at: this.#core.now(), by };
    this.#touch(note, by);
    this.saveNotes();
    this.event("note", note.note_id, "withdrawn", "", by);
    return note;
  }

  restore(note: Note, by: Staff): Note {
    if (!note.withdrawn) return note;
    note.withdrawn = null;
    this.#touch(note, by);
    this.saveNotes();
    this.event("note", note.note_id, "restored", "", by);
    return note;
  }

  // ---------------------------------------------------------------- actions

  addAction(note: Note, input: Input, by: Staff, today: string): Note {
    if (note.actions.length >= NOTE_LIMITS.actions)
      throw new Refused(400, "invalid", "Ten actions at most on one note.");
    const action = this.#actionOf(input, today, by);
    if (!action) throw new Refused(400, "invalid", "Write what each action is.");
    note.actions.push(action);
    this.#touch(note, by);
    this.saveNotes();
    this.event("note", note.note_id, "action added", action.title, by);
    return note;
  }

  doneAction(note: Note, actionId: string | undefined, by: Staff): Note {
    const action = this.action(note, actionId);
    if (action.state === "done") return note;
    action.state = "done";
    action.done_at = this.#core.now();
    action.done_by = by;
    this.#touch(note, by);
    this.saveNotes();
    this.event("note", note.note_id, "action done", action.title, by);
    return note;
  }

  reopenAction(note: Note, actionId: string | undefined, by: Staff): Note {
    const action = this.action(note, actionId);
    if (action.state === "open") return note;
    action.state = "open";
    action.done_at = null;
    action.done_by = null;
    this.#touch(note, by);
    this.saveNotes();
    this.event("note", note.note_id, "action reopened", action.title, by);
    return note;
  }

  moveAction(note: Note, actionId: string | undefined, dueOn: unknown, by: Staff): Note {
    const action = this.action(note, actionId);
    const due = clean(dueOn, 10);
    if (due && !isDay(due)) throw new Refused(400, "invalid", NOT_A_DAY);
    action.due_on = due || null;
    this.#touch(note, by);
    this.saveNotes();
    this.event("note", note.note_id, "action moved", `${action.title}: ${due || "no day"}`, by);
    return note;
  }

  // ---------------------------------------------------------------- the FAQ

  #faqFields(input: Input, base: Partial<FaqEntry>) {
    const question = has(input, "question")
      ? cleanText(input.question, NOTE_LIMITS.faq_question)
      : (base.question ?? "");
    if (!question) throw new Refused(400, "invalid", "Write the question.");
    const answer = has(input, "answer")
      ? cleanText(input.answer, NOTE_LIMITS.faq_answer)
      : (base.answer ?? "");
    return { question, answer };
  }

  addFaq(input: Input, by: Staff): FaqEntry {
    if (this.faq.length >= NOTE_TOTALS.faq)
      throw new Refused(400, "invalid", atMost(NOTE_TOTALS.faq));
    const now = this.#core.now();
    const entry: FaqEntry = {
      faq_id: randomUUID(),
      ...this.#faqFields(input, {}),
      created_at: now,
      created_by: by,
      updated_at: now,
      updated_by: by,
      archived: null,
    };
    this.faq.push(entry);
    this.saveFaq();
    this.event("faq", entry.faq_id, "added", entry.question, by);
    return entry;
  }

  updateFaq(entry: FaqEntry, input: Input, by: Staff): FaqEntry {
    Object.assign(entry, this.#faqFields(input, entry));
    this.#touch(entry, by);
    this.saveFaq();
    this.event("faq", entry.faq_id, "changed", entry.question, by);
    return entry;
  }

  archiveFaq(entry: FaqEntry, by: Staff): FaqEntry {
    if (entry.archived) return entry;
    entry.archived = { at: this.#core.now(), by };
    this.#touch(entry, by);
    this.saveFaq();
    this.event("faq", entry.faq_id, "archived", entry.question, by);
    return entry;
  }

  restoreFaq(entry: FaqEntry, by: Staff): FaqEntry {
    if (!entry.archived) return entry;
    entry.archived = null;
    this.#touch(entry, by);
    this.saveFaq();
    this.event("faq", entry.faq_id, "restored", entry.question, by);
    return entry;
  }

  /**
   * Answer an objection from the FAQ: `{faq_id}` links an entry (`""` unlinks), or
   * `{question, answer}` adds a new entry and links it.
   */
  answer(
    note: Note,
    objectionId: string | undefined,
    input: Input,
    by: Staff,
  ): { note: Note; entry: FaqEntry | null } {
    const objection = objectionId
      ? note.objections.find((item) => item.objection_id === objectionId)
      : undefined;
    if (!objection) throw new Refused(404, "not_found", "That objection is not on this note.");
    let entry: FaqEntry | null = null;
    if (has(input, "faq_id")) {
      const id = clean(input.faq_id, 64);
      if (id) {
        entry = this.faqEntry(id);
        if (entry.archived) throw new Refused(404, "not_found", "That question is not in the FAQ.");
      }
    } else
      entry = this.addFaq(
        {
          question: has(input, "question") ? input.question : objection.text,
          answer: input.answer,
        },
        by,
      );
    objection.faq_id = entry?.faq_id ?? null;
    this.#touch(note, by);
    this.saveNotes();
    this.event(
      "note",
      note.note_id,
      entry ? "answered" : "unlinked",
      entry ? `“${objection.text}” → “${entry.question}”` : `“${objection.text}”`,
      by,
    );
    return { note, entry };
  }

  // ---------------------------------------------------------------- decisions

  #decisionFields(input: Input, base: Partial<Decision>) {
    const title = has(input, "title")
      ? cleanText(input.title, NOTE_LIMITS.decision_title)
      : (base.title ?? "");
    if (!title) throw new Refused(400, "invalid", "Write the decision.");
    const why = has(input, "why") ? cleanText(input.why, NOTE_LIMITS.why) : (base.why ?? "");
    const decided_by = has(input, "decided_by")
      ? cleanText(input.decided_by, NOTE_LIMITS.decided_by)
      : (base.decided_by ?? "");
    let decided_on = base.decided_on ?? null;
    if (has(input, "decided_on")) {
      const day = clean(input.decided_on, 10);
      if (day && !isDay(day)) throw new Refused(400, "invalid", NOT_A_DAY);
      decided_on = day || null;
    }
    const status = has(input, "status") ? clean(input.status, 20) : (base.status ?? "decided");
    if (!isStatus(status)) throw new Refused(400, "invalid", "Choose the status of the decision.");
    return { title, why, decided_by, decided_on, status };
  }

  /** The checks before `replacing` replaces `old`; nothing changes when one fails. */
  #canReplace(old: Decision, replacing: { decision_id: string; status: DecisionStatus }): void {
    if (old.decision_id === replacing.decision_id)
      throw new Refused(400, "invalid", "A decision cannot replace itself.");
    if (replacing.status !== "decided")
      throw new Refused(400, "invalid", "Only a decided decision can replace another.");
    if (old.superseded_by !== null) {
      const by = this.decisions.find((item) => item.decision_id === old.superseded_by);
      throw new Refused(
        409,
        "already_superseded",
        `It is already superseded by “${by?.title ?? "another decision"}”.`,
      );
    }
  }

  #replace(old: Decision, replacing: Decision, by: Staff): void {
    old.status = "superseded";
    old.superseded_by = replacing.decision_id;
    this.#touch(old, by);
    this.event("decision", old.decision_id, "superseded", replacing.title, by);
  }

  /** The decision `supersedes` names, checked against the one that would replace it. */
  #supersedes(
    input: Input,
    replacing: { decision_id: string; status: DecisionStatus },
  ): Decision | null {
    const id = clean(input.supersedes, 64);
    if (!id) return null;
    const old = this.decision(id);
    this.#canReplace(old, replacing);
    return old;
  }

  addDecision(input: Input, by: Staff, fromNote: Note | null = null): Decision {
    if (this.decisions.length >= NOTE_TOTALS.decisions)
      throw new Refused(400, "invalid", atMost(NOTE_TOTALS.decisions));
    const fields = this.#decisionFields(input, {});
    const decision_id = randomUUID();
    const old = this.#supersedes(input, { decision_id, status: fields.status });
    const now = this.#core.now();
    const decision: Decision = {
      decision_id,
      ...fields,
      superseded_by: null,
      from_note: fromNote
        ? {
            note_id: fromNote.note_id,
            subject: { ...fromNote.subject },
            subject_name: fromNote.subject_name,
          }
        : null,
      created_at: now,
      created_by: by,
      updated_at: now,
      updated_by: by,
    };
    this.decisions.push(decision);
    this.event("decision", decision_id, "added", decision.title, by);
    if (old) this.#replace(old, decision, by);
    this.saveDecisions();
    return decision;
  }

  updateDecision(decision: Decision, input: Input, by: Staff): Decision {
    const fields = this.#decisionFields(input, decision);
    const old = this.#supersedes(input, {
      decision_id: decision.decision_id,
      status: fields.status,
    });
    Object.assign(decision, fields);
    if (decision.status !== "superseded") decision.superseded_by = null;
    this.#touch(decision, by);
    this.event("decision", decision.decision_id, "changed", decision.title, by);
    if (old) this.#replace(old, decision, by);
    this.saveDecisions();
    return decision;
  }

  supersede(old: Decision, byDecisionId: unknown, by: Staff): Decision {
    const replacing = this.decision(clean(byDecisionId, 64) || undefined);
    this.#canReplace(old, replacing);
    this.#replace(old, replacing, by);
    this.saveDecisions();
    return old;
  }

  /** "Record as decision": one per note, linked both ways. */
  decideFromNote(note: Note, input: Input, by: Staff): Decision {
    if (note.decision_id && this.decisions.some((item) => item.decision_id === note.decision_id))
      throw new Refused(
        409,
        "has_decision",
        "This note already has a decision. Change that one instead.",
      );
    const decision = this.addDecision(input, by, note);
    note.decision_id = decision.decision_id;
    this.#touch(note, by);
    this.saveNotes();
    this.event("note", note.note_id, "decision recorded", decision.title, by);
    return decision;
  }
}
