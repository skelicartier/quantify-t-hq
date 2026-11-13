/**
 * Finding a file by what a person remembers of it: its name, a tag, a note, or words
 * inside it. Every word typed must be there (in any of those places, any case); the match
 * says where it was found first, and a match on the words inside comes with a short
 * snippet around them, so the list can say "In the text: “…registered office…”".
 */

import type { FileMeta, FileRow } from "./vault";

export type Match = NonNullable<FileRow["match"]>;

const SNIPPET_SIDE = 60;

/** The words of a search, lower case, without repeats. */
export function termsOf(query: string): string[] {
  const words = query
    .toLowerCase()
    .replace(/[“”"]/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);
  return [...new Set(words)].slice(0, 20);
}

/** A short stretch of text around the first place the phrase (or else its first word) appears. */
export function snippetOf(text: string, query: string, terms: readonly string[]): string {
  const lower = text.toLowerCase();
  const phrase = query.trim().toLowerCase().replace(/\s+/g, " ");
  const flat = lower.replace(/\s+/g, " ");
  // Work on the text with its runs of white space made one space, so positions agree.
  const source = text.replace(/\s+/g, " ");
  let at = phrase ? flat.indexOf(phrase) : -1;
  let length = phrase.length;
  if (at < 0) {
    for (const term of terms) {
      at = flat.indexOf(term);
      length = term.length;
      if (at >= 0) break;
    }
  }
  if (at < 0) return "";
  const start = Math.max(0, at - SNIPPET_SIDE);
  const end = Math.min(source.length, at + length + SNIPPET_SIDE);
  return `${start > 0 ? "…" : ""}${source.slice(start, end).trim()}${end < source.length ? "…" : ""}`;
}

/**
 * Whether a file answers a search, and where. The words can be split across the places
 * (one in the name, one in the text); the place named is the first that holds any of them.
 */
export function matchFile(
  file: FileMeta,
  originalName: string,
  text: () => string,
  query: string,
  terms: readonly string[],
): Match | null {
  if (terms.length === 0) return null;
  const name = `${file.title} ${originalName}`.toLowerCase();
  const tags = file.tags.join(" ").toLowerCase();
  const notes = file.notes.toLowerCase();
  const left = terms.filter(
    (term) => !name.includes(term) && !tags.includes(term) && !notes.includes(term),
  );
  let words = "";
  if (left.length > 0) {
    words = text().toLowerCase();
    if (!left.every((term) => words.includes(term))) return null;
  }
  if (terms.some((term) => name.includes(term))) return { where: "name", snippet: "" };
  if (terms.some((term) => tags.includes(term)))
    return { where: "tags", snippet: file.tags.join(", ") };
  if (terms.some((term) => notes.includes(term)))
    return { where: "notes", snippet: snippetOf(file.notes, query, terms) };
  return { where: "text", snippet: snippetOf(text(), query, terms) };
}

const RANK: Record<Match["where"], number> = { name: 0, tags: 1, notes: 2, text: 3 };

export function byMatch(
  a: { match: Match; updated_at: string },
  b: { match: Match; updated_at: string },
): number {
  return RANK[a.match.where] - RANK[b.match.where] || b.updated_at.localeCompare(a.updated_at);
}
