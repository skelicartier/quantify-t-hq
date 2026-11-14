// @vitest-environment node
import { createHash, randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addDays } from "../../scripts/data/days";
import { SECRET_MESSAGE } from "../../scripts/data/guard";
import { WALKER, codeOf, startStack, type RawAnswer, type Stack } from "./helpers";

/**
 * Notes, the Investor FAQ and decisions (raise spec §6), through the real stack and the
 * routes: the worked example of §6.5 (an FAQ entry asked three times by two firms, one
 * action on Due, two in the agenda, a decision replaced by a later one, a search that finds
 * one note), every refusal of §6.3, objections matched by their text on an edit, taking a
 * note back and restoring it, one decision per note and the rules for replacing one.
 * Dates are worked out from the service's own today, so the test holds on any day; the
 * spec's example is the same with today Fri 13 Nov 2026. Every firm is invented.
 */

const investorIdOf = (firmKey: string): string =>
  createHash("sha256").update(`investor:${firmKey}`).digest("hex").slice(0, 32);

const FIRM_A = investorIdOf("walk-a.example");
const FIRM_C = investorIdOf("walk-c.example");
const FIRM_B = randomUUID();

let stack: Stack;
let today = "";

beforeAll(async () => {
  // U2's modules alone (raise spec §3.2): the merged investors module gives the real
  // `investors-raise`, which would check these invented firms, so it is left out and the
  // note keeps the name the page sent. raise-merged.test.ts checks a note on a real firm.
  stack = await startStack({
    modules: ["files", "leads", "replies", "waitlist", "notes"],
  });
  today = String((await stack.ask("GET", "/data/_test/day")).json?.day ?? "");
}, 60_000);
afterAll(() => stack.stop());

type Json = Record<string, unknown>;
type Note = {
  note_id: string;
  subject_name: string;
  objections: { objection_id: string; text: string; faq_id: string | null }[];
  actions: { action_id: string; title: string; due_on: string | null; state: string }[];
  decision_id: string | null;
  withdrawn: unknown;
};

const message = (answer: RawAnswer): string =>
  String(((answer.json?.error ?? {}) as { message?: unknown }).message ?? "");

async function post(path: string, body: Json): Promise<RawAnswer> {
  return stack.ask("POST", path, { by: WALKER, ...body });
}

async function ok(path: string, body: Json): Promise<Json> {
  const answer = await post(path, body);
  expect(answer.status, `${path}: ${message(answer)}`).toBe(200);
  return answer.json!;
}

async function get(path: string): Promise<Json> {
  const answer = await stack.ask("GET", path);
  expect(answer.status, `${path}: ${message(answer)}`).toBe(200);
  return answer.json!;
}

const noteBody = (change: Json = {}): Json => ({
  subject_kind: "investor",
  subject_id: FIRM_A,
  subject_name: "Walk A Capital",
  kind: "meeting",
  held_on: today,
  title: "Invented meeting",
  body: "",
  people: "",
  objections: "",
  actions: [],
  ...change,
});

async function addNote(change: Json): Promise<Note> {
  return (await ok("/data/notes", noteBody(change))).note as Note;
}

async function faqRow(faqId: string) {
  const entries = (await get("/data/faq")).entries as {
    faq_id: string;
    asked: number;
    firms: number;
  }[];
  return entries.find((entry) => entry.faq_id === faqId);
}

async function dueActions() {
  const due = (await get("/data/overview")).due as {
    key: string;
    kind: string;
    title: string;
    sub: string;
    due_on: string;
    href: string;
  }[];
  return due.filter((item) => item.kind === "action");
}

