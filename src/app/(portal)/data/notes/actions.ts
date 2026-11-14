"use server";

import { fieldValue } from "@/lib/auth/forms";
import * as api from "@/lib/data/api/notes";
import { gate, refreshData, refusal, refused, sent, staffOf } from "@/lib/data/gate";
import type { ActionState } from "@/lib/forms/action-state";

import { NOT_A_DAY, decisionFieldsOf, idOf, isState, typedDay } from "../decisions/fields";

/**
 * Notes' writes: a note from a firm's Notes section, its edits, taking it back and
 * restoring it; its actions (added, done, open again, moved); answering an objection from
 * the Investor FAQ; "Record as decision"; and the FAQ itself. Each refreshes the note's
 * page, the Notes page, the firm's page it came from and the overview's Due.
 */

/** The firm's page a form returns to: only ever an investor or a waitlist firm. */
const FIRM_PATH = /^\/data\/(investors|waitlist)\/[A-Za-z0-9-]{1,64}$/;
const KINDS = new Set<string>(api.noteKindSchema.options);
/** The composer's three action rows. */
const ROWS = [0, 1, 2] as const;

const NO_NOTE: ActionState = { status: "error", message: "That note is not here." };

const attemptOf = (formData: FormData): string =>
  fieldValue(formData, "attempt", 64) || crypto.randomUUID();

function refreshNotes(formData: FormData, noteId = ""): void {
  const firm = fieldValue(formData, "path", 120);
  refreshData(
    "/data/notes",
    ...(noteId ? [`/data/notes/${noteId}`] : []),
    ...(FIRM_PATH.test(firm) ? [firm] : []),
  );
}

function noteFields(formData: FormData): api.NoteChange | ActionState {
  const kind = fieldValue(formData, "kind", 20);
  if (!KINDS.has(kind)) return { status: "error", message: "Choose the kind of note." };
  const heldOn = typedDay(formData, "held_on");
  if (heldOn === null) return NOT_A_DAY;
  const title = fieldValue(formData, "title", 200).trim();
  if (!title) return { status: "error", message: "Give the note a title." };
  return {
    kind: kind as api.NoteKind,
    held_on: heldOn,
    title,
    body: fieldValue(formData, "body", 8_000),
    people: fieldValue(formData, "people", 200),
    objections: fieldValue(formData, "objections", 4_000),
  };
}

export async function addNoteAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/data/notes");
  if (refused(context)) return context;
  const subjectKind = fieldValue(formData, "subject_kind", 20);
  const subjectId = idOf(formData, "subject_id");
  if ((subjectKind !== "investor" && subjectKind !== "waitlist") || !subjectId)
    return { status: "error", message: "Say which firm the note is about." };
  const fields = noteFields(formData);
  if (isState(fields)) return fields;
  const actions: api.ActionInput[] = [];
  for (const index of ROWS) {
    const due = typedDay(formData, `action_due_${index}`);
    if (due === null) return NOT_A_DAY;
    actions.push({
      title: fieldValue(formData, `action_title_${index}`, 200).trim(),
      due_on: due,
      owner: fieldValue(formData, `action_owner_${index}`, 120).trim(),
    });
  }
  let dated = 0;
  try {
    const { note } = await api.addNote(
      {
        subject_kind: subjectKind,
        subject_id: subjectId,
        subject_name: fieldValue(formData, "subject_name", 200),
        kind: fields.kind ?? "call",
        held_on: fields.held_on ?? "",
        title: fields.title ?? "",
        body: fields.body ?? "",
        people: fields.people ?? "",
        objections: fields.objections ?? "",
        actions,
      },
      staffOf(context),
      attemptOf(formData),
    );
    dated = note.actions.filter((action) => action.due_on !== null).length;
  } catch (error) {
    return refusal(error);
  }
  refreshNotes(formData);
  return sent(
    dated === 0
      ? "Added the note."
      : dated === 1
        ? "Added the note. 1 action is on Due on its day."
        : `Added the note. ${dated} actions are on Due on their day.`,
  );
}

