/**
 * Notes (raise spec §6): dated notes on an investor firm or a waitlist firm, with what was
 * said, who was there, what they objected to and what is owed them; the Investor FAQ that
 * objections are answered from, so each answer is the same every time; and decisions,
 * made from a note or written in, each replaced only by a decided one.
 *
 * Open actions with a day reach Due on that day (kind "action") and the calendar's agenda
 * (`agenda:notes`); notes, FAQ entries and decisions are searchable (`search:notes`). A
 * note taken back leaves all three, and the FAQ's counts, until it is restored.
 *
 * Old notes written on a firm's page before this module stay in that firm's Activity:
 * nothing is copied or moved.
 */

import { createHash } from "node:crypto";

import type { Answer, DataCore, DueItem } from "../core";
import { clean, wholeNumber } from "../guard";
import type { Staff } from "../protocol";
import {
  RAISE_SERVICES,
  agendaService,
  searchService,
  type AgendaItem,
  type AgendaSource,
  type DataSearchHit,
  type DataSearchKind,
  type InvestorsRaise,
  type SearchSource,
} from "../raise-contracts";
import { findTerms, matchesTerms } from "../../../src/lib/merge/find";
import { DECISION_STATUSES, DECISION_STATUS_ORDER, NOTE_KINDS } from "../../../src/lib/data/labels";
import { NotesBook, byDecidedOn, byHeldOn, firmHref, isLive, openActions } from "./book";
import { NOTES_PAGE, NOTE_LIMITS, WALK_NOTE_ID } from "./limits";
import { snippetOf } from "./snippet";
import type { ActionItem, Decision, FaqEntry, Note } from "./types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "13 Nov 2026", as the pages print a calendar date; never shifted into a zone. */
function dayWords(day: string): string {
  const [year = "", month = "", date = ""] = day.split("-");
  return `${Number(date)} ${MONTHS[Number(month) - 1] ?? ""} ${year}`;
}

/** What a search of notes reads: the note, its objections and the firm's name. */
const noteText = (note: Note): string[] => [
  note.title,
  note.body,
  note.people,
  ...note.objections.map((objection) => objection.text),
  note.subject_name,
];
const faqText = (entry: FaqEntry): string[] => [entry.question, entry.answer];
const decisionText = (decision: Decision): string[] => [
  decision.title,
  decision.why,
  decision.decided_by,
];

/** Open actions sorted by their day (none last), done ones newest first. */
function byDue(a: ActionItem, b: ActionItem): number {
  if (a.state !== b.state) return a.state === "open" ? -1 : 1;
  if (a.state === "done") return (b.done_at ?? "").localeCompare(a.done_at ?? "");
  if (a.due_on !== b.due_on) {
    if (a.due_on === null) return 1;
    if (b.due_on === null) return -1;
    return a.due_on.localeCompare(b.due_on);
  }
  return a.created_at.localeCompare(b.created_at);
}

const offsetOf = (value: string | null) => Math.min(200_000, Math.max(0, wholeNumber(value, 0)));