describe("the worked example (raise spec §6.5)", () => {
  const ids: Record<string, string> = {};

  it("builds N1–N4, the FAQ entry Q1 and the decisions D1 and D2", async () => {
    // N1 on firm A, held three days ago: two objections and three actions.
    const n1 = await addNote({
      held_on: addDays(today, -3),
      title: "First meeting with Walk A",
      body: "They asked why India comes first, and whether the data is licensed for resale.",
      people: "Asha A, partner",
      objections: "Why India first?\nIs the data licensed?",
      actions: [
        { title: "Send the pilot summary", due_on: today, owner: "Walk Owner" },
        { title: "Introduce the CTO", due_on: addDays(today, 7), owner: "" },
        { title: "Share the deck", due_on: today, owner: "" },
        { title: "", due_on: "", owner: "" },
      ],
    });
    expect(n1.actions).toHaveLength(3);
    ids.n1 = n1.note_id;
    const [a1, a2, a3] = n1.actions;
    ids.a1 = a1!.action_id;
    ids.a2 = a2!.action_id;
    ids.a3 = a3!.action_id;
    // A1 was due yesterday and A3 the day before: moved there, then A3 done.
    await ok(`/data/notes/${ids.n1}/actions/${ids.a1}/move`, { due_on: addDays(today, -1) });
    await ok(`/data/notes/${ids.n1}/actions/${ids.a3}/move`, { due_on: addDays(today, -2) });
    await ok(`/data/notes/${ids.n1}/actions/${ids.a3}/done`, {});

    // Q1 made from N1's first objection; the second stays unlinked.
    const answered = await ok(
      `/data/notes/${ids.n1}/objections/${n1.objections[0]!.objection_id}/answer`,
      { question: "Why India first?", answer: "The data and the first buyers are here." },
    );
    ids.q1 = String((answered.entry as Json).faq_id);
    expect((answered.note as Note).objections.map((item) => item.faq_id)).toEqual([ids.q1, null]);

    // N2 on firm A, N3 on waitlist firm B, N4 on firm C (then taken back): each links Q1.
    for (const [key, subject] of [
      ["n2", { subject_kind: "investor", subject_id: FIRM_A, subject_name: "Walk A Capital" }],
      ["n3", { subject_kind: "waitlist", subject_id: FIRM_B, subject_name: "Walk B Wealth" }],
      ["n4", { subject_kind: "investor", subject_id: FIRM_C, subject_name: "Walk C Partners" }],
    ] as const) {
      const note = await addNote({
        ...subject,
        kind: "call",
        held_on: addDays(today, -1),
        title: `Call ${key}`,
        objections: "Why India first?",
      });
      ids[key] = note.note_id;
      await ok(
        `/data/notes/${note.note_id}/objections/${note.objections[0]!.objection_id}/answer`,
        {
          faq_id: ids.q1,
        },
      );
    }
    await ok(`/data/notes/${ids.n4}/withdraw`, {});

    // D1 from N1, decided on N1's day; D2 decided yesterday, replacing D1.
    const d1 = await ok(`/data/notes/${ids.n1}/decision`, {
      title: "Raise into the Indian company first",
      why: "The data and the buyers are in India.",
      decided_by: "Walk Owner",
      decided_on: addDays(today, -3),
      status: "decided",
      attempt: randomUUID(),
    });
    ids.d1 = String((d1.decision as Json).decision_id);
    expect((d1.note as Note).decision_id).toBe(ids.d1);
    const d2 = await ok("/data/decisions", {
      title: "Flip to a US parent before the seed",
      why: "US funds asked for a Delaware parent.",
      decided_by: "Walk Owner",
      decided_on: addDays(today, -1),
      status: "decided",
      supersedes: ids.d1,
      attempt: randomUUID(),
    });
    ids.d2 = String((d2.decision as Json).decision_id);
  });

  it("Q1 is asked 3 times by 2 firms: N4 is taken back", async () => {
    expect(await faqRow(ids.q1!)).toMatchObject({ asked: 3, firms: 2 });
  });

  it("Due has one action row, A1, overdue since yesterday, in the right shape", async () => {
    const due = await dueActions();
    expect(due).toEqual([
      {
        key: `action:${ids.a1}`,
        kind: "action",
        title: "Send the pilot summary",
        sub: "Walk A Capital · from “First meeting with Walk A”",
        due_on: addDays(today, -1),
        href: `/data/notes/${ids.n1}`,
      },
    ]);
  });

  it("the agenda has A1 and A2, and never the done A3", async () => {
    const items = (await get("/data/_test/notes/agenda")).items as Json[];
    expect(items.map((item) => item.key)).toEqual([`action:${ids.a1}`, `action:${ids.a2}`]);
    expect(items[1]).toEqual({
      key: `action:${ids.a2}`,
      kind: "action",
      title: "Introduce the CTO · Walk A Capital",
      plain: "Action from a note",
      sub: "From “First meeting with Walk A”",
      on: addDays(today, 7),
      remind_days: [0],
      href: `/data/notes/${ids.n1}`,
    });
  });

  it("the actions list counts open 2, done 1, overdue 1", async () => {
    const page = await get("/data/note-actions?state=all");
    expect(page.counts).toEqual({ open: 2, done: 1, overdue: 1 });
    const open = await get("/data/note-actions");
    expect((open.actions as Json[]).map((item) => item.title)).toEqual([
      "Send the pilot summary",
      "Introduce the CTO",
    ]);
    expect((open.actions as Json[])[0]).toMatchObject({
      note_id: ids.n1,
      note_title: "First meeting with Walk A",
      subject_name: "Walk A Capital",
      firm_href: `/data/investors/${FIRM_A}`,
    });
  });

  it("D1 is superseded by D2; the counts are all 2, decided 1, superseded 1", async () => {
    const page = await get("/data/decisions");
    expect(page.counts).toMatchObject({ all: 2, decided: 1, superseded: 1, proposed: 0 });
    const rows = page.decisions as Json[];
    expect(rows.map((row) => row.title)).toEqual([
      "Flip to a US parent before the seed",
      "Raise into the Indian company first",
    ]);
    expect(rows[1]).toMatchObject({
      status: "superseded",
      superseded_by: ids.d2,
      superseded_by_title: "Flip to a US parent before the seed",
      from_note: { note_id: ids.n1, subject_name: "Walk A Capital" },
    });
    const detail = await get(`/data/decisions/${ids.d2}`);
    expect((detail.supersedes as Json[]).map((item) => item.decision_id)).toEqual([ids.d1]);
    const old = await get(`/data/decisions/${ids.d1}`);
    expect((old.superseded_by as Json).decision_id).toBe(ids.d2);
    expect((old.events as Json[]).map((event) => event.verb)).toEqual(["superseded", "added"]);
  });

  it("a search for “licensed” finds N1 as a note and nothing else", async () => {
    const found = await get("/data/_test/notes/search?q=licensed");
    expect(found.contacts).toEqual([]);
    const groups = found.notes as { kind: string; count: number; hits: Json[] }[];
    expect(groups.map((item) => [item.kind, item.count])).toEqual([["note", 1]]);
    expect(groups[0]!.hits[0]).toMatchObject({
      kind: "note",
      id: ids.n1,
      title: "First meeting with Walk A",
      href: `/data/notes/${ids.n1}`,
    });
    expect(String(groups[0]!.hits[0]!.subtitle)).toMatch(
      /^Meeting · Walk A Capital · \d+ \w{3} \d{4}$/,
    );
    expect(String(groups[0]!.hits[0]!.snippet)).toContain("licensed");
  });

  it("searches the FAQ and decisions too, and never a taken-back note", async () => {
    const india = (await get("/data/_test/notes/search?q=india")).notes as {
      kind: string;
      count: number;
      hits: Json[];
    }[];
    const byKind = Object.fromEntries(india.map((item) => [item.kind, item]));
    expect(byKind.note?.count).toBe(3);
    expect(byKind.note?.hits.map((hit) => hit.id)).not.toContain(ids.n4);
    expect(byKind.faq?.hits[0]).toMatchObject({
      kind: "faq",
      id: ids.q1,
      title: "Why India first?",
      href: `/data/notes?view=faq#faq-${ids.q1}`,
    });
    expect(byKind.decision?.hits[0]).toMatchObject({
      kind: "decision",
      href: `/data/decisions#decision-${ids.d1}`,
    });
    expect(String(byKind.decision?.hits[0]?.subtitle)).toMatch(/^Superseded · /);
    const onlyDecisions = (await get("/data/_test/notes/search?q=india&kind=decision")).notes as {
      kind: string;
    }[];
    expect(onlyDecisions.map((item) => item.kind)).toEqual(["decision"]);
    expect((await get("/data/_test/notes/search?q=")).notes).toEqual([]);
  });

  it("an edit keeps a kept objection's id and FAQ link, matched by its text", async () => {
    const before = (await get(`/data/notes/${ids.n1}`)).note as Note;
    const india = before.objections.find((item) => item.text === "Why India first?")!;
    const after = (
      await ok(`/data/notes/${ids.n1}/update`, {
        objections: "Is the data licensed?\nWhy India first?\nWho else is in the round?",
      })
    ).note as Note;
    expect(after.objections.map((item) => item.text)).toEqual([
      "Is the data licensed?",
      "Why India first?",
      "Who else is in the round?",
    ]);
    expect(after.objections[1]).toEqual(india);
    expect(after.objections[2]!.faq_id).toBeNull();
    expect(await faqRow(ids.q1!)).toMatchObject({ asked: 3, firms: 2 });
    // A line dropped loses its link; the count follows.
    await ok(`/data/notes/${ids.n2}/update`, { objections: "" });
    expect(await faqRow(ids.q1!)).toMatchObject({ asked: 2, firms: 2 });
    await ok(`/data/notes/${ids.n2}/update`, { objections: "Why India first?" });
  });

  it("taking a note back drops its actions from Due and its objections from the counts", async () => {
    await ok(`/data/notes/${ids.n1}/withdraw`, {});
    expect(await dueActions()).toEqual([]);
    expect(await faqRow(ids.q1!)).toMatchObject({ asked: 1, firms: 1 });
    expect((await get("/data/_test/notes/agenda")).items).toEqual([]);
    const live = (await get("/data/notes")).notes as Json[];
    expect(live.map((note) => note.note_id)).not.toContain(ids.n1);
    const all = (await get("/data/notes?withdrawn=1")).notes as Json[];
    expect(all.map((note) => note.note_id)).toContain(ids.n1);
    expect((await get("/data/_test/notes/search?q=licensed")).notes).toEqual([]);

    await ok(`/data/notes/${ids.n1}/restore`, {});
    expect((await dueActions()).map((item) => item.key)).toEqual([`action:${ids.a1}`]);
    // N1 and N3 (firms A and B): N2's line was written again, so it is not linked now.
    expect(await faqRow(ids.q1!)).toMatchObject({ asked: 2, firms: 2 });
    const events = (await get(`/data/notes/${ids.n1}`)).events as Json[];
    expect(events.slice(0, 2).map((event) => event.verb)).toEqual(["restored", "withdrawn"]);
  });

  it("done leaves Due, open again comes back", async () => {
    await ok(`/data/notes/${ids.n1}/actions/${ids.a1}/done`, {});
    expect(await dueActions()).toEqual([]);
    expect((await get("/data/note-actions")).counts).toMatchObject({ open: 1, done: 2 });
    await ok(`/data/notes/${ids.n1}/actions/${ids.a1}/reopen`, {});
    expect((await dueActions()).map((item) => item.key)).toEqual([`action:${ids.a1}`]);
  });

  it("lists a firm's notes, by kind, with counts and each row's firm page", async () => {
    const page = await get(`/data/notes?subject_kind=investor&subject_id=${FIRM_A}`);
    expect(page.counts).toEqual({ all: 2, call: 1, meeting: 1, email: 0, note: 0 });
    expect(page.limit).toBe(100);
    const rows = page.notes as Json[];
    expect(rows.map((row) => row.note_id)).toEqual([ids.n2, ids.n1]);
    expect(rows[1]).toMatchObject({ open_actions: 2, href: `/data/investors/${FIRM_A}` });
    const calls = await get(`/data/notes?subject_kind=investor&subject_id=${FIRM_A}&kind=call`);
    expect((calls.notes as Json[]).map((row) => row.note_id)).toEqual([ids.n2]);
    const waitlist = await get(`/data/notes?q=wealth`);
    expect((waitlist.notes as Json[])[0]).toMatchObject({ href: `/data/waitlist/${FIRM_B}` });
    const detail = await get(`/data/notes/${ids.n1}`);
    expect(detail.firm_href).toBe(`/data/investors/${FIRM_A}`);
    expect((detail.decision as Json).decision_id).toBe(ids.d1);
    expect((detail.faq as Json[]).map((entry) => entry.faq_id)).toEqual([ids.q1]);
  });

  it("one decision per note", async () => {
    const again = await post(`/data/notes/${ids.n1}/decision`, {
      title: "Another",
      status: "decided",
      attempt: randomUUID(),
    });
    expect([again.status, codeOf(again), message(again)]).toEqual([
      409,
      "has_decision",
      "This note already has a decision. Change that one instead.",
    ]);
  });

  it("the rules for replacing a decision", async () => {
    const itself = await post(`/data/decisions/${ids.d2}/supersede`, { by_decision_id: ids.d2 });
    expect([itself.status, message(itself)]).toEqual([400, "A decision cannot replace itself."]);
    const proposed = await ok("/data/decisions", {
      title: "Open a GIFT City entity",
      status: "proposed",
      attempt: randomUUID(),
    });
    const id3 = String((proposed.decision as Json).decision_id);
    const notDecided = await post(`/data/decisions/${ids.d2}/supersede`, { by_decision_id: id3 });
    expect([notDecided.status, message(notDecided)]).toEqual([
      400,
      "Only a decided decision can replace another.",
    ]);
    const creatingProposed = await post("/data/decisions", {
      title: "Proposed and replacing",
      status: "proposed",
      supersedes: ids.d2,
      attempt: randomUUID(),
    });
    expect(message(creatingProposed)).toBe("Only a decided decision can replace another.");
    const twice = await post(`/data/decisions/${ids.d1}/supersede`, { by_decision_id: ids.d2 });
    expect([twice.status, codeOf(twice), message(twice)]).toEqual([
      409,
      "already_superseded",
      "It is already superseded by “Flip to a US parent before the seed”.",
    ]);
    // Decided, it may replace D2; then D2 reads Superseded.
    await ok(`/data/decisions/${id3}/update`, { status: "decided" });
    const replaced = await ok(`/data/decisions/${ids.d2}/supersede`, { by_decision_id: id3 });
    expect(replaced.decision).toMatchObject({ status: "superseded", superseded_by: id3 });
    // Back to decided, it is replaced by nothing.
    const back = await ok(`/data/decisions/${ids.d2}/update`, { status: "decided" });
    expect(back.decision).toMatchObject({ status: "decided", superseded_by: null });
  });
});

