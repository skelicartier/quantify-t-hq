import type { Diligence, Redline, Reference } from "@/lib/data/api/diligence";
import { REDLINE_STATUSES, REVIEW_OUTCOMES, dayShort } from "@/lib/data/labels-close";
import { formatNumber } from "@/lib/format";

/**
 * Buyer diligence's parts in a few words, as the Diligence list and the waitlist firm's
 * section print them: "Due 20 Nov", "Passed 9 Nov", "2; consent from 1", "Round 2 · with them".
 */

export function questionnaireWords(questionnaire: Diligence["questionnaire"]): string {
  if (questionnaire.answered_on) return `Answered ${dayShort(questionnaire.answered_on)}`;
  if (questionnaire.due_on) return `Due ${dayShort(questionnaire.due_on)}`;
  if (questionnaire.received_on) return `Received ${dayShort(questionnaire.received_on)}`;
  return "None";
}

export function reviewWords(review: Diligence["security_review"]): string {
  if (review.finished_on && review.outcome)
    return `${REVIEW_OUTCOMES[review.outcome]} ${dayShort(review.finished_on)}`;
  if (review.started_on) return `Started ${dayShort(review.started_on)}`;
  return "Not started";
}

export function referencesWords(references: readonly Reference[]): string {
  if (references.length === 0) return "None";
  const consented = references.filter((reference) => reference.consent_on).length;
  return `${formatNumber(references.length)}; consent from ${formatNumber(consented)}`;
}

export function redlineWords(redlines: readonly Redline[]): string {
  const latest = [...redlines].sort(
    (a, b) =>
      b.round - a.round || (b.sent_on ?? b.received_on ?? "").localeCompare(a.sent_on ?? ""),
  )[0];
  if (!latest) return "None";
  return `Round ${latest.round} · ${REDLINE_STATUSES[latest.status].toLowerCase()}`;
}
