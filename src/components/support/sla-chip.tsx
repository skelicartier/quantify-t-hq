import type { SlaState } from "@/lib/api/tickets";

/**
 * The queue's promise-keeping readout: which reply timer runs and how it stands.
 * Tone never travels alone — the words say what the colour says.
 */
export function SlaChip({ sla }: { sla: SlaState }) {
  if (sla.status === "none") {
    return <span className="sla-chip sla-chip--none">No timer</span>;
  }
  if (sla.status === "paused") {
    return <span className="sla-chip sla-chip--paused">Paused</span>;
  }
  const label = sla.timer === "first-reply" ? "First reply" : "Next reply";
  if (sla.status === "breached") {
    const overdue = Math.abs(sla.minutes_remaining ?? 0);
    return (
      <span className="sla-chip sla-chip--breached" title={sla.due_at ?? undefined}>
        {label} breached · {formatMinutes(overdue)} over
      </span>
    );
  }
  const remaining = formatMinutes(sla.minutes_remaining ?? 0);
  return (
    <span
      className={sla.status === "at-risk" ? "sla-chip sla-chip--risk" : "sla-chip"}
      title={sla.due_at ?? undefined}
    >
      {label} · {remaining} left
    </span>
  );
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${Math.max(minutes, 1)}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d`;
}