export async function register(core: DataCore): Promise<void> {
  const book = new NotesBook(core);

  const rowOf = (note: Note) => ({
    ...note,
    open_actions: openActions(note).length,
    href: firmHref(note.subject),
  });

  const faqRowOf = (entry: FaqEntry) => ({ ...entry, ...book.asked(entry.faq_id) });

  // ---------------------------------------------------------------- Due and the agenda

  core.provideDue((): DueItem[] => {
    const today = core.day();
    const items: DueItem[] = [];
    for (const note of book.notes) {
      if (!isLive(note)) continue;
      for (const action of openActions(note)) {
        if (!action.due_on || action.due_on > today) continue;
        items.push({
          key: `action:${action.action_id}`,
          kind: "action",
          title: action.title,
          sub: `${note.subject_name} · from “${note.title}”`,
          due_on: action.due_on,
          href: `/data/notes/${note.note_id}`,
        });
      }
    }
    return items;
  });

  const agenda: AgendaSource = {
    agenda: (today) => {
      void today;
      const items: AgendaItem[] = [];
      for (const note of book.notes) {
        if (!isLive(note)) continue;
        for (const action of openActions(note)) {
          if (!action.due_on) continue;
          items.push({
            key: `action:${action.action_id}`,
            kind: "action",
            title: `${action.title} · ${note.subject_name}`,
            plain: "Action from a note",
            sub: `From “${note.title}”`,
            on: action.due_on,
            remind_days: [0],
            href: `/data/notes/${note.note_id}`,
          });
        }
      }
      return items.sort((a, b) => a.on.localeCompare(b.on) || a.title.localeCompare(b.title));
    },
  };
  core.provide(agendaService("notes"), agenda);

  // ---------------------------------------------------------------- search

  /** Best first: those whose title holds every word, then the rest, each in its own order. */
  const ranked = <T>(found: T[], terms: readonly string[], titleOf: (item: T) => string): T[] => [
    ...found.filter((item) => matchesTerms([titleOf(item)], terms)),
    ...found.filter((item) => !matchesTerms([titleOf(item)], terms)),
  ];

  const group = <T>(
    kind: DataSearchKind,
    found: T[],
    limit: number,
    hitOf: (item: T) => DataSearchHit,
  ) => ({ kind, count: found.length, hits: found.slice(0, Math.max(0, limit)).map(hitOf) });

  const search: SearchSource = {
    search: ({ terms, kind, limit }) => {
      if (terms.length === 0) return [];
      const wanted = (name: DataSearchKind) => kind === null || kind === name;
      const groups: ReturnType<SearchSource["search"]> = [];
      if (wanted("note")) {
        const found = ranked(
          book.notes
            .filter((note) => isLive(note) && matchesTerms(noteText(note), terms))
            .sort(byHeldOn),
          terms,
          (note) => note.title,
        );
        if (found.length)
          groups.push(
            group("note", found, limit, (note) => ({
              kind: "note",
              id: note.note_id,
              title: note.title,
              subtitle: `${NOTE_KINDS[note.kind]} · ${note.subject_name} · ${dayWords(note.held_on)}`,
              snippet: snippetOf(note.body, terms),
              href: `/data/notes/${note.note_id}`,
            })),
          );
      }
      if (wanted("faq")) {
        const found = ranked(
          book.faq
            .filter((entry) => entry.archived === null && matchesTerms(faqText(entry), terms))
            .sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
          terms,
          (entry) => entry.question,
        );
        if (found.length)
          groups.push(
            group("faq", found, limit, (entry) => ({
              kind: "faq",
              id: entry.faq_id,
              title: entry.question,
              subtitle: "Investor FAQ",
              snippet: snippetOf(entry.answer, terms),
              href: `/data/notes?view=faq#faq-${entry.faq_id}`,
            })),
          );
      }
      if (wanted("decision")) {
        const found = ranked(
          book.decisions
            .filter((decision) => matchesTerms(decisionText(decision), terms))
            .sort(byDecidedOn),
          terms,
          (decision) => decision.title,
        );
        if (found.length)
          groups.push(
            group("decision", found, limit, (decision) => ({
              kind: "decision",
              id: decision.decision_id,
              title: decision.title,
              subtitle: `${DECISION_STATUSES[decision.status].label} · ${
                decision.decided_on ? dayWords(decision.decided_on) : "No day"
              }`,
              snippet: snippetOf(decision.why, terms),
              href: `/data/decisions#decision-${decision.decision_id}`,
            })),
          );
      }
      return groups;
    },
  };
  core.provide(searchService("notes"), search);

  // ---------------------------------------------------------------- notes

  core.route("GET", "/data/notes", (ctx) => {
    const subjectKind = clean(ctx.query.get("subject_kind"), 20);
    const subjectId = clean(ctx.query.get("subject_id"), 64).toLowerCase();
    const kind = clean(ctx.query.get("kind"), 20);
    const terms = findTerms(clean(ctx.query.get("q"), NOTE_LIMITS.search));
    const withdrawn = ctx.query.get("withdrawn") === "1";
    const offset = offsetOf(ctx.query.get("offset"));
    const chosen = book.notes
      .filter(
        (note) =>
          (withdrawn || isLive(note)) &&
          (!subjectKind || note.subject.kind === subjectKind) &&
          (!subjectId || note.subject.id === subjectId) &&
          matchesTerms(noteText(note), terms),
      )
      .sort(byHeldOn);
    const counts: Record<string, number> = { all: chosen.length };
    for (const key of Object.keys(NOTE_KINDS)) counts[key] = 0;
    for (const note of chosen) counts[note.kind] = (counts[note.kind] ?? 0) + 1;
    const shown = kind in NOTE_KINDS ? chosen.filter((note) => note.kind === kind) : chosen;
    return {
      notes: shown.slice(offset, offset + NOTES_PAGE).map(rowOf),
      total: shown.length,
      offset,
      limit: NOTES_PAGE,
      counts,
      today: core.day(),
    };
  });

  const noteAnswer = (note: Note): Answer => ({ note });

  core.route("GET", "/data/notes/:id", (ctx) => {
    const note = book.note(ctx.params[0]);
    const linked = new Set(note.objections.map((objection) => objection.faq_id).filter(Boolean));
    return {
      note,
      firm_href: firmHref(note.subject),
      decision: note.decision_id
        ? (book.decisions.find((item) => item.decision_id === note.decision_id) ?? null)
        : null,
      faq: book.faq.filter((entry) => linked.has(entry.faq_id)),
      events: book.eventsOf("note", note.note_id),
      today: core.day(),
    };
  });

  core.route("POST", "/data/notes", (ctx) => {
    const by = ctx.staff();
    return noteAnswer(book.addNote(ctx.body, by, core.day()));
  });

  core.route("POST", "/data/notes/:id/update", (ctx) => {
    const by = ctx.staff();
    return noteAnswer(book.updateNote(book.note(ctx.params[0]), ctx.body, by, core.day()));
  });

  core.route("POST", "/data/notes/:id/withdraw", (ctx) => {
    const by = ctx.staff();
    return noteAnswer(book.withdraw(book.note(ctx.params[0]), by));
  });

  core.route("POST", "/data/notes/:id/restore", (ctx) => {
    const by = ctx.staff();
    return noteAnswer(book.restore(book.note(ctx.params[0]), by));
  });

  core.route("POST", "/data/notes/:id/actions", (ctx) => {
    const by = ctx.staff();
    return noteAnswer(book.addAction(book.note(ctx.params[0]), ctx.body, by, core.day()));
  });

  core.route("POST", "/data/notes/:id/actions/:actionId/done", (ctx) => {
    const by = ctx.staff();
    return noteAnswer(book.doneAction(book.note(ctx.params[0]), ctx.params[1], by));
  });

  core.route("POST", "/data/notes/:id/actions/:actionId/reopen", (ctx) => {
    const by = ctx.staff();
    return noteAnswer(book.reopenAction(book.note(ctx.params[0]), ctx.params[1], by));
  });

  core.route("POST", "/data/notes/:id/actions/:actionId/move", (ctx) => {
    const by = ctx.staff();
    return noteAnswer(
      book.moveAction(book.note(ctx.params[0]), ctx.params[1], ctx.body.due_on, by),
    );
  });

  core.route("POST", "/data/notes/:id/objections/:objectionId/answer", (ctx) => {
    const by = ctx.staff();
    return book.answer(book.note(ctx.params[0]), ctx.params[1], ctx.body, by);
  });

  core.route("POST", "/data/notes/:id/decision", (ctx) => {
    const by = ctx.staff();
    const note = book.note(ctx.params[0]);
    const decision = book.decideFromNote(note, ctx.body, by);
    return { note, decision };
  });

  // ---------------------------------------------------------------- actions, across notes

  core.route("GET", "/data/note-actions", (ctx) => {
    const today = core.day();
    const asked = clean(ctx.query.get("state"), 10);
    const state = asked === "done" || asked === "all" ? asked : "open";
    const offset = offsetOf(ctx.query.get("offset"));
    const all = book.notes.filter(isLive).flatMap((note) =>
      note.actions.map((action) => ({
        ...action,
        note_id: note.note_id,
        note_title: note.title,
        subject: note.subject,
        subject_name: note.subject_name,
        firm_href: firmHref(note.subject),
      })),
    );
    const open = all.filter((action) => action.state === "open");
    const shown = (state === "all" ? all : all.filter((action) => action.state === state)).sort(
      byDue,
    );
    return {
      actions: shown.slice(offset, offset + NOTES_PAGE),
      total: shown.length,
      offset,
      limit: NOTES_PAGE,
      counts: {
        open: open.length,
        done: all.length - open.length,
        overdue: open.filter((action) => action.due_on !== null && action.due_on < today).length,
      },
      today,
    };
  });

  // ---------------------------------------------------------------- the FAQ

  core.route("GET", "/data/faq", (ctx) => {
    const terms = findTerms(clean(ctx.query.get("q"), NOTE_LIMITS.search));
    const archived = ctx.query.get("archived") === "1";
    const entries = book.faq
      .filter(
        (entry) => (archived || entry.archived === null) && matchesTerms(faqText(entry), terms),
      )
      .map(faqRowOf)
      .sort(
        (a, b) =>
          Number(a.archived !== null) - Number(b.archived !== null) ||
          b.asked - a.asked ||
          b.updated_at.localeCompare(a.updated_at),
      );
    return { entries, total: entries.length };
  });

  core.route("POST", "/data/faq", (ctx) => {
    const by = ctx.staff();
    return { entry: faqRowOf(book.addFaq(ctx.body, by)) };
  });

  core.route("POST", "/data/faq/:id/update", (ctx) => {
    const by = ctx.staff();
    return { entry: faqRowOf(book.updateFaq(book.faqEntry(ctx.params[0]), ctx.body, by)) };
  });

  core.route("POST", "/data/faq/:id/archive", (ctx) => {
    const by = ctx.staff();
    return { entry: faqRowOf(book.archiveFaq(book.faqEntry(ctx.params[0]), by)) };
  });

  core.route("POST", "/data/faq/:id/restore", (ctx) => {
    const by = ctx.staff();
    return { entry: faqRowOf(book.restoreFaq(book.faqEntry(ctx.params[0]), by)) };
  });

  // ---------------------------------------------------------------- decisions

  const titleOf = (id: string | null): string =>
    id ? (book.decisions.find((item) => item.decision_id === id)?.title ?? "") : "";

  core.route("GET", "/data/decisions", (ctx) => {
    const status = clean(ctx.query.get("status"), 20);
    const terms = findTerms(clean(ctx.query.get("q"), NOTE_LIMITS.search));
    const offset = offsetOf(ctx.query.get("offset"));
    const searched = book.decisions
      .filter((decision) => matchesTerms(decisionText(decision), terms))
      .sort(byDecidedOn);
    const counts: Record<string, number> = { all: searched.length };
    for (const key of DECISION_STATUS_ORDER) counts[key] = 0;
    for (const decision of searched) counts[decision.status] = (counts[decision.status] ?? 0) + 1;
    const shown =
      status in DECISION_STATUSES
        ? searched.filter((decision) => decision.status === status)
        : searched;
    return {
      decisions: shown.slice(offset, offset + NOTES_PAGE).map((decision) => ({
        ...decision,
        superseded_by_title: titleOf(decision.superseded_by),
        // The page's "From" names the note; the decision keeps only its id and firm.
        from_note_title: decision.from_note
          ? (book.notes.find((note) => note.note_id === decision.from_note?.note_id)?.title ?? "")
          : "",
      })),
      total: shown.length,
      offset,
      limit: NOTES_PAGE,
      counts,
    };
  });

  core.route("GET", "/data/decisions/:id", (ctx) => {
    const decision = book.decision(ctx.params[0]);
    return {
      decision,
      superseded_by: decision.superseded_by
        ? (book.decisions.find((item) => item.decision_id === decision.superseded_by) ?? null)
        : null,
      supersedes: book.decisions.filter((item) => item.superseded_by === decision.decision_id),
      events: book.eventsOf("decision", decision.decision_id),
    };
  });

  core.route("POST", "/data/decisions", (ctx) => {
    const by = ctx.staff();
    return { decision: book.addDecision(ctx.body, by) };
  });

  core.route("POST", "/data/decisions/:id/update", (ctx) => {
    const by = ctx.staff();
    return { decision: book.updateDecision(book.decision(ctx.params[0]), ctx.body, by) };
  });

  core.route("POST", "/data/decisions/:id/supersede", (ctx) => {
    const by = ctx.staff();
    return {
      decision: book.supersede(book.decision(ctx.params[0]), ctx.body.by_decision_id, by),
    };
  });

  // ---------------------------------------------------------------- test routes

  if (core.testRoutes) {
    /**
     * The walk's pinned note, once: "Walk first call" on the investor firm at
     * fund281.example, with one objection and one action due today. The firm's name is the
     * investors module's when it knows the firm.
     */
    core.route("POST", "/data/_test/notes/seed", (ctx) => {
      const by: Staff = ctx.staff();
      const existing = book.notes.find((note) => note.note_id === WALK_NOTE_ID);
      if (existing) return { note: existing, created: false };
      const today = core.day();
      const subjectId = WALK_FIRM_ID;
      const name =
        core.need<InvestorsRaise>(RAISE_SERVICES.investorsRaise)?.name(subjectId) ??
        core.need<FirmByEmail>("investors")?.forEmail("partner281@fund281.example")?.firm ??
        "Walk Fund 281";
      const note = book.addNote(
        {
          subject_kind: "investor",
          subject_id: subjectId,
          subject_name: name,
          kind: "call",
          held_on: today,
          title: "Walk first call",
          body: "Invented: a first call with the partner. They asked why India comes first and how the pilot is going. They want the pilot summary before a second meeting.",
          people: "Asha281 Rao281, partner",
          objections: "Why India first?",
          actions: [{ title: "Send the pilot summary", due_on: today, owner: "Walk Owner" }],
        },
        by,
        today,
        WALK_NOTE_ID,
      );
      return { note, created: true };
    });

    core.route("GET", "/data/_test/notes/agenda", () => ({
      items: core.need<AgendaSource>(agendaService("notes"))?.agenda(core.day()) ?? [],
      today: core.day(),
    }));

    core.route("GET", "/data/_test/notes/search", (ctx) => {
      const query = clean(ctx.query.get("q"), NOTE_LIMITS.search);
      const kind = clean(ctx.query.get("kind"), 20) as DataSearchKind | "";
      const input = {
        query,
        terms: findTerms(query),
        kind: kind || null,
        limit: Math.min(50, Math.max(0, wholeNumber(ctx.query.get("limit"), 5))),
      };
      return {
        notes: core.need<SearchSource>(searchService("notes"))?.search(input) ?? [],
        contacts: core.need<SearchSource>(searchService("contacts"))?.search(input) ?? [],
      };
    });

    // A stand-in for U1's `investors-raise` (raise spec §3.2): installed only when no real
    // one is here, so a test can prove a note's firm is checked and named by it.
    const names = new Map<string, string>();
    const fake: InvestorsRaise = {
      funnel: () => {
        throw new Error("not in the stand-in");
      },
      firmOptions: () =>
        [...names].map(([investor_id, firm]) => ({ investor_id, firm, stage: "written" })),
      recipients: () => [],
      name: (investorId) => names.get(investorId) ?? null,
    };
    core.route("POST", "/data/_test/notes/raise", (ctx) => {
      ctx.staff();
      const current = core.need<InvestorsRaise>(RAISE_SERVICES.investorsRaise);
      if (ctx.body.on === false) {
        if (current === fake) core.provide(RAISE_SERVICES.investorsRaise, null);
        return { installed: false };
      }
      if (current && current !== fake) return { installed: false, real: true };
      names.clear();
      const given = ctx.body.names;
      if (given && typeof given === "object" && !Array.isArray(given))
        for (const [id, firm] of Object.entries(given as Record<string, unknown>))
          if (typeof firm === "string") names.set(id, firm);
      core.provide(RAISE_SERVICES.investorsRaise, fake);
      return { installed: true };
    });
  }
}

/** The walk's invented investor firm's id, made as the investors module makes it. */
const WALK_FIRM_ID = createHash("sha256")
  .update("investor:fund281.example")
  .digest("hex")
  .slice(0, 32);

/** The one thing the seed asks the investors module (it is there in every copy). */
type FirmByEmail = { forEmail(email: string): { firm: string } | null };
