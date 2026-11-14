import "server-only";

import { z } from "zod";

import { staffSchema } from "@/lib/data/api/replies";
import type { Staff } from "@/lib/data/gate";
import { dataAsk, id, ok } from "@/lib/data/socket";

/**
 * Notes on investor firms and waitlist firms, what they objected to and what is owed them;
 * the Investor FAQ the objections are answered from; and the decisions, from a note or
 * written in. Kept on this computer by the local service.
 */

export const noteKindSchema = z.enum(["call", "meeting", "email", "note"]);
export type NoteKind = z.infer<typeof noteKindSchema>;
export const decisionStatusSchema = z.enum(["proposed", "decided", "superseded", "dropped"]);
export type DecisionStatus = z.infer<typeof decisionStatusSchema>;

export const noteSubjectSchema = z.object({
  kind: z.enum(["investor", "waitlist"]),
  id: z.string(),
});
export type NoteSubject = z.infer<typeof noteSubjectSchema>;

const stampSchema = z.object({ at: z.string(), by: staffSchema });

export const objectionSchema = z.object({
  objection_id: z.string(),
  text: z.string(),
  faq_id: z.string().nullable(),
});
export type Objection = z.infer<typeof objectionSchema>;

export const actionItemSchema = z.object({
  action_id: z.string(),
  title: z.string(),
  due_on: z.string().nullable(),
  owner: z.string(),
  state: z.enum(["open", "done"]),
  done_at: z.string().nullable(),
  done_by: staffSchema.nullable(),
  created_at: z.string(),
  created_by: staffSchema,
});
export type ActionItem = z.infer<typeof actionItemSchema>;

export const noteSchema = z.object({
  note_id: z.string(),
  subject: noteSubjectSchema,
  subject_name: z.string(),
  kind: noteKindSchema,
  held_on: z.string(),
  title: z.string(),
  body: z.string(),
  people: z.string(),
  objections: z.array(objectionSchema),
  actions: z.array(actionItemSchema),
  decision_id: z.string().nullable(),
  created_at: z.string(),
  created_by: staffSchema,
  updated_at: z.string(),
  updated_by: staffSchema,
  withdrawn: stampSchema.nullable(),
});
export type Note = z.infer<typeof noteSchema>;

export const noteRowSchema = noteSchema.extend({
  open_actions: z.number(),
  href: z.string(),
});
export type NoteRow = z.infer<typeof noteRowSchema>;

export const faqEntrySchema = z.object({
  faq_id: z.string(),
  question: z.string(),
  answer: z.string(),
  created_at: z.string(),
  created_by: staffSchema,
  updated_at: z.string(),
  updated_by: staffSchema,
  archived: stampSchema.nullable(),
});
export type FaqEntry = z.infer<typeof faqEntrySchema>;

export const faqRowSchema = faqEntrySchema.extend({ asked: z.number(), firms: z.number() });
export type FaqRow = z.infer<typeof faqRowSchema>;

export const decisionSchema = z.object({
  decision_id: z.string(),
  title: z.string(),
  why: z.string(),
  decided_by: z.string(),
  decided_on: z.string().nullable(),
  status: decisionStatusSchema,
  superseded_by: z.string().nullable(),
  from_note: z
    .object({ note_id: z.string(), subject: noteSubjectSchema, subject_name: z.string() })
    .nullable(),
  created_at: z.string(),
  created_by: staffSchema,
  updated_at: z.string(),
  updated_by: staffSchema,
});
export type Decision = z.infer<typeof decisionSchema>;

export const decisionRowSchema = decisionSchema.extend({
  superseded_by_title: z.string(),
  /** The title of the note it came from ("" when written here or the note is gone). */
  from_note_title: z.string().default(""),
});
export type DecisionRow = z.infer<typeof decisionRowSchema>;

export const notesEventSchema = z.object({
  event_id: z.string(),
  target: z.enum(["note", "faq", "decision"]),
  id: z.string(),
  verb: z.string(),
  detail: z.string(),
  by: staffSchema,
  at: z.string(),
});
export type NotesEvent = z.infer<typeof notesEventSchema>;

const countsSchema = z.record(z.string(), z.number());

export const notesPageSchema = ok.extend({
  notes: z.array(noteRowSchema),
  total: z.number(),
  offset: z.number(),
  limit: z.number(),
  counts: countsSchema,
  today: z.string(),
});
export type NotesPage = z.infer<typeof notesPageSchema>;

