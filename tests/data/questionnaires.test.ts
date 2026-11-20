// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addDays, localDay } from "../../scripts/data/days";
import type { Diligence } from "../../scripts/data/diligence/types";
import { OLD_XLS_WORDS } from "../../scripts/data/questionnaires/limits";
import type { Question } from "../../scripts/data/questionnaires/types";
import { WALK_QUESTIONS, walkRows } from "../../scripts/data/questionnaires/walk-seed";
import { writeXlsx } from "../../scripts/data/questionnaires/xlsx-write";
import { toCsv } from "../../scripts/data/text";
import { WALKER, codeOf, startStack, type RawAnswer, type Stack } from "./helpers";
import { deflated } from "./questionnaires-kit";

/**
 * Questionnaires on the real modules (ws-notes/security/spec.md §9.3–§9.6, §9.8): the two-step
 * import with its header-row and column guesses, a CSV and an XLSX of the same rows giving the
 * same questions, answering by hand and from the library, accept by ID, to the library, the
 * diligence's Due row with the count, marking sent setting the diligence's answered day and
 * copy, an unlinked questionnaire's own Due row, and "Used for". Every firm and question is
 * invented.
 */

let stack: Stack;
let entryId = "";
let diligenceId = "";
const dir = mkdtempSync(join(tmpdir(), "hqq-"));
const today = () => localDay(new Date());

const post = (path: string, body: Record<string, unknown> = {}) =>
  stack.ask("POST", path, { by: WALKER, ...body });
const get = (path: string) => stack.ask("GET", path);
const body = (answer: RawAnswer) => answer.json ?? {};
const message = (answer: RawAnswer) =>
  String(((answer.json?.error ?? {}) as { message?: string }).message ?? "");

async function xlsxOf(rows: string[][], sheet = "Vendor review"): Promise<Uint8Array> {
  const path = join(dir, `${crypto.randomUUID()}.xlsx`);
  await writeXlsx(path, { sheet, rows, wide: [2] });
  return new Uint8Array(readFileSync(path));
}
const b64 = (bytes: Uint8Array | string) => Buffer.from(bytes).toString("base64");

type Preview = {
  import_id: string;
  format: string;
  sheets: { name: string; rows: number }[];
  sheet: string | null;
  header_row: number;
  columns: string[];
  rows: string[][];
  guess: Record<string, number | null>;
  questions: number;
  notes: string[];
};

async function due(): Promise<{ key: string; title: string; sub: string; due_on: string }[]> {
  return (body(await get("/data/overview?due=all")).due ?? []) as {
    key: string;
    title: string;
    sub: string;
    due_on: string;
  }[];
}

beforeAll(async () => {
  stack = await startStack({
    modules: ["files", "leads", "replies", "waitlist", "diligence", "questionnaires"],
  });
  const added = await post("/data/waitlist", {
    email: "asha@walkcapital.example",
    firm: "Walk Capital",
  });
  expect(added.status).toBe(200);
  entryId = String((body(added).entry as { entry_id: string }).entry_id);
  const opened = await post("/data/diligence", { entry_id: entryId, attempt: crypto.randomUUID() });
  diligenceId = (body(opened).diligence as Diligence).diligence_id;
  await post(`/data/diligence/${diligenceId}/questionnaire`, { due_on: addDays(today(), 5) });
}, 60_000);
afterAll(async () => {
  await stack.stop();
  rmSync(dir, { recursive: true, force: true });
});

