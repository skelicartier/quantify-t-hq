// @vitest-environment node
import { createHash, randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addDays } from "../../scripts/data/days";
import {
  addAction,
  addDecision,
  addFaq,
  addNote,
  answerObjection,
  archiveFaq,
  doneAction,
  moveAction,
  readActions,
  readDecision,
  readDecisions,
  readFaq,
  readNote,
  readNotes,
  recordDecisionFromNote,
  reopenAction,
  restoreFaq,
  restoreNote,
  supersedeDecision,
  updateDecision,
  updateFaq,
  updateNote,
  withdrawNote,
  type NoteInput,
} from "@/lib/data/api/notes";
import { readDataOverview } from "@/lib/data/api/overview";
import { DataRequestError } from "@/lib/data/socket";
import { WALKER, startStack, type Stack } from "./helpers";

/**
 * The portal's Notes client against the real stack: every function's answer passes its
 * schema, the overview parses with an "action" row in Due, and the service's refusals
 * reach the portal as its own sentences.
 */

const FIRM = createHash("sha256")
  .update("investor:walk-contract.example")
  .digest("hex")
  .slice(0, 32);

let stack: Stack;
let today = "";

beforeAll(async () => {
  stack = await startStack({ env: true, modules: ["notes"] });
  today = String((await stack.ask("GET", "/data/_test/day")).json?.day ?? "");
}, 60_000);
afterAll(() => stack.stop());

const input = (change: Partial<NoteInput> = {}): NoteInput => ({
  subject_kind: "investor",
  subject_id: FIRM,
  subject_name: "Walk Contract Fund",
  kind: "call",
  held_on: today,
  title: "Contract call",
  body: "Invented: what was said.",
  people: "A partner",
  objections: "Why now?\nWho else is in?",
  actions: [
    { title: "Send the numbers", due_on: today, owner: "Walk Owner" },
    { title: "", due_on: "", owner: "" },
  ],
  ...change,
});

