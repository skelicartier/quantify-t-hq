// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { headerRowOf, questionsOf } from "../../scripts/data/questionnaires/columns";
import {
  exportCsv,
  exportGrid,
  exportName,
  exportXlsx,
  joinedAnswer,
} from "../../scripts/data/questionnaires/export";
import { readSheets } from "../../scripts/data/questionnaires/import";
import { EXPORT_KEEPS } from "../../scripts/data/questionnaires/limits";
import type {
  ColumnMap,
  Question,
  QuestionAnswer,
  Questionnaire,
} from "../../scripts/data/questionnaires/types";
import { readXlsx } from "../../scripts/data/questionnaires/xlsx-read";
import { WALKER } from "./helpers";

/**
 * The export back to the buyer (ws-notes/security/spec.md §9.3), pure: the rules for each map
 * (the answer column alone, the answer and the comment, the ownership column, nothing mapped),
 * CSV formula defusing with a byte-order mark, and the round trip: export XLSX, import it
 * again, the same answers in the same cells. Every question is invented.
 */

const dir = mkdtempSync(join(tmpdir(), "hqe-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const answer = (change: Partial<QuestionAnswer> = {}): QuestionAnswer => ({
  short: "yes",
  text: "Every laptop's disk is encrypted.",
  ssrm: "",
  answer_id: null,
  at: "2026-11-20T06:00:00.000Z",
  by: WALKER,
  ...change,
});

function questionnaire(
  map: Partial<ColumnMap>,
  columns: string[],
  rows: { row: number; cells: string[]; answer?: QuestionAnswer | null }[],
  others: { row: number; cells: string[] }[] = [],
): Questionnaire {
  const full: ColumnMap = {
    id: null,
    question: 1,
    section: null,
    answer: null,
    comment: null,
    ssrm: null,
    ...map,
  };
  const questions: Question[] = rows.map((item) => ({
    row: item.row,
    qid: item.cells[0] ?? "",
    section: "",
    text: item.cells[full.question] ?? "",
    cells: item.cells,
    answer: item.answer ?? null,
  }));
  return {
    questionnaire_id: "q1",
    title: "Walk Capital's security questionnaire",
    kind: "buyer",
    entry_id: null,
    diligence_id: null,
    firm: "Walk Capital",
    source: {
      file_id: "f1",
      name: "walk.xlsx",
      format: "xlsx",
      sheet: "Vendor review",
      header_row: 1,
      columns,
    },
    map: full,
    questions,
    other_rows: others,
    due_on: null,
    received_on: "2026-11-20",
    sent: null,
    kept: [],
    state: "open",
    created_at: "2026-11-20T06:00:00.000Z",
    created_by: WALKER,
    updated_at: "2026-11-20T06:00:00.000Z",
    updated_by: WALKER,
  };
}

