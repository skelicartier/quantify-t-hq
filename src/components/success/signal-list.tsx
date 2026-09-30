import { StatusPill, type PillTone } from "@/components/ui/status-pill";
import type { Signal } from "@/lib/api/success";

const TONE: Record<string, PillTone> = {
  unlinked: "neutral",
  no_sign_in: "danger",
  seat_use_low: "attention",
  renewal_risk: "danger",
  no_contact: "attention",
  near_limit: "live",
};

/** Each signal with its evidence; `compact` drops the rule for a table cell. */
export function SignalList({
  signals,
  compact = false,
}: {
  signals: readonly Signal[];
  compact?: boolean;
}) {
  if (signals.length === 0) return <span className="muted">None</span>;
  return (
    <ul className="signal-list">
      {signals.map((signal) => (
        <li key={signal.key} className="signal-list__item">
          <StatusPill
            value={signal.key}
            label={signal.label}
            tone={TONE[signal.key] ?? "neutral"}
          />
          <span className="signal-list__evidence">{signal.evidence}</span>
          {!compact && <span className="signal-list__rule">Rule: {signal.rule}</span>}
        </li>
      ))}
    </ul>
  );
}
