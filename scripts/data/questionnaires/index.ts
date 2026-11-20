/**
 * Questionnaires and the answer library (ws-notes/security/spec.md §9): approved answers with
 * CAIQ and other IDs, their evidence and a yearly look; buyers' questionnaires imported from
 * CSV or XLSX in two steps; matching by ID and by words, never automatic; answering; export
 * back to CSV and XLSX with their own columns; the kind "CAIQ" for STAR Level 1 (he imports
 * his own copy of CSA's file; nothing of it ships here).
 *
 * Provides `questionnaires` (`QuestionnairesLookup`, and `forDiligence` for U4's diligence
 * lines), `search:questionnaires` over the library (a buyer's questions are never searched),
 * Due rows for a questionnaire not linked to a diligence, the overview block, and builds for
 * the exports (the host streams builds' bytes only). Nothing here sends, files or fetches:
 * marking a questionnaire sent records what he did.
 */

import { randomUUID } from "node:crypto";

import { Refused } from "../../mail-merge/engine";
import { FOLDERS, anyDay, full, invalid, pastDay } from "../closing/limits";
import type { UsedFor } from "../company-contracts";
import type { Answer, DataCore, DueItem } from "../core";
import { addDays } from "../days";
import {
  DILIGENCE_QUESTIONNAIRE,
  type DiligenceQuestionnaire,
  type QuestionnairesForDiligence,
} from "../diligence/questionnaire";
import { QUESTIONNAIRE_AHEAD } from "../diligence/limits";
import { LIMITS, clean, cleanText, isUuid, wholeNumber } from "../guard";
import type { FilesService } from "../leads/contracts";
import { fileChoices } from "../meetings/copy";
import { findTerms, matchesTerms } from "../../../src/lib/merge/find";
import type { Staff } from "../protocol";
import {
  RAISE_SERVICES,
  searchService,
  type SearchSource,
  type WaitlistFeed,
} from "../raise-contracts";
import {
  SECURITY_SERVICES,
  standInSource,
  type EvidenceOption,
  type EvidenceSource,
  type QuestionnaireLine,
  type SummaryLine,
} from "../security-contracts";
import { toCsv } from "../text";
import { dayWords } from "../../../src/lib/data/labels-company";
import { countWords } from "../../../src/lib/data/labels-controls";
import {
  ANSWER_STATE_WORDS,
  LINKED_DUE,
  SHORT_WORDS,
  SSRM_WORDS,
  TOPIC_WORDS,
  answeredWords,
} from "../../../src/lib/data/labels-questionnaires";
import { QuestionnairesBook } from "./book";
import { mapOf, questionsOf } from "./columns";
import { BOM, exportCsv, exportName, exportXlsx } from "./export";
import { ImportRefused, previewOf, readSheets } from "./import";
import {
  EVIDENCE_SOURCES,
  WORDS,
  answerFieldsOf,
  approvalOf,
  evidenceViews,
  reviewDue,
  shortOf,
  ssrmOf,
  type EvidenceSourceName,
} from "./library";
import {
  ANSWER_LIMITS,
  NO_QUESTIONS_WORDS,
  QUESTIONNAIRE_LIMITS,
  QUESTIONNAIRE_MAX_BYTES,
  TOO_LARGE_WORDS,
  EMPTY_WORDS,
} from "./limits";
import { caiqIdOf, idMatches, otherIdOf, prepare, suggestionsFor, type Prepared } from "./match";
import type { LibraryAnswer, Question, Questionnaire, QuestionnaireKind } from "./types";
import { WALK_ANSWERS, WALK_FILE_NAME, walkWorkbook } from "./walk-seed";

const KINDS: readonly QuestionnaireKind[] = ["buyer", "caiq", "other"];
const ANSWER_VIEWS = ["approved", "draft", "archived", "review_due"] as const;
const QUESTIONNAIRE_STATES = ["open", "sent", "closed"] as const;
const BASE = "/data/waitlist/diligence";

const errorName = (error: unknown): string => (error instanceof Error ? error.name : "error");

/** The stand-ins this module installs (test routes only), so its own route may take them away. */
const FAKES = new WeakSet<object>();

