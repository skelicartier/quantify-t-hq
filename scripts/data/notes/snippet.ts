/**
 * A short stretch of a record's text around the first word searched for, as a search hit
 * shows it under the title (raise spec §3.1, `DataSearchHit.snippet`). Pure.
 */

const BEFORE = 40;
const WIDTH = 160;

export function snippetOf(text: string, terms: readonly string[]): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) return "";
  const lower = flat.toLowerCase();
  let at = -1;
  for (const term of terms) {
    const found = lower.indexOf(term.toLowerCase());
    if (found >= 0 && (at < 0 || found < at)) at = found;
  }
  if (at < 0) return "";
  const start = Math.max(0, at - BEFORE);
  const end = Math.min(flat.length, start + WIDTH);
  return `${start > 0 ? "…" : ""}${flat.slice(start, end).trim()}${end < flat.length ? "…" : ""}`;
}