describe("the import, in two steps", () => {
  it("guesses the header row and the columns; a CSV and an XLSX of the same rows agree", async () => {
    const rows = walkRows();
    const csv = toCsv(rows[0]!, rows.slice(1));
    const fromCsv = body(
      await post("/data/questionnaires/preview", { content: b64(csv), name: "review.csv" }),
    ) as unknown as Preview;
    const xlsx = await xlsxOf(rows);
    const fromXlsx = body(
      await post("/data/questionnaires/preview", {
        content: b64(deflated(xlsx)),
        name: "review.xlsx",
      }),
    ) as unknown as Preview;
    expect(fromCsv.format).toBe("csv");
    expect(fromXlsx.format).toBe("xlsx");
    expect(fromXlsx.sheets).toEqual([{ name: "Vendor review", rows: 15 }]);
    // The sender's CSV reader drops blank lines, so the CSV's header is its second row.
    expect(fromCsv.header_row).toBe(2);
    expect(fromXlsx.header_row).toBe(3);
    for (const preview of [fromCsv, fromXlsx]) {
      expect(preview.columns).toEqual(["Question ID", "Section", "Question", "Answer", "Comments"]);
      expect(preview.guess).toEqual({
        id: 0,
        question: 2,
        answer: 3,
        comment: 4,
        section: 1,
        ssrm: null,
      });
      expect(preview.questions).toBe(12);
      expect(preview.rows).toHaveLength(12);
      expect(preview.rows[0]).toEqual(["A&A-01.1", "Policies", WALK_QUESTIONS[0]!.text, "", ""]);
    }
    // His own header row reads again from the same file, without choosing it again.
    const again = body(
      await post("/data/questionnaires/preview", { import_id: fromCsv.import_id, header_row: 1 }),
    ) as unknown as Preview;
    expect(again.header_row).toBe(1);
    expect(again.import_id).toBe(fromCsv.import_id);
  });

  it("refuses an old .xls, an empty file, a picture, and a gone import", async () => {
    const cfb = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 1, 2, 3]);
    const old = await post("/data/questionnaires/preview", { content: b64(cfb), name: "old.xls" });
    expect([old.status, codeOf(old), message(old)]).toEqual([400, "unreadable", OLD_XLS_WORDS]);
    expect(
      message(await post("/data/questionnaires/preview", { content: "", name: "x.csv" })),
    ).toBe("That file is empty.");
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]);
    expect(
      message(await post("/data/questionnaires/preview", { content: b64(png), name: "x.png" })),
    ).toBe("Choose a CSV or .xlsx file: HQ reads those two.");
    expect(
      message(await post("/data/questionnaires/preview", { import_id: crypto.randomUUID() })),
    ).toBe("That import is no longer here. Choose the file again.");
  });
});

