/**
 * A questionnaire back to the buyer (ws-notes/security/spec.md §9.3): their header row and
 * every row as read, with the answers written in. Only the answer column mapped: the short
 * answer's words, then the text. The answer and the comment both mapped: the short answer in
 * one, the text in the other. The ownership column: its label as CSA's guide writes it.
 * Nothing mapped: two columns, "Answer" and "Comment", added at the right. CSV through
 * `toCsv` (a cell a spreadsheet would run is defused) with a byte-order mark; XLSX as a fresh
 * workbook of inline strings. Their formatting, other tabs, drop-downs and formulas are not
 * kept.
 */

import { SHORT_WORDS, SSRM_WORDS } from "../../../src/lib/data/labels-questionnaires";
import { toCsv } from "../text";
import type { Question, Questionnaire } from "./types";
import { writeXlsx } from "./xlsx-write";

export const BOM = "\ufeff";

export type ExportGrid = {
  rows: string[][];
  /** The question, answer and comment columns: 60 wide, wrapped. */
  wide: number[];
};

/** The short answer's words, then the text: "Yes. Every laptop's disk is encrypted." */
export function joinedAnswer(answer: NonNullable<Question["answer"]>): string {
  const words = SHORT_WORDS[answer.short];
  if (words && answer.text) return `${words}. ${answer.text}`;
  return words || answer.text;
}

/** The header and every row, in sheet order, each as wide as the widest, with the answers in. */
export function exportGrid(questionnaire: Questionnaire): ExportGrid {
  const { map, source } = questionnaire;
  const lines: { row: number; cells: string[]; question: Question | null }[] = [
    ...questionnaire.questions.map((question) => ({
      row: question.row,
      cells: question.cells,
      question,
    })),
    ...questionnaire.other_rows.map((other) => ({
      row: other.row,
      cells: other.cells,
      question: null,
    })),
  ].sort((a, b) => a.row - b.row);
  const read = Math.max(source.columns.length, ...lines.map((line) => line.cells.length), 1);
  const added = map.answer === null && map.comment === null;
  const answerAt = added ? read : map.answer;
  const commentAt = added ? read + 1 : map.comment;
  const width = added ? read + 2 : read;
  const pad = (cells: readonly string[]) =>
    Array.from({ length: width }, (_, index) => cells[index] ?? "");
  const header = pad(source.columns);
  if (added) {
    header[read] = "Answer";
    header[read + 1] = "Comment";
  }
  const rows = [header];
  for (const line of lines) {
    const cells = pad(line.cells);
    const answer = line.question?.answer ?? null;
    if (answer) {
      if (answerAt !== null && commentAt !== null) {
        cells[answerAt] = SHORT_WORDS[answer.short];
        cells[commentAt] = answer.text;
      } else {
        const only = (answerAt ?? commentAt)!;
        cells[only] = joinedAnswer(answer);
      }
      if (map.ssrm !== null && answer.ssrm) cells[map.ssrm] = SSRM_WORDS[answer.ssrm];
    }
    rows.push(cells);
  }
  const wide = [map.question, answerAt, commentAt].filter(
    (index): index is number => index !== null,
  );
  return { rows, wide };
}

/** The grid as CSV, with a byte-order mark. */
export function exportCsv(questionnaire: Questionnaire): string {
  const { rows } = exportGrid(questionnaire);
  return BOM + toCsv(rows[0] ?? [], rows.slice(1));
}

/** The grid as a fresh workbook at `path`, its one sheet named as theirs was. */
export async function exportXlsx(questionnaire: Questionnaire, path: string): Promise<void> {
  const grid = exportGrid(questionnaire);
  await writeXlsx(path, { sheet: questionnaire.source.sheet, rows: grid.rows, wide: grid.wide });
}

/** A download's name: the title, with nothing a file system would refuse. */
export function exportName(questionnaire: Questionnaire, format: "csv" | "xlsx"): string {
  const base =
    questionnaire.title
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 150) || "Questionnaire";
  return `${base} answers.${format}`;
}
