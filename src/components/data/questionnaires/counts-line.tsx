import { formatNumber } from "@/lib/format";

/**
 * The line of counts beside a questionnaire's table (ws-notes/security/spec.md §9.7): "4 with a
 * match by ID · 12 likely · 150 not answered". Counts in words, never a bar or a "%".
 */
export function QuestionnaireCounts({
  counts,
}: {
  counts: { by_id: number; likely: number; unanswered: number };
}) {
  return (
    <p className="hqdata-qcounts">
      {formatNumber(counts.by_id)} with a match by ID · {formatNumber(counts.likely)} likely ·{" "}
      {formatNumber(counts.unanswered)} not answered
    </p>
  );
}