describe("a questionnaire linked to the firm's diligence", () => {
  let id = "";
  const answers: string[] = [];

  it("imports: the file kept in Files, the diligence's count and received day filled", async () => {
    const preview = body(
      await post("/data/questionnaires/preview", {
        content: b64(await xlsxOf(walkRows())),
        name: "walk-capital.xlsx",
      }),
    ) as unknown as Preview;
    const refused = await post("/data/questionnaires", {
      import_id: preview.import_id,
      map: preview.guess,
      header_row: preview.header_row,
      kind: "buyer",
      entry_id: entryId,
      due_on: addDays(today(), 3),
      attempt: crypto.randomUUID(),
    });
    expect(message(refused)).toBe(
      "Linked to the firm's open diligence: its questionnaire's due day is the one day.",
    );
    const made = await post("/data/questionnaires", {
      import_id: preview.import_id,
      map: preview.guess,
      header_row: preview.header_row,
      kind: "buyer",
      entry_id: entryId,
      attempt: crypto.randomUUID(),
    });
    expect(made.status).toBe(200);
    const row = body(made).questionnaire as Record<string, unknown>;
    id = String(row.questionnaire_id);
    expect(row).toMatchObject({
      title: "Walk Capital's security questionnaire",
      firm: "Walk Capital",
      diligence_id: diligenceId,
      answered: 0,
      total: 12,
      state: "open",
      due_on: addDays(today(), 5),
    });
    const item = (body(await get(`/data/diligence/for-entry/${entryId}`)).diligence as Diligence)
      .questionnaire;
    expect(item.questions).toBe(12);
    expect(item.received_on).toBe(today());
    expect(item.file_id).not.toBeNull();
    const file = body(await get(`/data/files/${item.file_id}`)).file as {
      folder_path: string;
      used_for: { label: string }[];
    };
    expect(file.folder_path).toMatch(/06 Contracts and NDAs.*Diligence/);
    expect(file.used_for.map((use) => use.label)).toContain(
      "Walk Capital's questionnaire as received",
    );
    const gone = await post("/data/questionnaires", {
      import_id: preview.import_id,
      map: preview.guess,
      kind: "buyer",
      entry_id: entryId,
    });
    expect(gone.status).toBe(404);
  });

  it("suggests from the library by ID and by words, never answering on its own", async () => {
    for (const item of [
      { question: "Is a written security policy kept and reviewed?", caiq_ids: " a&a-01.1 " },
      { question: "Is customer data encrypted at rest?", caiq_ids: "" },
      { question: "Is there a written incident response plan?", caiq_ids: "" },
    ]) {
      const added = await post("/data/answers", {
        ...item,
        answer: "Yes, and it is written down.",
        short: "yes",
        topic: "policies",
        attempt: crypto.randomUUID(),
      });
      expect(added.status).toBe(200);
      const answerId = String((body(added).answer as { answer_id: string }).answer_id);
      answers.push(answerId);
      expect(
        (await post(`/data/answers/${answerId}/approve`, { by_name: "Walk Owner" })).status,
      ).toBe(200);
    }
    const read = body(await get(`/data/questionnaires/${id}`));
    expect(read.counts).toEqual({ total: 12, answered: 0, by_id: 1, likely: 2, unanswered: 12 });
    const questions = read.questions as (Question & {
      suggestions: { answer_id: string; how: string; score: number }[];
    })[];
    expect(questions[0]!.suggestions).toEqual([{ answer_id: answers[0], score: 1000, how: "id" }]);
    expect(questions[2]!.suggestions).toEqual([
      { answer_id: answers[1], score: 1000, how: "likely" },
    ]);
    expect(questions[3]!.suggestions).toEqual([
      { answer_id: answers[2], score: 750, how: "likely" },
    ]);
    expect(questions.every((question) => question.answer === null)).toBe(true);
    const suggested = body(await get(`/data/questionnaires/${id}?show=suggested`));
    expect((suggested.questions as unknown[]).length).toBe(3);
  });

  it("accepts the match by ID, uses a suggestion, takes a typed answer, saves it to the library", async () => {
    expect(body(await post(`/data/questionnaires/${id}/accept-by-id`))).toMatchObject({
      accepted: 1,
    });
    expect(body(await post(`/data/questionnaires/${id}/accept-by-id`))).toMatchObject({
      accepted: 0,
    });
    const row3 = WALK_QUESTIONS.indexOf(WALK_QUESTIONS[2]!) + 4;
    const used = await post(`/data/questionnaires/${id}/questions/${row3}/answer`, {
      answer_id: answers[1],
    });
    expect((body(used).question as Question).answer).toMatchObject({
      short: "yes",
      answer_id: answers[1],
    });
    const empty = await post(`/data/questionnaires/${id}/questions/9/answer`, {
      short: "",
      text: "",
    });
    expect(message(empty)).toBe("Give a short answer, or write the answer.");
    const typed = await post(`/data/questionnaires/${id}/questions/9/answer`, {
      short: "partly",
      text: "Quarterly by the founder.",
      ssrm: "",
    });
    expect((body(typed).question as Question).answer).toMatchObject({
      short: "partly",
      text: "Quarterly by the founder.",
      answer_id: null,
    });
    const saved = await post(`/data/questionnaires/${id}/questions/9/to-library`);
    expect(body(saved).answer).toMatchObject({
      question: WALK_QUESTIONS[5]!.text,
      answer: "Quarterly by the founder.",
      state: "draft",
      other_ids: ["WQ-06"],
    });
    const read = body(await get(`/data/questionnaires/${id}`));
    expect(read.counts).toMatchObject({ total: 12, answered: 3, unanswered: 9 });
    const row = (due: { key: string; sub: string }[]) =>
      due.find((item) => item.key === `diligence:${diligenceId}:questionnaire`);
    expect(row(await due())).toMatchObject({
      title: "Answer Walk Capital's questionnaire",
      sub: "Diligence · their questionnaire · 3 of 12 answered",
    });
    const cleared = await post(`/data/questionnaires/${id}/questions/9/clear`);
    expect((body(cleared).question as Question).answer).toBeNull();
    expect(row(await due())?.sub).toBe("Diligence · their questionnaire · 2 of 12 answered");
    const list = body(await get("/data/diligence")).diligence as { linked: unknown }[];
    expect(list[0]!.linked).toMatchObject({ questionnaire_id: id, answered: 2, total: 12 });
  });

  it("keeps a copy and is marked sent: the diligence reads answered and its Due row goes", async () => {
    const kept = await post(`/data/questionnaires/${id}/keep`, { format: "xlsx" });
    expect(kept.status).toBe(200);
    const fileId = String(body(kept).file_id);
    const file = body(await get(`/data/files/${fileId}`)).file as {
      used_for: { label: string }[];
    };
    expect(file.used_for.map((use) => use.label)).toContain(
      "Answers to Walk Capital's questionnaire",
    );
    const future = await post(`/data/questionnaires/${id}/sent`, { on: addDays(today(), 1) });
    expect(message(future)).toBe("That day has not come yet.");
    const sent = await post(`/data/questionnaires/${id}/sent`, {
      on: today(),
      how: "By email to their security team",
      file_id: fileId,
    });
    expect((body(sent).questionnaire as { state: string }).state).toBe("sent");
    const item = (body(await get(`/data/diligence/for-entry/${entryId}`)).diligence as Diligence)
      .questionnaire;
    expect(item.answered_on).toBe(today());
    expect(item.answers_file_id).toBe(fileId);
    expect((await due()).some((row) => row.key === `diligence:${diligenceId}:questionnaire`)).toBe(
      false,
    );
    const closed = await post(`/data/questionnaires/${id}/close`);
    expect((body(closed).questionnaire as { state: string }).state).toBe("closed");
    const locked = await post(`/data/questionnaires/${id}/questions/4/clear`);
    expect(locked.status).toBe(409);
    expect(
      (body(await post(`/data/questionnaires/${id}/reopen`)).questionnaire as { state: string })
        .state,
    ).toBe("sent");
  });
});

