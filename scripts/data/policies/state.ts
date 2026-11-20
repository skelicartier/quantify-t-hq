/**
 * A policy's state, from the linked document's review date in Files (ws-notes/security/spec.md
 * §5.4): current; review soon (within 30 days, inclusive); lapsed; no review date; no document;
 * the document in the trash; not needed. Pure: the day and the document's facts are given.
 */

import { addDays } from "../days";
import { dayWords } from "../../../src/lib/data/labels-company";
import { REVIEW_SOON_DAYS, type PolicyStateKey } from "../../../src/lib/data/labels-assurance";

export type PolicyFileFacts = {
  /** Whether Files answers here at all. */
  files_here: boolean;
  /** The linked document's row, or null when it is not in Files. */
  file: { trashed: boolean; review_by: string | null } | null;
};

export type PolicyState = { state: PolicyStateKey; words: string; next_review: string | null };

export function policyStateOf(
  entry: { file_id: string | null; not_needed: { why: string } | null } | null,
  facts: PolicyFileFacts,
  today: string,
): PolicyState {
  if (entry?.not_needed)
    return {
      state: "not_needed",
      words: `Not needed: ${entry.not_needed.why.replace(/\.+$/, "")}.`,
      next_review: null,
    };
  if (!entry?.file_id)
    return { state: "no_document", words: "No document linked.", next_review: null };
  if (!facts.files_here)
    return { state: "unknown", words: "Files is not loaded here.", next_review: null };
  if (!facts.file)
    return {
      state: "trashed",
      words: "The linked document is no longer in Files.",
      next_review: null,
    };
  if (facts.file.trashed)
    return { state: "trashed", words: "The linked document is in the trash.", next_review: null };
  const on = facts.file.review_by;
  if (!on)
    return {
      state: "no_review",
      words: "No review date. Set one on the document in Files.",
      next_review: null,
    };
  if (on < today)
    return { state: "lapsed", words: `Review lapsed on ${dayWords(on)}.`, next_review: on };
  if (on <= addDays(today, REVIEW_SOON_DAYS))
    return { state: "review_soon", words: `Review due ${dayWords(on)}.`, next_review: on };
  return { state: "current", words: `Current; next review ${dayWords(on)}.`, next_review: on };
}

/** The Summary counts current and review-soon as current. */
export const countsAsCurrent = (state: PolicyStateKey): boolean =>
  state === "current" || state === "review_soon";