export function register(core: DataCore): void {
  const book = new QuestionnairesBook(core);

  // ---------------------------------------------------------------- the other modules, asked now

  const files = () => core.need<FilesService>("files");
  const feed = () => core.need<WaitlistFeed>(RAISE_SERVICES.waitlistFeed);
  const inside = () => core.need<DiligenceQuestionnaire>(DILIGENCE_QUESTIONNAIRE);
  const fileRow = (fileId: string) => files()?.fileRow(fileId) ?? null;

  const entryOf = (entryId: string): { entry_id: string; firm: string; stage: string } | null => {
    try {
      const found = feed()
        ?.entries()
        .find((entry) => entry.entry_id === entryId);
      return found ? { entry_id: found.entry_id, firm: found.firm, stage: found.stage } : null;
    } catch (error) {
      core.log(`questionnaires: the waitlist could not be read: ${errorName(error)}`);
      return null;
    }
  };

  const optionsOf = (name: EvidenceSourceName): EvidenceOption[] | null => {
    const source = core.need<EvidenceSource>(name);
    if (!source || typeof source.evidence !== "function") return null;
    try {
      return source.evidence(core.day());
    } catch (error) {
      core.log(`questionnaires: ${name}'s evidence could not be read: ${errorName(error)}`);
      return [];
    }
  };
  const evidenceOptions = () => {
    const options: EvidenceOption[] = [];
    const absent: string[] = [];
    for (const source of EVIDENCE_SOURCES) {
      const found = optionsOf(source.name);
      if (found === null) absent.push(source.label);
      else options.push(...found);
    }
    return { options, absent };
  };

  const evidenceOf = (answer: LibraryAnswer) =>
    evidenceViews(answer.evidence, {
      options: optionsOf,
      fileRow,
      filesHere: files() !== null,
    });

  // ---------------------------------------------------------------- the questionnaires, worked out

  const answeredOf = (questionnaire: Questionnaire) =>
    questionnaire.questions.filter((question) => question.answer !== null).length;

  const diligenceOf = (questionnaire: Questionnaire) =>
    questionnaire.diligence_id ? (inside()?.get(questionnaire.diligence_id) ?? null) : null;

  /** The one due day: a linked diligence's questionnaire day, else its own. */
  const dueOf = (questionnaire: Questionnaire): string | null =>
    questionnaire.diligence_id
      ? (diligenceOf(questionnaire)?.due_on ?? null)
      : questionnaire.due_on;

  const hrefOf = (questionnaire: Questionnaire) =>
    `${BASE}/questionnaires/${questionnaire.questionnaire_id}`;

  const lineOf = (questionnaire: Questionnaire): QuestionnaireLine => ({
    questionnaire_id: questionnaire.questionnaire_id,
    title: questionnaire.title,
    answered: answeredOf(questionnaire),
    total: questionnaire.questions.length,
    state: questionnaire.state,
    href: hrefOf(questionnaire),
  });

  const rowOf = (questionnaire: Questionnaire) => ({
    ...lineOf(questionnaire),
    kind: questionnaire.kind,
    firm: questionnaire.firm,
    entry_id: questionnaire.entry_id,
    diligence_id: questionnaire.diligence_id,
    received_on: questionnaire.received_on,
    due_on: dueOf(questionnaire),
  });

  const approved = () => book.answers.filter((answer) => answer.state === "approved");

  const nameOf = (questionnaire: Questionnaire) =>
    questionnaire.firm ? `${questionnaire.firm}'s questionnaire` : questionnaire.title;

  // ---------------------------------------------------------------- what other modules ask

  const used: UsedFor = {
    usedFor: (fileId) => {
      const found: { label: string; href: string }[] = [];
      for (const questionnaire of book.questionnaires) {
        const href = hrefOf(questionnaire);
        if (questionnaire.source.file_id === fileId)
          found.push({ label: `${nameOf(questionnaire)} as received`, href });
        const kept =
          questionnaire.kept.some((item) => item.file_id === fileId) ||
          questionnaire.sent?.file_id === fileId;
        if (kept) found.push({ label: `Answers to ${nameOf(questionnaire)}`, href });
      }
      for (const answer of book.answers)
        if (answer.state !== "archived" && answer.evidence.includes(`file:${fileId}`))
          found.push({
            label:
              answer.state === "approved"
                ? "Evidence for an approved answer"
                : "Evidence for a draft answer",
            href: `${BASE}/answers/${answer.answer_id}`,
          });
      return found;
    },
  };

  const summary = (today: string): SummaryLine[] => {
    const open = book.questionnaires.filter((item) => item.state === "open");
    const lines: SummaryLine[] = [];
    const soon = addDays(today, QUESTIONNAIRE_AHEAD);
    const parts = open.map((item) => {
      const due = dueOf(item);
      const who = item.firm || item.title;
      return `${who} ${answeredWords(answeredOf(item), item.questions.length)}${due ? `, due ${dayWords(due)}` : ""}`;
    });
    lines.push({
      key: "questionnaires",
      area: "buyers",
      title: "Questionnaires",
      words:
        open.length === 0
          ? "No open questionnaires."
          : `${countWords(open.length, "open questionnaire")}: ${parts.join("; ")}.`,
      attention: open.some((item) => {
        const due = dueOf(item);
        return due !== null && due <= soon;
      }),
      href: `${BASE}/questionnaires`,
    });
    const ready = approved();
    const due = ready.filter((answer) => reviewDue(answer, today)).length;
    lines.push({
      key: "library",
      area: "buyers",
      title: "Answer library",
      words: `${countWords(ready.length, "approved answer")}; ${due === 0 ? "none" : due} due for review.`,
      attention: due > 0,
      href: `${BASE}/answers`,
    });
    const caiq = book.questionnaires
      .filter((item) => item.kind === "caiq" && item.state !== "closed")
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    if (caiq)
      lines.push({
        key: "caiq",
        area: "buyers",
        title: "The CAIQ",
        words: `The CAIQ for STAR Level 1: ${answeredWords(answeredOf(caiq), caiq.questions.length)}.`,
        attention: false,
        href: hrefOf(caiq),
      });
    return lines;
  };

  const service: Required<QuestionnairesForDiligence> = {
    ...used,
    summary: (today: string) => summary(today),
    evidence: () => [] as EvidenceOption[],
    forEntry: (entryId: string) =>
      book.questionnaires
        .filter((item) => item.entry_id === entryId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map(lineOf),
    forDiligence: (diligenceId: string) => {
      const linked = book.questionnaires
        .filter((item) => item.diligence_id === diligenceId && item.state !== "closed")
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      return linked ? lineOf(linked) : null;
    },
  };
  core.provide(SECURITY_SERVICES.questionnaires, service);

  core.provideDue((): DueItem[] => {
    const today = core.day();
    const items: DueItem[] = [];
    for (const item of book.questionnaires) {
      if (item.state !== "open" || item.diligence_id || !item.due_on) continue;
      if (item.due_on > addDays(today, QUESTIONNAIRE_AHEAD)) continue;
      items.push({
        key: `questionnaire:${item.questionnaire_id}`,
        kind: "diligence",
        title: `Answer ${item.title}`,
        sub: answeredWords(answeredOf(item), item.questions.length),
        due_on: item.due_on,
        href: hrefOf(item),
      });
    }
    return items;
  });

  core.provideOverview("questionnaires", () => {
    const today = core.day();
    const open = book.questionnaires.filter((item) => item.state === "open");
    return {
      open: open.length,
      sent: book.questionnaires.filter((item) => item.state === "sent").length,
      questions_open: open.reduce((sum, item) => sum + item.questions.length, 0),
      answered_open: open.reduce((sum, item) => sum + answeredOf(item), 0),
      approved: approved().length,
      review_due: approved().filter((answer) => reviewDue(answer, today)).length,
      next_due:
        open
          .map(dueOf)
          .filter((day): day is string => day !== null)
          .sort()[0] ?? null,
    };
  });

  const search: SearchSource = {
    search: ({ terms, kind, limit }) => {
      if (terms.length === 0 || (kind !== null && kind !== "answer")) return [];
      const found = book.answers
        .filter((answer) => answer.state !== "archived")
        .filter((answer) =>
          matchesTerms(
            [answer.question, answer.answer, ...answer.caiq_ids, ...answer.other_ids],
            terms,
          ),
        )
        .sort((a, b) => a.question.localeCompare(b.question));
      if (found.length === 0) return [];
      return [
        {
          kind: "answer",
          count: found.length,
          hits: found.slice(0, Math.max(0, limit)).map((answer) => ({
            kind: "answer" as const,
            id: answer.answer_id,
            title: answer.question,
            subtitle: `${TOPIC_WORDS[answer.topic]} · ${ANSWER_STATE_WORDS[answer.state].toLowerCase()}`,
            snippet: snippet(answer.answer, terms),
            href: `${BASE}/answers/${answer.answer_id}`,
          })),
        },
      ];
    },
  };
  core.provide(searchService("questionnaires"), search);

  // ---------------------------------------------------------------- the library: reading

  const answerRow = (answer: LibraryAnswer, today: string) => {
    const evidence = evidenceOf(answer);
    return {
      ...answer,
      review_due: reviewDue(answer, today),
      evidence_lapsed: evidence.filter((item) => "current" in item && !item.current).length,
      evidence_missing: evidence.filter((item) => "missing" in item).length,
      used: usedIn(answer.answer_id).length,
    };
  };

  const usedIn = (answerId: string) => {
    const found: { questionnaire_id: string; title: string; row: number }[] = [];
    for (const questionnaire of book.questionnaires)
      for (const question of questionnaire.questions)
        if (question.answer?.answer_id === answerId)
          found.push({
            questionnaire_id: questionnaire.questionnaire_id,
            title: questionnaire.title,
            row: question.row,
          });
    return found;
  };

  const counts = (today: string) => ({
    approved: book.answers.filter((answer) => answer.state === "approved").length,
    draft: book.answers.filter((answer) => answer.state === "draft").length,
    archived: book.answers.filter((answer) => answer.state === "archived").length,
    review_due: book.answers.filter((answer) => reviewDue(answer, today)).length,
  });

  const topics = () => Object.entries(TOPIC_WORDS).map(([key, label]) => ({ key, label }));

  core.route("GET", "/data/answers", (ctx) => {
    const today = core.day();
    const view = clean(ctx.query.get("state"), 20);
    const topic = clean(ctx.query.get("topic"), 30);
    const q = clean(ctx.query.get("q"), LIMITS.search);
    const terms = q ? findTerms(q) : [];
    const shown = book.answers
      .filter((answer) => {
        if (view === "review_due") return reviewDue(answer, today);
        if ((ANSWER_VIEWS as readonly string[]).includes(view)) return answer.state === view;
        return answer.state !== "archived";
      })
      .filter((answer) => !topic || answer.topic === topic)
      .filter(
        (answer) =>
          terms.length === 0 ||
          matchesTerms(
            [answer.question, answer.answer, ...answer.caiq_ids, ...answer.other_ids],
            terms,
          ),
      )
      .sort((a, b) => a.question.localeCompare(b.question));
    const evidence = evidenceOptions();
    return {
      answers: shown.map((answer) => answerRow(answer, today)),
      counts: counts(today),
      topics: topics(),
      evidence_options: evidence.options,
      sources_absent: evidence.absent,
      files: fileChoices(core),
      files_here: files() !== null,
      review_months: book.setup.review_months,
      state: view,
      topic,
      q,
      today,
    };
  });

  // ---------------------------------------------------------------- the library: writing

  const touch = (record: { updated_at: string; updated_by: Staff }, by: Staff) => {
    record.updated_at = core.now();
    record.updated_by = by;
  };

  core.route("POST", "/data/answers", (ctx) => {
    const by = ctx.staff();
    full(book.answers.length, ANSWER_LIMITS.answers, "answers");
    const fields = answerFieldsOf(ctx.body, fileRow);
    const at = core.now();
    const answer: LibraryAnswer = {
      answer_id: randomUUID(),
      ...fields,
      state: "draft",
      approved: null,
      review_by: null,
      created_at: at,
      created_by: by,
      updated_at: at,
      updated_by: by,
    };
    book.answers.push(answer);
    book.saveAnswers();
    book.log("answer", answer.answer_id, "added", fields.question.slice(0, 80), by);
    return { answer };
  });

  core.route("POST", "/data/answers/setup", (ctx) => {
    const by = ctx.staff();
    const given = clean(ctx.body.review_months, 4);
    let months: number | null = null;
    if (given) {
      const number = wholeNumber(given, -1);
      if (number < 1 || number > 60)
        throw invalid("Give the months between looks as a whole number, from 1 to 60.");
      months = number;
    }
    book.setup.review_months = months;
    book.saveSetup();
    book.log(
      "setup",
      "setup",
      "review months",
      months === null ? "HQ's default" : String(months),
      by,
    );
    return { setup: { review_months: months } };
  });

  core.route("POST", "/data/answers/:id/update", (ctx) => {
    const by = ctx.staff();
    const answer = book.mustAnswer(ctx.params[0]);
    const fields = answerFieldsOf(ctx.body, fileRow);
    Object.assign(answer, fields);
    const typed = clean(ctx.body.review_by, 10);
    if (typed) {
      const day = anyDay(typed);
      if (answer.state === "approved" && day) answer.review_by = day;
    }
    touch(answer, by);
    book.saveAnswers();
    book.log("answer", answer.answer_id, "edited", "", by);
    return { answer };
  });

  core.route("POST", "/data/answers/:id/approve", (ctx) => {
    const by = ctx.staff();
    const answer = book.mustAnswer(ctx.params[0]);
    if (answer.state === "archived") throw invalid("Restore the answer before approving it.");
    const made = approvalOf(ctx.body, core.day(), book.setup.review_months);
    answer.state = "approved";
    answer.approved = made.approved;
    answer.review_by = made.review_by;
    touch(answer, by);
    book.saveAnswers();
    book.log(
      "answer",
      answer.answer_id,
      "approved",
      `by ${made.approved.by_name} on ${dayWords(made.approved.on)}`,
      by,
    );
    return { answer };
  });

  core.route("POST", "/data/answers/:id/archive", (ctx) => {
    const by = ctx.staff();
    const answer = book.mustAnswer(ctx.params[0]);
    answer.state = "archived";
    touch(answer, by);
    book.saveAnswers();
    book.log("answer", answer.answer_id, "archived", "", by);
    return { answer };
  });

  core.route("POST", "/data/answers/:id/restore", (ctx) => {
    const by = ctx.staff();
    const answer = book.mustAnswer(ctx.params[0]);
    if (answer.state === "archived") answer.state = answer.approved ? "approved" : "draft";
    touch(answer, by);
    book.saveAnswers();
    book.log("answer", answer.answer_id, "restored", ANSWER_STATE_WORDS[answer.state], by);
    return { answer };
  });

  core.route("GET", "/data/answers/:id", (ctx) => {
    const today = core.day();
    const answer = book.mustAnswer(ctx.params[0]);
    const evidence = evidenceOptions();
    return {
      answer: answerRow(answer, today),
      used_in: usedIn(answer.answer_id),
      evidence: evidenceOf(answer),
      events: book.events("answer", answer.answer_id).slice(0, 50),
      topics: topics(),
      evidence_options: evidence.options,
      sources_absent: evidence.absent,
      files: fileChoices(core),
      files_here: files() !== null,
      review_months: book.setup.review_months,
      today,
    };
  });

  core.builds.provide("answers_csv", async (handle) => {
    const { writeFileSync } = await import("node:fs");
    const rows = [...book.answers]
      .sort((a, b) => a.question.localeCompare(b.question))
      .map((answer) => [
        answer.question,
        SHORT_WORDS[answer.short],
        answer.answer,
        TOPIC_WORDS[answer.topic],
        answer.caiq_ids.join(" "),
        answer.other_ids.join(" "),
        SSRM_WORDS[answer.ssrm],
        answer.evidence.join(" "),
        answer.owner,
        ANSWER_STATE_WORDS[answer.state],
        answer.approved?.by_name ?? "",
        answer.approved?.on ?? "",
        answer.review_by ?? "",
      ]);
    handle.setProgress(0, rows.length);
    writeFileSync(
      handle.path,
      BOM +
        toCsv(
          [
            "Question",
            "Short answer",
            "Answer",
            "Topic",
            "CAIQ IDs",
            "Other IDs",
            "Ownership",
            "Evidence",
            "Owner",
            "State",
            "Approved by",
            "Approved on",
            "Review by",
          ],
          rows,
        ),
      { mode: 0o600 },
    );
    handle.setProgress(rows.length, rows.length);
    return { name: `Answer library ${core.day()}.csv`, type: "text/csv; charset=utf-8" };
  });

  // ---------------------------------------------------------------- questionnaires: reading

  const firms = () => {
    let entries: ReturnType<WaitlistFeed["entries"]> = [];
    try {
      entries = feed()?.entries() ?? [];
    } catch {
      entries = [];
    }
    return entries
      .map((entry) => {
        const open = inside()?.openFor(entry.entry_id) ?? null;
        return {
          entry_id: entry.entry_id,
          firm: entry.firm,
          stage: entry.stage,
          diligence_id: open?.diligence_id ?? null,
          due_on: open?.due_on ?? null,
        };
      })
      .sort((a, b) => a.firm.localeCompare(b.firm, "en", { sensitivity: "base", numeric: true }));
  };

  core.route("GET", "/data/questionnaires", (ctx) => {
    const state = clean(ctx.query.get("state"), 10);
    const shown = book.questionnaires
      .filter(
        (item) =>
          !(QUESTIONNAIRE_STATES as readonly string[]).includes(state) || item.state === state,
      )
      .sort(
        (a, b) =>
          (a.state === "open" ? 0 : 1) - (b.state === "open" ? 0 : 1) ||
          b.received_on.localeCompare(a.received_on) ||
          a.title.localeCompare(b.title),
      );
    return {
      questionnaires: shown.map(rowOf),
      counts: {
        open: book.questionnaires.filter((item) => item.state === "open").length,
        sent: book.questionnaires.filter((item) => item.state === "sent").length,
        closed: book.questionnaires.filter((item) => item.state === "closed").length,
      },
      firms: firms(),
      files_here: files() !== null,
      state,
      today: core.day(),
    };
  });

  /** A question as the page shows it: no cells (their file, in Files), its suggestions worked out now. */
  const questionView = (question: Question, prepared: readonly Prepared[]) => ({
    row: question.row,
    qid: question.qid,
    section: question.section,
    text: question.text,
    answer: question.answer,
    suggestions: question.answer ? [] : suggestionsFor(question, prepared),
  });

  core.route("GET", "/data/questionnaires/:id", (ctx) => {
    const today = core.day();
    const questionnaire = book.mustQuestionnaire(ctx.params[0]);
    const prepared = prepare(approved());
    const views = questionnaire.questions.map((question) => questionView(question, prepared));
    const byId = views.filter(
      (view) => !view.answer && idMatches(view.qid, prepared).length === 1,
    ).length;
    const likely = views.filter(
      (view) => !view.answer && view.suggestions.some((item) => item.how === "likely"),
    ).length;
    const answered = views.filter((view) => view.answer).length;
    const show = clean(ctx.query.get("show"), 12);
    const shown = views.filter((view) =>
      show === "unanswered"
        ? !view.answer
        : show === "suggested"
          ? !view.answer && view.suggestions.length > 0
          : true,
    );
    const referenced = new Set<string>();
    for (const view of shown) {
      for (const item of view.suggestions) referenced.add(item.answer_id);
      if (view.answer?.answer_id) referenced.add(view.answer.answer_id);
    }
    const library = book.answers
      .filter((answer) => referenced.has(answer.answer_id))
      .map((answer) => ({
        answer_id: answer.answer_id,
        question: answer.question,
        short: answer.short,
        answer: answer.answer,
        ssrm: answer.ssrm,
        state: answer.state,
        review_by: answer.review_by,
        review_due: reviewDue(answer, today),
        href: `${BASE}/answers/${answer.answer_id}`,
      }));
    const { questions: _questions, other_rows: _others, ...rest } = questionnaire;
    void _questions;
    void _others;
    const diligence = diligenceOf(questionnaire);
    return {
      questionnaire: {
        ...rest,
        href: hrefOf(questionnaire),
        due: dueOf(questionnaire),
        diligence,
      },
      questions: shown,
      counts: {
        total: views.length,
        answered,
        by_id: byId,
        likely,
        unanswered: views.length - answered,
      },
      library,
      files: fileChoices(core),
      files_here: files() !== null,
      show: show === "unanswered" || show === "suggested" ? show : "all",
      today,
    };
  });

  // ---------------------------------------------------------------- questionnaires: the import

  const bytesFrom = (body: Record<string, unknown>) => {
    const content = typeof body.content === "string" ? body.content : "";
    const bytes = new Uint8Array(Buffer.from(content, "base64"));
    if (bytes.length === 0) throw new Refused(400, "empty", EMPTY_WORDS);
    if (bytes.length > QUESTIONNAIRE_MAX_BYTES)
      throw new Refused(400, "too_large", TOO_LARGE_WORDS);
    const name = clean(body.name, LIMITS.file_name).replace(/[\\/]/g, "_") || "questionnaire.xlsx";
    return { bytes, name };
  };

  const readOrRefuse = (bytes: Uint8Array, name: string, sheet: string | null) => {
    try {
      return readSheets(bytes, name, sheet);
    } catch (error) {
      if (error instanceof ImportRefused) throw new Refused(400, "unreadable", error.words);
      throw error;
    }
  };

  const headerRowOf = (value: unknown): number | null => {
    if (value === null || value === undefined || value === "") return null;
    const number = wholeNumber(value, -1);
    if (number < 1 || number > 5_000) throw invalid("Choose the header row.");
    return number;
  };

  core.route("POST", "/data/questionnaires/preview", (ctx) => {
    ctx.staff();
    const sheet = clean(ctx.body.sheet, 64) || null;
    const headerRow = headerRowOf(ctx.body.header_row);
    const importId = clean(ctx.body.import_id, 64);
    if (importId) {
      const { pending, bytes } = book.held(importId);
      const read = readOrRefuse(bytes, pending.name, sheet);
      return { import_id: importId, name: pending.name, ...previewOf(read, headerRow) };
    }
    const { bytes, name } = bytesFrom(ctx.body);
    const read = readOrRefuse(bytes, name, sheet);
    const pending = book.hold(name, bytes);
    return { import_id: pending.import_id, name, ...previewOf(read, headerRow) };
  });

  const titleOf = (value: unknown, fallback: string): string => {
    const title = cleanText(value, QUESTIONNAIRE_LIMITS.title + 1) || fallback;
    if (title.length < QUESTIONNAIRE_LIMITS.title_min || title.length > QUESTIONNAIRE_LIMITS.title)
      throw invalid("Give the questionnaire a title of 3 to 200 characters.");
    return title;
  };

  core.route("POST", "/data/questionnaires", async (ctx) => {
    const by = ctx.staff();
    const body = ctx.body;
    const today = core.day();
    full(book.questionnaires.length, QUESTIONNAIRE_LIMITS.questionnaires, "questionnaires");
    const kind = KINDS.find((item) => item === clean(body.kind, 10)) ?? "buyer";
    const importId = clean(body.import_id, 64);
    if (!importId) throw new Refused(404, "not_found", "Choose the file again.");
    const { pending, bytes } = book.held(importId);
    const sheet = clean(body.sheet, 64) || null;
    const read = readOrRefuse(bytes, pending.name, sheet);
    const headerRow = headerRowOf(body.header_row) ?? previewOf(read, null).header_row;
    const columns = previewOf(read, headerRow).columns;
    const checked = mapOf(body.map, columns.length);
    if ("refused" in checked) throw invalid(checked.refused);
    const { questions, other_rows } = questionsOf(read.rows, headerRow, checked.map);
    if (questions.length === 0) throw invalid(NO_QUESTIONS_WORDS);
    if (questions.length > QUESTIONNAIRE_LIMITS.questions)
      throw invalid(
        `That sheet holds ${questions.length.toLocaleString("en-GB")} questions; HQ holds ${QUESTIONNAIRE_LIMITS.questions.toLocaleString("en-GB")} in one questionnaire.`,
      );
    // The firm, and its open diligence.
    const entryId = kind === "caiq" ? "" : clean(body.entry_id, 64);
    const entry = entryId ? entryOf(entryId) : null;
    if (entryId && !entry) throw new Refused(404, "not_found", "That firm is not on the waitlist.");
    if (kind === "buyer" && !entry) throw invalid("Choose the firm it is from.");
    const givenDiligence = clean(body.diligence_id, 64);
    let diligenceId: string | null = null;
    if (entry && givenDiligence !== "none") {
      const open = inside()?.openFor(entry.entry_id) ?? null;
      if (givenDiligence && open?.diligence_id !== givenDiligence)
        throw invalid(`That is not ${entry.firm}'s open diligence.`);
      diligenceId = open?.diligence_id ?? null;
    }
    const due = anyDay(body.due_on);
    if (due && diligenceId) throw invalid(LINKED_DUE);
    const received = pastDay(body.received_on, today, true) ?? today;
    const firm = entry?.firm ?? "";
    const title = titleOf(
      body.title,
      kind === "caiq"
        ? "The CAIQ for STAR Level 1"
        : firm
          ? `${firm}'s security questionnaire`
          : "Security questionnaire",
    );
    const filesService = files();
    if (!filesService)
      throw new Refused(
        409,
        "files_missing",
        "Files is not set up here, so the file cannot be kept.",
      );
    const kept = await filesService.putFile({
      folderPath: [...FOLDERS.diligence],
      title: firm ? `Questionnaire from ${firm}` : title,
      originalName: pending.name,
      bytes,
      by,
      note: firm ? `${firm}'s questionnaire as received` : `${title} as received`,
    });
    const at = core.now();
    const pinned =
      core.testRoutes && book.pinned && !book.questionnaire(book.pinned) ? book.pinned : null;
    book.pinned = null;
    const questionnaire: Questionnaire = {
      questionnaire_id: pinned ?? randomUUID(),
      title,
      kind,
      entry_id: entry?.entry_id ?? null,
      diligence_id: diligenceId,
      firm,
      source: {
        file_id: kept.file_id,
        name: pending.name,
        format: read.format,
        sheet: read.sheet,
        header_row: headerRow,
        columns,
      },
      map: checked.map,
      questions,
      other_rows,
      due_on: diligenceId ? null : due,
      received_on: received,
      sent: null,
      kept: [],
      state: "open",
      created_at: at,
      created_by: by,
      updated_at: at,
      updated_by: by,
    };
    book.questionnaires.push(questionnaire);
    book.saveQuestionnaires();
    book.release(importId);
    if (diligenceId)
      inside()?.imported(
        diligenceId,
        { questions: questions.length, received_on: received, file_id: kept.file_id },
        by,
      );
    book.log(
      "questionnaire",
      questionnaire.questionnaire_id,
      "imported",
      `${questions.length} questions`,
      by,
    );
    return { questionnaire: rowOf(questionnaire) };
  });

  // ---------------------------------------------------------------- questionnaires: answering

  const questionAt = (questionnaire: Questionnaire, rowParam: string | undefined): Question => {
    const row = Number(rowParam);
    const found = questionnaire.questions.find((question) => question.row === row);
    if (!found) throw new Refused(404, "not_found", "That question is not in this questionnaire.");
    return found;
  };

  const mustOpen = (questionnaire: Questionnaire) => {
    if (questionnaire.state === "closed")
      throw new Refused(
        409,
        "closed",
        "This questionnaire is closed. Reopen it to change an answer.",
      );
  };

  const fromLibrary = (answerId: string): LibraryAnswer => {
    const answer = book.answer(answerId);
    if (!answer) throw new Refused(404, "not_found", "That answer is not in the library.");
    if (answer.state !== "approved") throw invalid("Approve that answer in the library first.");
    return answer;
  };

  core.route("POST", "/data/questionnaires/:id/questions/:row/answer", (ctx) => {
    const by = ctx.staff();
    const questionnaire = book.mustQuestionnaire(ctx.params[0]);
    mustOpen(questionnaire);
    const question = questionAt(questionnaire, ctx.params[1]);
    const answerId = clean(ctx.body.answer_id, 64);
    if (answerId) {
      const answer = fromLibrary(answerId);
      question.answer = {
        short: answer.short,
        text: answer.answer,
        ssrm: answer.ssrm,
        answer_id: answer.answer_id,
        at: core.now(),
        by,
      };
    } else {
      const short = shortOf(ctx.body.short);
      const text = cleanText(ctx.body.text, QUESTIONNAIRE_LIMITS.answer + 1);
      if (text.length > QUESTIONNAIRE_LIMITS.answer) throw invalid(WORDS.answer);
      if (!short && !text) throw invalid("Give a short answer, or write the answer.");
      question.answer = {
        short,
        text,
        ssrm: ssrmOf(ctx.body.ssrm),
        answer_id: null,
        at: core.now(),
        by,
      };
    }
    touch(questionnaire, by);
    book.saveQuestionnaires();
    book.log(
      "questionnaire",
      questionnaire.questionnaire_id,
      "answered",
      `row ${question.row}`,
      by,
    );
    return { question };
  });

  core.route("POST", "/data/questionnaires/:id/questions/:row/clear", (ctx) => {
    const by = ctx.staff();
    const questionnaire = book.mustQuestionnaire(ctx.params[0]);
    mustOpen(questionnaire);
    const question = questionAt(questionnaire, ctx.params[1]);
    question.answer = null;
    touch(questionnaire, by);
    book.saveQuestionnaires();
    book.log("questionnaire", questionnaire.questionnaire_id, "cleared", `row ${question.row}`, by);
    return { question };
  });

  core.route("POST", "/data/questionnaires/:id/questions/:row/to-library", (ctx) => {
    const by = ctx.staff();
    const questionnaire = book.mustQuestionnaire(ctx.params[0]);
    const question = questionAt(questionnaire, ctx.params[1]);
    const typed = question.answer;
    if (!typed) throw invalid("Answer the question first, then save it to the library.");
    if (typed.answer_id) throw invalid("This answer came from the library already.");
    full(book.answers.length, ANSWER_LIMITS.answers, "answers");
    // A CAIQ's IDs are CAIQ IDs; any other questionnaire's are theirs, kept as typed.
    const caiq = questionnaire.kind === "caiq" ? caiqIdOf(question.qid) : null;
    const other = caiq ? null : otherIdOf(question.qid);
    const at = core.now();
    const answer: LibraryAnswer = {
      answer_id: randomUUID(),
      question: question.text
        .slice(0, ANSWER_LIMITS.question)
        .padEnd(ANSWER_LIMITS.question_min, "?"),
      answer: (typed.text || SHORT_WORDS[typed.short]).slice(0, ANSWER_LIMITS.answer),
      short: typed.short,
      topic: "other",
      caiq_ids: caiq ? [caiq] : [],
      other_ids: other ? [other] : [],
      ssrm: typed.ssrm,
      evidence: [],
      owner: "",
      state: "draft",
      approved: null,
      review_by: null,
      created_at: at,
      created_by: by,
      updated_at: at,
      updated_by: by,
    };
    book.answers.push(answer);
    book.saveAnswers();
    book.log(
      "answer",
      answer.answer_id,
      "added",
      `from ${questionnaire.title}, row ${question.row}`,
      by,
    );
    return { question, answer };
  });

  core.route("POST", "/data/questionnaires/:id/accept-by-id", (ctx) => {
    const by = ctx.staff();
    const questionnaire = book.mustQuestionnaire(ctx.params[0]);
    mustOpen(questionnaire);
    const prepared = prepare(approved());
    let accepted = 0;
    for (const question of questionnaire.questions) {
      if (question.answer) continue;
      const found = idMatches(question.qid, prepared);
      if (found.length !== 1) continue;
      const answer = book.answer(found[0]);
      if (!answer) continue;
      question.answer = {
        short: answer.short,
        text: answer.answer,
        ssrm: answer.ssrm,
        answer_id: answer.answer_id,
        at: core.now(),
        by,
      };
      accepted += 1;
    }
    if (accepted > 0) {
      touch(questionnaire, by);
      book.saveQuestionnaires();
      book.log(
        "questionnaire",
        questionnaire.questionnaire_id,
        "accepted by ID",
        String(accepted),
        by,
      );
    }
    return { accepted };
  });

  // ---------------------------------------------------------------- questionnaires: export, keep, send

  const formatOf = (value: unknown): "csv" | "xlsx" => {
    const text = clean(value, 8).toLowerCase();
    if (text === "csv" || text === "xlsx") return text;
    throw invalid("Choose CSV or XLSX.");
  };

  const exportBytes = async (questionnaire: Questionnaire, format: "csv" | "xlsx") => {
    if (format === "csv") return new TextEncoder().encode(exportCsv(questionnaire));
    const path = core.store.path("tmp", `export-${randomUUID()}.xlsx`);
    const { readFileSync, rmSync } = await import("node:fs");
    try {
      await exportXlsx(questionnaire, path);
      return new Uint8Array(readFileSync(path));
    } finally {
      rmSync(path, { force: true });
    }
  };

  for (const format of ["csv", "xlsx"] as const)
    core.builds.provide(`questionnaire_${format}`, async (handle, input) => {
      const questionnaire = book.mustQuestionnaire(clean(input.body.questionnaire_id, 64));
      handle.setProgress(0, 1);
      if (format === "csv") {
        const { writeFileSync } = await import("node:fs");
        writeFileSync(handle.path, exportCsv(questionnaire), { mode: 0o600 });
      } else await exportXlsx(questionnaire, handle.path);
      handle.setProgress(1, 1);
      book.log("questionnaire", questionnaire.questionnaire_id, "exported", format, input.by);
      return {
        name: exportName(questionnaire, format),
        type:
          format === "csv"
            ? "text/csv; charset=utf-8"
            : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      };
    });

  core.route("POST", "/data/questionnaires/:id/keep", async (ctx) => {
    const by = ctx.staff();
    const questionnaire = book.mustQuestionnaire(ctx.params[0]);
    const format = formatOf(ctx.body.format);
    const filesService = files();
    if (!filesService)
      throw new Refused(
        409,
        "files_missing",
        "Files is not set up here, so a copy cannot be kept.",
      );
    const bytes = await exportBytes(questionnaire, format);
    const label = `Answers to ${nameOf(questionnaire)}`;
    const row = await filesService.putFile({
      folderPath: [...FOLDERS.diligence],
      title: label.slice(0, LIMITS.title),
      originalName: exportName(questionnaire, format),
      bytes,
      by,
      note: label,
    });
    questionnaire.kept.push({ file_id: row.file_id, format, at: core.now() });
    touch(questionnaire, by);
    book.saveQuestionnaires();
    book.log("questionnaire", questionnaire.questionnaire_id, "kept", format, by);
    return { questionnaire: rowOf(questionnaire), file_id: row.file_id };
  });

  core.route("POST", "/data/questionnaires/:id/sent", (ctx) => {
    const by = ctx.staff();
    const questionnaire = book.mustQuestionnaire(ctx.params[0]);
    if (questionnaire.state === "closed") throw invalid("Reopen the questionnaire first.");
    const on = pastDay(ctx.body.on, core.day(), true) ?? core.day();
    const how = cleanText(ctx.body.how, QUESTIONNAIRE_LIMITS.how);
    const fileId = clean(ctx.body.file_id, 64) || null;
    if (fileId) {
      const row = fileRow(fileId);
      if (!row || row.trashed_at) throw new Refused(404, "not_found", "That file is not in Files.");
    }
    questionnaire.sent = { on, how, file_id: fileId, by_name: by.name };
    questionnaire.state = "sent";
    touch(questionnaire, by);
    book.saveQuestionnaires();
    if (questionnaire.diligence_id)
      inside()?.sent(questionnaire.diligence_id, { on, file_id: fileId }, by);
    book.log("questionnaire", questionnaire.questionnaire_id, "sent", dayWords(on), by);
    return { questionnaire: rowOf(questionnaire) };
  });

  core.route("POST", "/data/questionnaires/:id/close", (ctx) => {
    const by = ctx.staff();
    const questionnaire = book.mustQuestionnaire(ctx.params[0]);
    questionnaire.state = "closed";
    touch(questionnaire, by);
    book.saveQuestionnaires();
    book.log("questionnaire", questionnaire.questionnaire_id, "closed", "", by);
    return { questionnaire: rowOf(questionnaire) };
  });

  core.route("POST", "/data/questionnaires/:id/reopen", (ctx) => {
    const by = ctx.staff();
    const questionnaire = book.mustQuestionnaire(ctx.params[0]);
    questionnaire.state = questionnaire.sent ? "sent" : "open";
    touch(questionnaire, by);
    book.saveQuestionnaires();
    book.log("questionnaire", questionnaire.questionnaire_id, "reopened", "", by);
    return { questionnaire: rowOf(questionnaire) };
  });

  core.route("POST", "/data/questionnaires/:id/update", (ctx) => {
    const by = ctx.staff();
    const questionnaire = book.mustQuestionnaire(ctx.params[0]);
    questionnaire.title = titleOf(ctx.body.title, questionnaire.title);
    const due = anyDay(ctx.body.due_on);
    if (due && questionnaire.diligence_id) throw invalid(LINKED_DUE);
    if (!questionnaire.diligence_id) questionnaire.due_on = due;
    touch(questionnaire, by);
    book.saveQuestionnaires();
    book.log("questionnaire", questionnaire.questionnaire_id, "edited", "", by);
    return { questionnaire: rowOf(questionnaire) };
  });

  // ---------------------------------------------------------------- test routes

  if (core.testRoutes) {
    /** What the Summary and the firm's pages would read, on a day the test gives. */
    core.route("GET", "/data/_test/questionnaires/lookup", (ctx) => {
      const day = anyDay(ctx.query.get("today")) ?? core.day();
      const entryId = clean(ctx.query.get("entry_id"), 64);
      return {
        summary: service.summary(day, false),
        for_entry: entryId ? service.forEntry(entryId) : [],
      };
    });

    /** `standInSource([], body.options)` under `body.name`, only while the real one is absent. */
    core.route("POST", "/data/_test/answers/evidence", (ctx) => {
      ctx.staff();
      const name = clean(ctx.body.name, 20);
      if (!EVIDENCE_SOURCES.some((source) => source.name === name))
        throw invalid("Name one of tools, devices, logs, recovery, policies, findings, assurance.");
      const current = core.need<object>(name);
      const real = current !== null && !FAKES.has(current);
      if (ctx.body.on === false) {
        if (current && !real) core.provide(name, null);
        return { installed: false, real };
      }
      if (real) return { installed: false, real: true };
      const options = Array.isArray(ctx.body.options)
        ? (ctx.body.options as EvidenceOption[]).filter(
            (option) => option && typeof option.ref === "string",
          )
        : [];
      const fake = standInSource([], options);
      FAKES.add(fake);
      core.provide(name, fake);
      return { installed: true, real: false };
    });

    /** The next questionnaire made takes this id, so the walk's screens have fixed paths. */
    core.route("POST", "/data/_test/questionnaires/pin", (ctx) => {
      ctx.staff();
      const id = clean(ctx.body.questionnaire_id, 64).toLowerCase();
      if (!isUuid(id)) throw invalid("Give an id.");
      book.pinned = book.questionnaire(id) ? null : id;
      return { pinned: book.pinned };
    });

    /**
     * The walk's seed, safe to run twice: `workbook: true` answers the invented workbook's
     * bytes (made with the writer); `library: true` adds the three invented answers, approved,
     * once.
     */
    core.route("POST", "/data/_test/questionnaires/seed", async (ctx) => {
      const by = ctx.staff();
      const answer: Answer = {};
      if (ctx.body.library === true) {
        let added = 0;
        for (const item of WALK_ANSWERS) {
          if (book.answers.some((existing) => existing.question === item.question)) continue;
          const fields = answerFieldsOf({ ...item }, fileRow);
          const at = core.now();
          book.answers.push({
            answer_id: randomUUID(),
            ...fields,
            state: "approved",
            approved: { by_name: by.name, on: core.day() },
            review_by: approvalOf({ by_name: by.name }, core.day(), book.setup.review_months)
              .review_by,
            created_at: at,
            created_by: by,
            updated_at: at,
            updated_by: by,
          });
          added += 1;
        }
        if (added > 0) book.saveAnswers();
        answer.added = added;
      }
      if (ctx.body.workbook === true) {
        core.store.ensureDir("tmp");
        const bytes = await walkWorkbook(core.store.path("tmp", `walk-${randomUUID()}.xlsx`));
        answer.name = WALK_FILE_NAME;
        answer.content = Buffer.from(bytes).toString("base64");
      }
      answer.answers = book.answers.length;
      answer.questionnaires = book.questionnaires.length;
      return answer;
    });
  }
}

/** A short stretch of the answer around the first word searched for. */
function snippet(text: string, terms: readonly string[]): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const lower = flat.toLowerCase();
  let at = -1;
  for (const term of terms) {
    const found = lower.indexOf(term.toLowerCase());
    if (found >= 0 && (at < 0 || found < at)) at = found;
  }
  if (at < 0) return flat.slice(0, 120);
  const start = Math.max(0, at - 40);
  return `${start > 0 ? "…" : ""}${flat.slice(start, start + 120)}${start + 120 < flat.length ? "…" : ""}`;
}