describe("the portal and Notes agree", () => {
  it("on every note, action, FAQ and decision call", async () => {
    const { note } = await addNote(input(), WALKER, randomUUID());
    expect(note.actions).toHaveLength(1);
    const page = await readNotes({ subject_kind: "investor", subject_id: FIRM });
    expect(page.notes[0]).toMatchObject({ note_id: note.note_id, open_actions: 1 });
    expect(page.counts).toMatchObject({ all: 1, call: 1 });
    expect((await readNotes({ q: "contract", kind: "call", withdrawn: true })).total).toBe(1);

    const detail = await readNote(note.note_id);
    expect(detail.firm_href).toBe(`/data/investors/${FIRM}`);
    expect(detail.events[0]?.verb).toBe("added");

    const changed = await updateNote(note.note_id, { title: "Contract call, edited" }, WALKER);
    expect(changed.note.title).toBe("Contract call, edited");

    const actionId = note.actions[0]!.action_id;
    expect(
      (await moveAction(note.note_id, actionId, addDays(today, 3), WALKER)).note.actions[0]?.due_on,
    ).toBe(addDays(today, 3));
    expect((await doneAction(note.note_id, actionId, WALKER)).note.actions[0]?.state).toBe("done");
    expect((await reopenAction(note.note_id, actionId, WALKER)).note.actions[0]?.state).toBe(
      "open",
    );
    const more = await addAction(
      note.note_id,
      { title: "Book the second meeting", due_on: today, owner: "" },
      WALKER,
      randomUUID(),
    );
    expect(more.note.actions).toHaveLength(2);
    const actions = await readActions("all");
    expect(actions.counts).toEqual({ open: 2, done: 0, overdue: 0 });
    expect(actions.actions[0]?.firm_href).toBe(`/data/investors/${FIRM}`);

    const answered = await answerObjection(
      note.note_id,
      note.objections[0]!.objection_id,
      { question: "Why now?", answer: "The data rules changed this year." },
      WALKER,
    );
    expect(answered.entry?.question).toBe("Why now?");
    const unlinked = await answerObjection(
      note.note_id,
      note.objections[0]!.objection_id,
      { faq_id: "" },
      WALKER,
    );
    expect(unlinked.entry).toBeNull();
    const linked = await answerObjection(
      note.note_id,
      note.objections[1]!.objection_id,
      { faq_id: answered.entry!.faq_id },
      WALKER,
    );
    expect(linked.note.objections[1]?.faq_id).toBe(answered.entry!.faq_id);

    const { entry } = await addFaq(
      { question: "Who owns the code?", answer: "The company." },
      WALKER,
      randomUUID(),
    );
    expect(entry).toMatchObject({ asked: 0, firms: 0 });
    expect(
      (
        await updateFaq(
          entry.faq_id,
          { question: "Who owns the code?", answer: "The Indian company." },
          WALKER,
        )
      ).entry.answer,
    ).toBe("The Indian company.");
    expect((await archiveFaq(entry.faq_id, WALKER)).entry.archived).not.toBeNull();
    expect((await restoreFaq(entry.faq_id, WALKER)).entry.archived).toBeNull();
    const faq = await readFaq({ q: "why" });
    expect(faq.entries[0]).toMatchObject({ question: "Why now?", asked: 1, firms: 1 });
    expect((await readFaq({ archived: true })).total).toBe(2);

    const fromNote = await recordDecisionFromNote(
      note.note_id,
      {
        title: "Raise on a SAFE",
        why: "Fast to close.",
        decided_by: "Walk Owner",
        decided_on: today,
        status: "decided",
        supersedes: "",
      },
      WALKER,
      randomUUID(),
    );
    expect(fromNote.note.decision_id).toBe(fromNote.decision.decision_id);
    const later = await addDecision(
      {
        title: "Raise on a priced round",
        why: "A lead asked for one.",
        decided_by: "Walk Owner",
        decided_on: today,
        status: "proposed",
      },
      WALKER,
      randomUUID(),
    );
    const decided = await updateDecision(
      later.decision.decision_id,
      { ...later.decision, decided_on: today, status: "decided" },
      WALKER,
    );
    expect(decided.decision.status).toBe("decided");
    const replaced = await supersedeDecision(
      fromNote.decision.decision_id,
      later.decision.decision_id,
      WALKER,
    );
    expect(replaced.decision.superseded_by).toBe(later.decision.decision_id);
    const decisions = await readDecisions({ status: "superseded" });
    expect(decisions.decisions[0]?.superseded_by_title).toBe("Raise on a priced round");
    expect(decisions.counts).toMatchObject({ all: 2, decided: 1, superseded: 1 });
    const one = await readDecision(later.decision.decision_id);
    expect(one.supersedes.map((item) => item.decision_id)).toEqual([fromNote.decision.decision_id]);

    expect((await withdrawNote(note.note_id, WALKER)).note.withdrawn).not.toBeNull();
    expect((await restoreNote(note.note_id, WALKER)).note.withdrawn).toBeNull();
  });

  it("on the overview, with an action row in Due", async () => {
    const overview = await readDataOverview();
    const action = overview.due.find((item) => item.kind === "action");
    expect(action).toMatchObject({
      kind: "action",
      title: "Book the second meeting",
      due_on: today,
      sub: "Walk Contract Fund · from “Contract call, edited”",
    });
    expect(action?.href).toMatch(/^\/data\/notes\/[0-9a-f-]{36}$/);
  });

  it("on a refusal, in its own words", async () => {
    const future = addNote(input({ held_on: addDays(today, 1) }), WALKER, randomUUID());
    await expect(future).rejects.toBeInstanceOf(DataRequestError);
    await expect(future).rejects.toMatchObject({
      status: 400,
      code: "invalid",
      message: "That day is in the future.",
    });
  });
});