export async function updateNoteAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/data/notes");
  if (refused(context)) return context;
  const noteId = idOf(formData, "note_id");
  if (!noteId) return NO_NOTE;
  const fields = noteFields(formData);
  if (isState(fields)) return fields;
  try {
    await api.updateNote(noteId, fields, staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshNotes(formData, noteId);
  return sent("Saved.");
}

export async function withdrawNoteAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/data/notes");
  if (refused(context)) return context;
  const noteId = idOf(formData, "note_id");
  if (!noteId) return NO_NOTE;
  const restore = fieldValue(formData, "to", 10) === "restore";
  try {
    if (restore) await api.restoreNote(noteId, staffOf(context));
    else await api.withdrawNote(noteId, staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshNotes(formData, noteId);
  return sent(restore ? "Restored." : "Taken back.");
}

export async function addActionAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/data/notes");
  if (refused(context)) return context;
  const noteId = idOf(formData, "note_id");
  if (!noteId) return NO_NOTE;
  const title = fieldValue(formData, "title", 200).trim();
  if (!title) return { status: "error", message: "Write what each action is." };
  const due = typedDay(formData, "due_on");
  if (due === null) return NOT_A_DAY;
  try {
    await api.addAction(
      noteId,
      { title, due_on: due, owner: fieldValue(formData, "owner", 120).trim() },
      staffOf(context),
      attemptOf(formData),
    );
  } catch (error) {
    return refusal(error);
  }
  refreshNotes(formData, noteId);
  return sent(due ? "Added the action. It is on Due on its day." : "Added the action.");
}

/** "Done" or "Open again" on one action. */
export async function actionStateAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/data/notes");
  if (refused(context)) return context;
  const noteId = idOf(formData, "note_id");
  const actionId = idOf(formData, "action_id");
  if (!noteId || !actionId) return NO_NOTE;
  const reopen = fieldValue(formData, "to", 10) === "open";
  try {
    if (reopen) await api.reopenAction(noteId, actionId, staffOf(context));
    else await api.doneAction(noteId, actionId, staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshNotes(formData, noteId);
  return sent(null);
}

export async function moveActionAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/data/notes");
  if (refused(context)) return context;
  const noteId = idOf(formData, "note_id");
  const actionId = idOf(formData, "action_id");
  if (!noteId || !actionId) return NO_NOTE;
  const due = typedDay(formData, "due_on");
  if (due === null) return NOT_A_DAY;
  try {
    await api.moveAction(noteId, actionId, due, staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshNotes(formData, noteId);
  return sent("Moved.");
}

/** Link an FAQ entry to an objection, add one from it, or unlink it (`mode`). */
export async function answerObjectionAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/data/notes");
  if (refused(context)) return context;
  const noteId = idOf(formData, "note_id");
  const objectionId = idOf(formData, "objection_id");
  if (!noteId || !objectionId) return NO_NOTE;
  const mode = fieldValue(formData, "mode", 10);
  let input: { faq_id: string } | { question: string; answer: string };
  if (mode === "new") {
    const question = fieldValue(formData, "question", 300).trim();
    if (!question) return { status: "error", message: "Write the question." };
    input = { question, answer: fieldValue(formData, "answer", 4_000) };
  } else if (mode === "link") {
    const faqId = idOf(formData, "faq_id");
    if (!faqId) return { status: "error", message: "Choose a question from the FAQ." };
    input = { faq_id: faqId };
  } else input = { faq_id: "" };
  try {
    await api.answerObjection(noteId, objectionId, input, staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshNotes(formData, noteId);
  return sent(mode === "new" ? "Added to the FAQ." : mode === "link" ? "Answered." : "Unlinked.");
}

export async function recordDecisionAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/data/notes");
  if (refused(context)) return context;
  const noteId = idOf(formData, "note_id");
  if (!noteId) return NO_NOTE;
  const fields = decisionFieldsOf(formData);
  if (isState(fields)) return fields;
  try {
    await api.recordDecisionFromNote(noteId, fields, staffOf(context), attemptOf(formData));
  } catch (error) {
    return refusal(error);
  }
  refreshNotes(formData, noteId);
  refreshData("/data/decisions");
  return sent("Recorded the decision.");
}

// ------------------------------------------------------------------ the FAQ

function faqFields(formData: FormData): api.FaqInput | ActionState {
  const question = fieldValue(formData, "question", 300).trim();
  if (!question) return { status: "error", message: "Write the question." };
  return { question, answer: fieldValue(formData, "answer", 4_000) };
}

export async function addFaqAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/data/notes");
  if (refused(context)) return context;
  const fields = faqFields(formData);
  if (isState(fields)) return fields;
  try {
    await api.addFaq(fields, staffOf(context), attemptOf(formData));
  } catch (error) {
    return refusal(error);
  }
  refreshData("/data/notes");
  return sent("Added the question.");
}

export async function updateFaqAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/data/notes");
  if (refused(context)) return context;
  const faqId = idOf(formData, "faq_id");
  if (!faqId) return { status: "error", message: "That question is not in the FAQ." };
  const to = fieldValue(formData, "to", 10);
  try {
    if (to === "archive") await api.archiveFaq(faqId, staffOf(context));
    else if (to === "restore") await api.restoreFaq(faqId, staffOf(context));
    else {
      const fields = faqFields(formData);
      if (isState(fields)) return fields;
      await api.updateFaq(faqId, fields, staffOf(context));
    }
  } catch (error) {
    return refusal(error);
  }
  refreshData("/data/notes");
  return sent(to === "archive" ? "Archived." : to === "restore" ? "Restored." : "Saved.");
}
