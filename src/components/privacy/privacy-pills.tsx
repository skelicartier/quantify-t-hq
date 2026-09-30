import { StatusPill, type PillTone } from "@/components/ui/status-pill";
import type { RequestClock } from "@/lib/api/privacy";
import { formatDate } from "@/lib/format";

const REQUEST_STATUS: Record<string, { label: string; tone: PillTone }> = {
  received: { label: "Received", tone: "attention" },
  identity: { label: "Waiting on identity", tone: "neutral" },
  scoping: { label: "Clock stopped", tone: "neutral" },
  searching: { label: "Searching", tone: "attention" },
  review: { label: "In review", tone: "attention" },
  responded: { label: "Responded", tone: "live" },
  refused: { label: "Refused", tone: "neutral" },
  withdrawn: { label: "Withdrawn", tone: "neutral" },
};

export function RequestStatusPill({ status }: { status: string }) {
  const entry = REQUEST_STATUS[status] ?? { label: status, tone: "neutral" as PillTone };
  return <StatusPill value={status} label={entry.label} tone={entry.tone} />;
}

/** The deadline in words: how long is left, how late, or why there is no date yet. */
export function clockText(clock: RequestClock, complaint = false): string {
  switch (clock.state) {
    case "closed":
      return clock.answered_late ? "Answered after the deadline" : "Closed";
    case "stopped":
      return clock.days_left_when_stopped !== null
        ? `Stopped · ${clock.days_left_when_stopped} days left`
        : `Stopped since ${formatDate(clock.stopped_since)}`;
    case "not_started":
      return "Not started";
    case "acknowledged":
      return "Acknowledged";
    default:
      if (clock.days_left === null) return "—";
      if (clock.days_left < 0)
        return `${-clock.days_left} day${clock.days_left === -1 ? "" : "s"} overdue`;
      if (clock.days_left === 0) return complaint ? "Acknowledge today" : "Due today";
      return `${clock.days_left} day${clock.days_left === 1 ? "" : "s"} ${complaint ? "to acknowledge" : "left"}`;
  }
}

export function ClockPill({
  clock,
  complaint = false,
}: {
  clock: RequestClock;
  complaint?: boolean;
}) {
  const tone: PillTone =
    clock.state === "closed"
      ? clock.answered_late
        ? "danger"
        : "live"
      : clock.overdue
        ? "danger"
        : clock.days_left !== null && clock.days_left <= 7
          ? "attention"
          : "neutral";
  return <StatusPill value={clock.state} label={clockText(clock, complaint)} tone={tone} />;
}

const INCIDENT_STATUS: Record<string, { label: string; tone: PillTone }> = {
  open: { label: "Open", tone: "danger" },
  contained: { label: "Contained", tone: "attention" },
  resolved: { label: "Resolved", tone: "live" },
  closed: { label: "Closed", tone: "neutral" },
};

export function IncidentStatusPill({ status }: { status: string }) {
  const entry = INCIDENT_STATUS[status] ?? { label: status, tone: "neutral" as PillTone };
  return <StatusPill value={status} label={entry.label} tone={entry.tone} />;
}

const SEVERITY: Record<string, PillTone> = {
  low: "neutral",
  medium: "attention",
  high: "danger",
  critical: "danger",
};

export function SeverityPill({ severity }: { severity: string }) {
  return (
    <StatusPill
      value={severity}
      label={`${severity.charAt(0).toUpperCase()}${severity.slice(1)}`}
      tone={SEVERITY[severity] ?? "neutral"}
    />
  );
}

type Regulator = {
  state: string;
  hours_left: number | null;
  late: boolean;
};

export function regulatorText(regulator: Regulator): string {
  switch (regulator.state) {
    case "not_applicable":
      return "No personal data";
    case "no_awareness":
      return "Awareness not recorded";
    case "not_notifiable":
      return "Not notifiable";
    case "notified":
      return regulator.late ? "Notified late" : "Notified";
    default: {
      const hours = regulator.hours_left ?? 0;
      const lead = regulator.state === "unassessed" ? "Not assessed" : "To notify";
      if (hours < 0) return `${lead} · ${Math.round(-hours)}h past 72`;
      return `${lead} · ${Math.round(hours)}h left`;
    }
  }
}

export function RegulatorPill({ regulator }: { regulator: Regulator }) {
  const tone: PillTone =
    regulator.state === "notified"
      ? regulator.late
        ? "attention"
        : "live"
      : regulator.state === "unassessed" || regulator.state === "due"
        ? "danger"
        : "neutral";
  return <StatusPill value={regulator.state} label={regulatorText(regulator)} tone={tone} />;
}

const SUBPROCESSOR_STATUS: Record<string, { label: string; tone: PillTone }> = {
  proposed: { label: "Proposed", tone: "attention" },
  notice_sent: { label: "Notice period", tone: "attention" },
  active: { label: "Active", tone: "live" },
  retired: { label: "Retired", tone: "neutral" },
};

export function SubprocessorStatusPill({ status }: { status: string }) {
  const entry = SUBPROCESSOR_STATUS[status] ?? { label: status, tone: "neutral" as PillTone };
  return <StatusPill value={status} label={entry.label} tone={entry.tone} />;
}
