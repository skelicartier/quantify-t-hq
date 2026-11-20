/**
 * Matching a buyer's question to the approved answers (ws-notes/security/spec.md §5.5). No AI,
 * deterministic, never automatic: by ID first (sure), then by words (a score in thousandths of
 * the words the two share, of all the words either has). A suggestion is only a suggestion:
 * "Use this" or "Accept the matches by ID" answers. Pure.
 */

import { CAIQ_ID, MATCH, OTHER_ID } from "./limits";

export const STOPWORDS: ReadonlySet<string> = new Set(
  (
    "a an and any all are as at be by can do does for from has have how if in into is it its of on " +
    "or our please describe provide explain so such that the their there these this to was we what " +
    "when where which who will with you your yes no"
  ).split(" "),
);

/** The first rule that fits: "ies" → "y" (5 letters or more); "ing" (6); "ed" (5); "s", not "ss" (4). */
export function stem(word: string): string {
  if (word.endsWith("ies") && word.length >= 5) return `${word.slice(0, -3)}y`;
  if (word.endsWith("ing") && word.length >= 6) return word.slice(0, -3);
  if (word.endsWith("ed") && word.length >= 5) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss") && word.length >= 4) return word.slice(0, -1);
  return word;
}

/** The words of a question, as a set: lower case, "&" as "and", stopwords out, each stemmed. */
export function tokens(text: string): Set<string> {
  const words = text
    .toLocaleLowerCase("en-GB")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((word) => word !== "" && !STOPWORDS.has(word));
  return new Set(words.map(stem));
}

/** floor(1000 × |A ∩ B| / |A ∪ B|); 0 for two empty sets. */
export function scoreOf(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  const union = a.size + b.size - shared;
  return union === 0 ? 0 : Math.floor((1_000 * shared) / union);
}

export function score(question: string, other: string): number {
  return scoreOf(tokens(question), tokens(other));
}

/** An ID as matched: upper case, spaces removed. */
export function idKey(id: string): string {
  return id.toUpperCase().replace(/\s+/g, "");
}

/** A CAIQ ID as its file writes it, or null: " a&a-01.1 " → "A&A-01.1"; "A&A-1.1" → null. */
export function caiqIdOf(value: string): string | null {
  const id = value.trim().toUpperCase();
  return CAIQ_ID.test(id) ? id : null;
}

/** A SIG ID or a buyer's own, as typed (trimmed), or null. */
export function otherIdOf(value: string): string | null {
  const id = value.trim();
  return OTHER_ID.test(id) ? id : null;
}

export type Matchable = {
  answer_id: string;
  question: string;
  caiq_ids: readonly string[];
  other_ids: readonly string[];
};

export type Suggestion = { answer_id: string; score: number; how: "id" | "likely" | "possible" };

/** What a score is shown as: "Likely" from 500, "Possible" from 300, nothing below. */
export function howOf(value: number): "likely" | "possible" | null {
  if (value >= MATCH.likely) return "likely";
  if (value >= MATCH.possible) return "possible";
  return null;
}

export type Prepared = { answer: Matchable; ids: Set<string>; words: Set<string> };

/** The approved answers, made ready once for a whole questionnaire. */
export function prepare(answers: readonly Matchable[]): Prepared[] {
  return answers.map((answer) => ({
    answer,
    ids: new Set([...answer.caiq_ids, ...answer.other_ids].map(idKey).filter(Boolean)),
    words: tokens(answer.question),
  }));
}

/** The approved answers whose IDs hold this question's ID. */
export function idMatches(qid: string, prepared: readonly Prepared[]): string[] {
  const key = idKey(qid);
  if (!key) return [];
  return prepared.filter((item) => item.ids.has(key)).map((item) => item.answer.answer_id);
}

/**
 * The best three for one question: every ID match first (score 1000), then by words, best
 * first (a tie by the answer's question, then its id), "Likely" or "Possible" only.
 */
export function suggestionsFor(
  question: { qid: string; text: string },
  prepared: readonly Prepared[],
): Suggestion[] {
  const byId = new Set(idMatches(question.qid, prepared));
  const found: (Suggestion & { question: string })[] = [];
  for (const item of prepared)
    if (byId.has(item.answer.answer_id))
      found.push({
        answer_id: item.answer.answer_id,
        score: 1_000,
        how: "id",
        question: item.answer.question,
      });
  const words = tokens(question.text);
  const scored: (Suggestion & { question: string })[] = [];
  for (const item of prepared) {
    if (byId.has(item.answer.answer_id)) continue;
    const value = scoreOf(words, item.words);
    const how = howOf(value);
    if (how)
      scored.push({
        answer_id: item.answer.answer_id,
        score: value,
        how,
        question: item.answer.question,
      });
  }
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      a.question.localeCompare(b.question) ||
      a.answer_id.localeCompare(b.answer_id),
  );
  return [...found, ...scored]
    .slice(0, MATCH.shown)
    .map(({ answer_id, score: value, how }) => ({ answer_id, score: value, how }));
}
