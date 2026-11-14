/**
 * The shapes of Notes (raise spec §6.2): dated notes on an investor firm or a waitlist
 * firm, each with what they objected to and what is owed them; the Investor FAQ the
 * objections are answered from; and the decisions, made from a note or typed in.
 */

import type { Staff } from "../protocol";
import type { DecisionStatus, NoteKind } from "../../../src/lib/data/labels";

export type { DecisionStatus, NoteKind };

export type NoteSubject = { kind: "investor" | "waitlist"; id: string };

export type Objection = { objection_id: string; text: string; faq_id: string | null };

export type ActionItem = {
  action_id: string;
  title: string;
  due_on: string | null;
  /** Who does it, as typed ("Aaryan", "the CA"); "" for nobody named. */
  owner: string;
  state: "open" | "done";
  done_at: string | null;
  done_by: Staff | null;
  created_at: string;
  created_by: Staff;
};

export type Note = {
  note_id: string;
  subject: NoteSubject;
  /** The firm's name when written, kept so the note reads right if the firm is renamed or gone. */
  subject_name: string;
  kind: NoteKind;
  /** The day the call, meeting or email happened. */
  held_on: string;
  title: string;
  body: string;
  /** Who was there, as typed. */
  people: string;
  objections: Objection[];
  actions: ActionItem[];
  decision_id: string | null;
  created_at: string;
  created_by: Staff;
  updated_at: string;
  updated_by: Staff;
  /** Taken back: kept, shown muted, out of Due, the agenda, search and the FAQ's counts. */
  withdrawn: { at: string; by: Staff } | null;
};

export type FaqEntry = {
  faq_id: string;
  question: string;
  answer: string;
  created_at: string;
  created_by: Staff;
  updated_at: string;
  updated_by: Staff;
  archived: { at: string; by: Staff } | null;
};

export type Decision = {
  decision_id: string;
  /** The decision itself, as a sentence. */
  title: string;
  why: string;
  decided_by: string;
  decided_on: string | null;
  status: DecisionStatus;
  superseded_by: string | null;
  from_note: { note_id: string; subject: NoteSubject; subject_name: string } | null;
  created_at: string;
  created_by: Staff;
  updated_at: string;
  updated_by: Staff;
};

export type NotesEvent = {
  event_id: string;
  target: "note" | "faq" | "decision";
  id: string;
  /** "added", "changed", "withdrawn", "action added", "action done", "action reopened", "action moved", "answered", "superseded" … */
  verb: string;
  detail: string;
  by: Staff;
  at: string;
};