export const noteDetailSchema = ok.extend({
  note: noteSchema,
  firm_href: z.string(),
  decision: decisionSchema.nullable(),
  faq: z.array(faqEntrySchema),
  events: z.array(notesEventSchema),
  today: z.string(),
});
export type NoteDetail = z.infer<typeof noteDetailSchema>;

export const actionRowSchema = actionItemSchema.extend({
  note_id: z.string(),
  note_title: z.string(),
  subject: noteSubjectSchema,
  subject_name: z.string(),
  firm_href: z.string(),
});
export type ActionRow = z.infer<typeof actionRowSchema>;

export const actionsPageSchema = ok.extend({
  actions: z.array(actionRowSchema),
  total: z.number(),
  offset: z.number().optional(),
  limit: z.number().optional(),
  counts: z.object({ open: z.number(), done: z.number(), overdue: z.number() }),
  today: z.string(),
});
export type ActionsPage = z.infer<typeof actionsPageSchema>;

export const faqPageSchema = ok.extend({ entries: z.array(faqRowSchema), total: z.number() });
export type FaqPage = z.infer<typeof faqPageSchema>;

export const decisionsPageSchema = ok.extend({
  decisions: z.array(decisionRowSchema),
  total: z.number(),
  offset: z.number().optional(),
  limit: z.number().optional(),
  counts: countsSchema,
});
export type DecisionsPage = z.infer<typeof decisionsPageSchema>;

export const decisionDetailSchema = ok.extend({
  decision: decisionSchema,
  superseded_by: decisionSchema.nullable(),
  supersedes: z.array(decisionSchema),
  events: z.array(notesEventSchema),
});
export type DecisionDetail = z.infer<typeof decisionDetailSchema>;

const noteAnswer = ok.extend({ note: noteSchema });
const entryAnswer = ok.extend({ entry: faqRowSchema });
const decisionAnswer = ok.extend({ decision: decisionSchema });

function query(values: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values))
    if (value !== undefined && value !== "" && value !== 0) params.set(key, String(value));
  const rendered = params.toString();
  return rendered ? `?${rendered}` : "";
}

// ------------------------------------------------------------------ notes

export type NotesQuery = {
  subject_kind?: string;
  subject_id?: string;
  kind?: string;
  q?: string;
  withdrawn?: boolean;
  offset?: number;
};

export const readNotes = (input: NotesQuery = {}) =>
  dataAsk(
    notesPageSchema,
    "GET",
    `/data/notes${query({
      subject_kind: input.subject_kind,
      subject_id: input.subject_id,
      kind: input.kind,
      q: input.q,
      withdrawn: input.withdrawn ? "1" : undefined,
      offset: input.offset,
    })}`,
  );

export const readNote = (noteId: string) =>
  dataAsk(noteDetailSchema, "GET", `/data/notes/${id(noteId)}`);

export type ActionInput = { title: string; due_on: string; owner: string };

export type NoteInput = {
  subject_kind: "investor" | "waitlist";
  subject_id: string;
  subject_name: string;
  kind: NoteKind;
  held_on: string;
  title: string;
  body: string;
  people: string;
  /** One per line. */
  objections: string;
  actions: ActionInput[];
};

export const addNote = (input: NoteInput, by: Staff, attempt: string) =>
  dataAsk(noteAnswer, "POST", "/data/notes", { ...input, by, attempt });

export type NoteChange = Partial<
  Pick<NoteInput, "kind" | "held_on" | "title" | "body" | "people" | "objections">
>;

export const updateNote = (noteId: string, input: NoteChange, by: Staff) =>
  dataAsk(noteAnswer, "POST", `/data/notes/${id(noteId)}/update`, { ...input, by });

export const withdrawNote = (noteId: string, by: Staff) =>
  dataAsk(noteAnswer, "POST", `/data/notes/${id(noteId)}/withdraw`, { by });

export const restoreNote = (noteId: string, by: Staff) =>
  dataAsk(noteAnswer, "POST", `/data/notes/${id(noteId)}/restore`, { by });

export const addAction = (noteId: string, input: ActionInput, by: Staff, attempt: string) =>
  dataAsk(noteAnswer, "POST", `/data/notes/${id(noteId)}/actions`, { ...input, by, attempt });