describe("every refusal (raise spec §6.3)", () => {
  async function refused(path: string, body: Json, status: number, sentence: string) {
    const answer = await post(path, body);
    expect([answer.status, message(answer)], path).toEqual([status, sentence]);
    return answer;
  }

  it("the firm", async () => {
    await refused(
      "/data/notes",
      noteBody({ subject_id: "not-an-id" }),
      400,
      "Say which firm the note is about.",
    );
    await refused(
      "/data/notes",
      noteBody({ subject_kind: "waitlist", subject_id: FIRM_A }),
      400,
      "Say which firm the note is about.",
    );
    await refused(
      "/data/notes",
      noteBody({ subject_kind: "lead" }),
      400,
      "Say which firm the note is about.",
    );
    await refused(
      "/data/notes",
      noteBody({ subject_name: "" }),
      400,
      "Say which firm the note is about.",
    );
  });

  it("with the investors module's firms: an unknown firm is not here, a known one is named by it", async () => {
    expect(
      (await ok("/data/_test/notes/raise", { names: { [FIRM_A]: "Walk A Capital LLP" } }))
        .installed,
    ).toBe(true);
    try {
      const answer = await refused(
        "/data/notes",
        noteBody({ subject_id: FIRM_C }),
        404,
        "That firm is not here.",
      );
      expect(codeOf(answer)).toBe("not_found");
      const named = await addNote({ subject_name: "Typed by hand", title: "Named by the module" });
      expect(named.subject_name).toBe("Walk A Capital LLP");
      // A waitlist firm keeps the name the page sent.
      const waitlist = await addNote({
        subject_kind: "waitlist",
        subject_id: FIRM_B,
        subject_name: "Walk B Wealth",
      });
      expect(waitlist.subject_name).toBe("Walk B Wealth");
    } finally {
      await ok("/data/_test/notes/raise", { on: false });
    }
    const typed = await addNote({ subject_id: FIRM_C, subject_name: "Walk C Partners" });
    expect(typed.subject_name).toBe("Walk C Partners");
  });

  it("the note's fields", async () => {
    await refused("/data/notes", noteBody({ kind: "lunch" }), 400, "Choose the kind of note.");
    await refused(
      "/data/notes",
      noteBody({ held_on: addDays(today, 1) }),
      400,
      "That day is in the future.",
    );
    await refused("/data/notes", noteBody({ title: "  " }), 400, "Give the note a title.");
    const secret = await refused(
      "/data/notes",
      noteBody({ body: "the key is xkeysib-0123456789abcdef" }),
      400,
      SECRET_MESSAGE,
    );
    expect(codeOf(secret)).toBe("secret");
    await refused(
      "/data/notes",
      noteBody({ objections: Array.from({ length: 11 }, (_, i) => `Objection ${i}`).join("\n") }),
      400,
      "Ten objections at most on one note.",
    );
    await refused(
      "/data/notes",
      noteBody({
        actions: Array.from({ length: 11 }, (_, i) => ({
          title: `Action ${i}`,
          due_on: "",
          owner: "",
        })),
      }),
      400,
      "Ten actions at most on one note.",
    );
    await refused(
      "/data/notes",
      noteBody({ actions: [{ title: "Late", due_on: addDays(today, -1), owner: "" }] }),
      400,
      "That day is in the past.",
    );
    // Ten of each is fine; blank objection lines are dropped.
    const full = await addNote({
      objections: `\n${Array.from({ length: 10 }, (_, i) => `Objection ${i}`).join("\n\n")}\n`,
      actions: Array.from({ length: 10 }, (_, i) => ({
        title: `Action ${i}`,
        due_on: "",
        owner: "",
      })),
    });
    expect([full.objections.length, full.actions.length]).toEqual([10, 10]);
    await refused(
      `/data/notes/${full.note_id}/actions`,
      { title: "One more", due_on: "", owner: "", attempt: randomUUID() },
      400,
      "Ten actions at most on one note.",
    );
    await refused(
      `/data/notes/${full.note_id}/update`,
      { held_on: addDays(today, 2) },
      400,
      "That day is in the future.",
    );
  });

  it("an action added later may not be due before today", async () => {
    const note = await addNote({ title: "Later actions" });
    await refused(
      `/data/notes/${note.note_id}/actions`,
      { title: "Too late", due_on: addDays(today, -2), owner: "", attempt: randomUUID() },
      400,
      "That day is in the past.",
    );
    const added = (
      await ok(`/data/notes/${note.note_id}/actions`, {
        title: "In time",
        due_on: today,
        owner: "the CA",
        attempt: randomUUID(),
      })
    ).note as Note;
    expect(added.actions.map((item) => [item.title, item.due_on])).toEqual([["In time", today]]);
  });

  it("the FAQ and decisions", async () => {
    await refused(
      "/data/faq",
      { question: "", answer: "x", attempt: randomUUID() },
      400,
      "Write the question.",
    );
    await refused(
      "/data/decisions",
      { title: "", status: "decided", attempt: randomUUID() },
      400,
      "Write the decision.",
    );
    const entry = (await ok("/data/faq", { question: "Who owns the IP?", answer: "The company." }))
      .entry as Json;
    await refused(
      `/data/faq/${String(entry.faq_id)}/update`,
      { question: "" },
      400,
      "Write the question.",
    );
    const archived = (await ok(`/data/faq/${String(entry.faq_id)}/archive`, {})).entry as Json;
    expect(archived.archived).not.toBeNull();
    expect(((await get("/data/faq")).entries as Json[]).map((row) => row.faq_id)).not.toContain(
      entry.faq_id,
    );
    expect(
      ((await get("/data/faq?archived=1")).entries as Json[]).map((row) => row.faq_id),
    ).toContain(entry.faq_id);
    const restored = (await ok(`/data/faq/${String(entry.faq_id)}/restore`, {})).entry as Json;
    expect(restored.archived).toBeNull();
  });

  it("an unknown note, action, objection or decision is not here", async () => {
    const none = await post("/data/notes/no-such-note/withdraw", {});
    expect([none.status, codeOf(none)]).toEqual([404, "not_found"]);
    const note = await addNote({ title: "Lookups" });
    const action = await post(`/data/notes/${note.note_id}/actions/nope/done`, {});
    expect(message(action)).toBe("That action is not on this note.");
    const objection = await post(`/data/notes/${note.note_id}/objections/nope/answer`, {
      faq_id: "",
    });
    expect(message(objection)).toBe("That objection is not on this note.");
    const decision = await stack.ask("GET", "/data/decisions/nope");
    expect(decision.status).toBe(404);
  });
});