describe("a questionnaire not linked to a diligence", () => {
  it("gives its own Due row from 7 days before its day", async () => {
    const preview = body(
      await post("/data/questionnaires/preview", {
        content: b64(toCsv(["Question"], [["Do you keep logs?"], ["Do you test restores?"]])),
        name: "other.csv",
      }),
    ) as unknown as Preview;
    expect(preview.header_row).toBe(1);
    const made = await post("/data/questionnaires", {
      import_id: preview.import_id,
      map: { question: 0 },
      kind: "other",
      title: "Walk Insurer's proposal form",
      due_on: addDays(today(), 7),
      attempt: crypto.randomUUID(),
    });
    expect(made.status).toBe(200);
    const id = String((body(made).questionnaire as { questionnaire_id: string }).questionnaire_id);
    expect((await due()).find((row) => row.key === `questionnaire:${id}`)).toMatchObject({
      kind: "diligence",
      title: "Answer Walk Insurer's proposal form",
      sub: "0 of 2 answered",
      due_on: addDays(today(), 7),
    });
    await post(`/data/questionnaires/${id}/update`, {
      title: "Walk Insurer's proposal form",
      due_on: addDays(today(), 8),
    });
    expect((await due()).some((row) => row.key === `questionnaire:${id}`)).toBe(false);
    const buyer = await post("/data/questionnaires", {
      import_id: (
        body(
          await post("/data/questionnaires/preview", {
            content: b64("Question\nOne?\n"),
            name: "b.csv",
          }),
        ) as unknown as Preview
      ).import_id,
      map: { question: 0 },
      kind: "buyer",
    });
    expect(message(buyer)).toBe("Choose the firm it is from.");
    const twice = await post("/data/questionnaires", {
      import_id: (
        body(
          await post("/data/questionnaires/preview", {
            content: b64("Question,Answer\nOne?,\n"),
            name: "c.csv",
          }),
        ) as unknown as Preview
      ).import_id,
      map: { question: 0, answer: 0 },
      kind: "other",
    });
    expect(message(twice)).toBe(
      "Each column can hold one thing only. Choose a different column for each.",
    );
  });

  it("lists every questionnaire with its count", async () => {
    const list = body(await get("/data/questionnaires"));
    expect(list.counts).toMatchObject({ open: 1, sent: 1, closed: 0 });
    const rows = list.questionnaires as { title: string; answered: number; total: number }[];
    expect(rows.map((row) => `${row.title} ${row.answered}/${row.total}`)).toEqual([
      "Walk Insurer's proposal form 0/2",
      "Walk Capital's security questionnaire 2/12",
    ]);
    expect((list.firms as { firm: string; diligence_id: string | null }[])[0]).toMatchObject({
      firm: "Walk Capital",
      diligence_id: diligenceId,
    });
  });
});