export const doneAction = (noteId: string, actionId: string, by: Staff) =>
  dataAsk(noteAnswer, "POST", `/data/notes/${id(noteId)}/actions/${id(actionId)}/done`, { by });

export const reopenAction = (noteId: string, actionId: string, by: Staff) =>
  dataAsk(noteAnswer, "POST", `/data/notes/${id(noteId)}/actions/${id(actionId)}/reopen`, {
    by,
  });

export const moveAction = (noteId: string, actionId: string, dueOn: string, by: Staff) =>
  dataAsk(noteAnswer, "POST", `/data/notes/${id(noteId)}/actions/${id(actionId)}/move`, {
    due_on: dueOn,
    by,
  });

/** Link an FAQ entry (`{faq_id}`; `""` unlinks) or add one from the objection (`{question, answer}`). */
export const answerObjection = (
  noteId: string,
  objectionId: string,
  input: { faq_id: string } | { question: string; answer: string },
  by: Staff,
) =>
  dataAsk(
    ok.extend({ note: noteSchema, entry: faqEntrySchema.nullable() }),
    "POST",
    `/data/notes/${id(noteId)}/objections/${id(objectionId)}/answer`,
    { ...input, by },
  );

export type DecisionInput = {
  title: string;
  why: string;
  decided_by: string;
  decided_on: string;
  status: DecisionStatus;
  /** The decided decision this one replaces, or "" for none. */
  supersedes?: string;
};

export const recordDecisionFromNote = (
  noteId: string,
  input: DecisionInput,
  by: Staff,
  attempt: string,
) =>
  dataAsk(
    ok.extend({ note: noteSchema, decision: decisionSchema }),
    "POST",
    `/data/notes/${id(noteId)}/decision`,
    { ...input, by, attempt },
  );

// ------------------------------------------------------------------ actions across notes

export const readActions = (state: "open" | "done" | "all" = "open", offset = 0) =>
  dataAsk(actionsPageSchema, "GET", `/data/note-actions${query({ state, offset })}`);

// ------------------------------------------------------------------ the FAQ

export const readFaq = (input: { q?: string; archived?: boolean } = {}) =>
  dataAsk(
    faqPageSchema,
    "GET",
    `/data/faq${query({ q: input.q, archived: input.archived ? "1" : undefined })}`,
  );

export type FaqInput = { question: string; answer: string };

export const addFaq = (input: FaqInput, by: Staff, attempt: string) =>
  dataAsk(entryAnswer, "POST", "/data/faq", { ...input, by, attempt });

export const updateFaq = (faqId: string, input: FaqInput, by: Staff) =>
  dataAsk(entryAnswer, "POST", `/data/faq/${id(faqId)}/update`, { ...input, by });

export const archiveFaq = (faqId: string, by: Staff) =>
  dataAsk(entryAnswer, "POST", `/data/faq/${id(faqId)}/archive`, { by });

export const restoreFaq = (faqId: string, by: Staff) =>
  dataAsk(entryAnswer, "POST", `/data/faq/${id(faqId)}/restore`, { by });

// ------------------------------------------------------------------ decisions

export const readDecisions = (input: { status?: string; q?: string; offset?: number } = {}) =>
  dataAsk(
    decisionsPageSchema,
    "GET",
    `/data/decisions${query({ status: input.status, q: input.q, offset: input.offset })}`,
  );

export const readDecision = (decisionId: string) =>
  dataAsk(decisionDetailSchema, "GET", `/data/decisions/${id(decisionId)}`);

export const addDecision = (input: DecisionInput, by: Staff, attempt: string) =>
  dataAsk(decisionAnswer, "POST", "/data/decisions", { ...input, by, attempt });

export const updateDecision = (decisionId: string, input: DecisionInput, by: Staff) =>
  dataAsk(decisionAnswer, "POST", `/data/decisions/${id(decisionId)}/update`, { ...input, by });

/** Mark `decisionId` superseded by `byDecisionId`, a decided decision. */
export const supersedeDecision = (decisionId: string, byDecisionId: string, by: Staff) =>
  dataAsk(decisionAnswer, "POST", `/data/decisions/${id(decisionId)}/supersede`, {
    by_decision_id: byDecisionId,
    by,
  });
