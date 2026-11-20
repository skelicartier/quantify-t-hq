/**
 * Which row is the header, and which column holds what (ws-notes/security/spec.md §9.3). A
 * guess he confirms or changes in the preview: the header row is the first of the first 20
 * rows with a cell naming a question, a requirement or a control; each role takes the first
 * column, not already taken, whose header names one of its words, tried in order. A word
 * matches at the start of a word in the header ("Questions" names "question"; "Guidance" does
 * not name "id"). Pure.
 */

import { QUESTIONNAIRE_LIMITS, XLSX_LIMITS } from "./limits";
import type { ColumnMap, Question } from "./types";

export const HEADER_WORDS = ["question", "requirement", "control"] as const;

export const ROLE_WORDS = {
  id: ["question id", "control id", "id", "ref", "no.", "number", "#"],
  question: ["question", "requirement", "control", "description"],
  answer: ["answer", "response", "yes/no"],
  comment: ["comment", "explanation", "implementation", "details", "notes", "evidence"],
  section: ["section", "domain", "category"],
  ssrm: ["ssrm", "ownership", "responsibility"],
} as const;

export type Role = keyof typeof ROLE_WORDS;
export const ROLES: readonly Role[] = ["id", "question", "answer", "comment", "section", "ssrm"];

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/** Whether a header names a word: at the start of a word in it, any case. */
export function names(header: string, word: string): boolean {
  const lower = header.toLowerCase();
  const lead = /^[a-z0-9]/.test(word) ? "(^|[^a-z0-9])" : "";
  return new RegExp(`${lead}${escape(word)}`).test(lower);
}

/** The header row, 1-based: the first of the first 20 with a question, requirement or control; else row 1. */
export function headerRowOf(rows: readonly (readonly string[])[]): number {
  const search = Math.min(rows.length, QUESTIONNAIRE_LIMITS.header_search);
  for (let index = 0; index < search; index += 1)
    if ((rows[index] ?? []).some((cell) => HEADER_WORDS.some((word) => names(cell, word))))
      return index + 1;
  return 1;
}

/** A guess: like the map, but the question column may not have been found. */
export type GuessMap = Omit<ColumnMap, "question"> & { question: number | null };

/** The map the preview offers: each role's guess, a column taken once. */
export function guessMap(columns: readonly string[]): GuessMap {
  const taken = new Set<number>();
  const found: Record<Role, number | null> = {
    id: null,
    question: null,
    answer: null,
    comment: null,
    section: null,
    ssrm: null,
  };
  for (const role of ROLES) {
    for (const word of ROLE_WORDS[role]) {
      const index = columns.findIndex((header, at) => !taken.has(at) && names(header, word));
      if (index >= 0) {
        found[role] = index;
        taken.add(index);
        break;
      }
    }
  }
  return found;
}

/** A column index from a body: a whole number within the columns read, or null. */
function indexOf(value: unknown, width: number): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(String(value));
  if (!Number.isInteger(number) || number < 0 || number >= Math.max(width, 1)) return null;
  return number;
}

/**
 * The map he sent, checked: a question column, the rest optional, no column used twice.
 * Null with the sentence to show when it will not do.
 */
export function mapOf(value: unknown, width: number): { map: ColumnMap } | { refused: string } {
  const given =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const limit = Math.min(width, XLSX_LIMITS.columns);
  const question = indexOf(given.question, limit);
  if (question === null) return { refused: "Choose the column that holds the questions." };
  const map: ColumnMap = {
    id: indexOf(given.id, limit),
    question,
    section: indexOf(given.section, limit),
    answer: indexOf(given.answer, limit),
    comment: indexOf(given.comment, limit),
    ssrm: indexOf(given.ssrm, limit),
  };
  const used = Object.values(map).filter((item): item is number => item !== null);
  if (new Set(used).size !== used.length)
    return { refused: "Each column can hold one thing only. Choose a different column for each." };
  return { map };
}

/** The header row's cells, padded to the widest row so every column can be chosen. */
export function columnsOf(rows: readonly (readonly string[])[], headerRow: number): string[] {
  const header = rows[headerRow - 1] ?? [];
  const width = Math.min(
    XLSX_LIMITS.columns,
    Math.max(header.length, ...rows.slice(headerRow).map((row) => row.length), 0),
  );
  return Array.from({ length: width }, (_, index) => (header[index] ?? "").trim());
}

const cellAt = (row: readonly string[], index: number | null): string =>
  index === null ? "" : (row[index] ?? "").trim();

/**
 * The questions under the header: every row after it whose question cell is not empty. The
 * rows that hold none are kept as they are, so the export keeps every row.
 */
export function questionsOf(
  rows: readonly (readonly string[])[],
  headerRow: number,
  map: ColumnMap,
): { questions: Question[]; other_rows: { row: number; cells: string[] }[] } {
  const questions: Question[] = [];
  const others: { row: number; cells: string[] }[] = [];
  for (let index = headerRow; index < rows.length; index += 1) {
    const row = rows[index] ?? [];
    const text = cellAt(row, map.question);
    if (!text) {
      if (row.some((cell) => cell !== "")) others.push({ row: index + 1, cells: [...row] });
      continue;
    }
    questions.push({
      row: index + 1,
      qid: cellAt(row, map.id),
      section: cellAt(row, map.section),
      text,
      cells: [...row],
      answer: null,
    });
  }
  return { questions, other_rows: others };
}