describe("the export's rules", () => {
  it("only the answer column mapped: the short answer's words, then the text", () => {
    const grid = exportGrid(
      questionnaire(
        { answer: 2 },
        ["ID", "Question", "Response"],
        [
          { row: 2, cells: ["WQ-01", "Are laptops encrypted?"], answer: answer() },
          { row: 3, cells: ["WQ-02", "Is there a plan?", "Their placeholder"], answer: null },
          {
            row: 4,
            cells: ["WQ-03", "Card data?"],
            answer: answer({ short: "not_applicable", text: "" }),
          },
          {
            row: 5,
            cells: ["WQ-04", "Text only?"],
            answer: answer({ short: "", text: "Only words." }),
          },
        ],
      ),
    );
    expect(grid.rows).toEqual([
      ["ID", "Question", "Response"],
      ["WQ-01", "Are laptops encrypted?", "Yes. Every laptop's disk is encrypted."],
      ["WQ-02", "Is there a plan?", "Their placeholder"],
      ["WQ-03", "Card data?", "Not applicable"],
      ["WQ-04", "Text only?", "Only words."],
    ]);
    expect(grid.wide).toEqual([1, 2]);
    expect(joinedAnswer(answer({ short: "partly", text: "Mostly." }))).toBe("Partly. Mostly.");
  });

  it("the answer and the comment mapped: the short answer in one, the text in the other; ownership by label", () => {
    const grid = exportGrid(
      questionnaire(
        { answer: 2, comment: 3, ssrm: 4 },
        ["ID", "Question", "Answer", "Comment", "SSRM"],
        [
          {
            row: 2,
            cells: ["A&A-01.1", "Policy?"],
            answer: answer({ short: "no", text: "Not yet.", ssrm: "shared_third_party" }),
          },
          { row: 3, cells: ["A&A-01.2", "Owner?"], answer: answer({ ssrm: "csp_owned" }) },
        ],
      ),
    );
    expect(grid.rows.slice(1)).toEqual([
      ["A&A-01.1", "Policy?", "No", "Not yet.", "Shared CSP and 3rd party"],
      ["A&A-01.2", "Owner?", "Yes", "Every laptop's disk is encrypted.", "CSP-owned"],
    ]);
    expect(grid.wide).toEqual([1, 2, 3]);
  });

  it("nothing mapped: two columns, Answer and Comment, added at the right; every row kept in order", () => {
    const grid = exportGrid(
      questionnaire(
        {},
        ["ID", "Question"],
        [
          { row: 3, cells: ["WQ-01", "Are laptops encrypted?"], answer: answer() },
          { row: 5, cells: ["WQ-02", "Unanswered?"] },
        ],
        [{ row: 4, cells: ["", "", "", "A note row"] }],
      ),
    );
    expect(grid.rows).toEqual([
      ["ID", "Question", "", "", "Answer", "Comment"],
      ["WQ-01", "Are laptops encrypted?", "", "", "Yes", "Every laptop's disk is encrypted."],
      ["", "", "", "A note row", "", ""],
      ["WQ-02", "Unanswered?", "", "", "", ""],
    ]);
    expect(grid.wide).toEqual([1, 4, 5]);
  });

  it("CSV: a byte-order mark, and a cell a spreadsheet would run is defused", () => {
    const csv = exportCsv(
      questionnaire(
        { answer: 2 },
        ["ID", "Question", "Answer"],
        [
          {
            row: 2,
            cells: ["=1+1", "@SUM(A1)", ""],
            answer: answer({ short: "", text: '-2, "quoted"' }),
          },
        ],
      ),
    );
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toBe('﻿ID,Question,Answer\r\n\'=1+1,\'@SUM(A1),"\'-2, ""quoted"""\r\n');
  });

  it("names the download after the title, and says what is not kept", () => {
    const made = questionnaire({}, ["Question"], []);
    expect(exportName(made, "xlsx")).toBe("Walk Capital's security questionnaire answers.xlsx");
    expect(exportName({ ...made, title: 'A/B: "x"?' }, "csv")).toBe("A B x answers.csv");
    expect(EXPORT_KEEPS).toBe(
      "The export keeps their columns and rows. Their formatting, other tabs, drop-downs and formulas are not kept: paste the answers into their file if they ask for it back as it was.",
    );
  });
});

describe("the round trip", () => {
  it("export XLSX, import it again: the same answers in the same cells", async () => {
    const map = { id: 0, answer: 2, comment: 3 };
    const made = questionnaire(
      map,
      ["Question ID", "Question", "Answer", "Comments"],
      [
        { row: 2, cells: ["A&A-01.1", "Do you keep a written policy?"], answer: answer() },
        {
          row: 3,
          cells: ["WQ-02", "Is it 01.1 or 1.10?"],
          answer: answer({ short: "partly", text: "01.1" }),
        },
        { row: 4, cells: ["WQ-03", "Unanswered?"] },
      ],
    );
    const path = join(dir, "round.xlsx");
    await exportXlsx(made, path);
    const bytes = new Uint8Array(readFileSync(path));
    expect(readXlsx(bytes).sheets).toEqual([{ name: "Vendor review", rows: 4 }]);
    const read = readSheets(bytes, "round.xlsx", null);
    const header = headerRowOf(read.rows);
    expect(header).toBe(1);
    const again = questionsOf(read.rows, header, { ...made.map, ...map });
    expect(again.questions.map((question) => question.cells)).toEqual([
      ["A&A-01.1", "Do you keep a written policy?", "Yes", "Every laptop's disk is encrypted."],
      ["WQ-02", "Is it 01.1 or 1.10?", "Partly", "01.1"],
      ["WQ-03", "Unanswered?"],
    ]);
  });
});
