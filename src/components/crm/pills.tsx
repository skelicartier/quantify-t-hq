import { StatusPill } from "@/components/ui/status-pill";
import {
  DEAL_FLAG_LABELS,
  DEAL_STATUS_LABELS,
  LEAD_STAGE_LABELS,
  LIFECYCLE_LABELS,
  dealFlagTone,
  dealStatusTone,
  leadStageTone,
  lifecycleTone,
} from "@/lib/crm/vocabulary";
import { dueState, formatDate, formatWait } from "@/lib/format";

export function LeadStagePill({ stage }: { stage: string }) {
  return (
    <StatusPill
      value={stage}
      label={LEAD_STAGE_LABELS[stage] ?? stage}
      tone={leadStageTone(stage)}
    />
  );
}

export function LifecyclePill({ lifecycle }: { lifecycle: string }) {
  return (
    <StatusPill
      value={lifecycle}
      label={LIFECYCLE_LABELS[lifecycle] ?? lifecycle}
      tone={lifecycleTone(lifecycle)}
    />
  );
}

export function DealStatusPill({ status }: { status: string }) {
  return (
    <StatusPill
      value={status}
      label={DEAL_STATUS_LABELS[status] ?? status}
      tone={dealStatusTone(status)}
    />
  );
}

type DealFlagsProps = {
  flags: readonly string[];
  idleDays: number;
  daysInStage: number;
};

/** Why a deal is on the attention list, each reason with the number behind it. */
export function DealFlags({ flags, idleDays, daysInStage }: DealFlagsProps) {
  if (flags.length === 0) return null;
  return (
    <ul className="flag-list" aria-label="Needs attention">
      {flags.map((flag) => (
        <li key={flag} className={`flag flag--${dealFlagTone(flag)}`}>
          {DEAL_FLAG_LABELS[flag] ?? flag}
          {flag === "neglected" && <span className="flag__n">{idleDays}d quiet</span>}
          {flag === "rotting" && <span className="flag__n">{daysInStage}d</span>}
        </li>
      ))}
    </ul>
  );
}

type FirstReplyClockProps = {
  firstRepliedAt: string | null;
  waitingMinutes: number | null;
  overdue: boolean;
  targetMinutes: number;
};

/**
 * The first-reply clock. Running until someone logs outreach; past the target it turns
 * red and says so in words, not only in colour.
 */
export function FirstReplyClock({
  firstRepliedAt,
  waitingMinutes,
  overdue,
  targetMinutes,
}: FirstReplyClockProps) {
  if (firstRepliedAt) {
    return <span className="clock clock--done">Answered</span>;
  }
  if (waitingMinutes === null) {
    return <span className="clock clock--none">No clock</span>;
  }
  return (
    <span
      className={overdue ? "clock clock--breached" : "clock clock--running"}
      title={`Target: a first reply within ${formatWait(targetMinutes)}`}
    >
      {overdue ? "Overdue" : "Waiting"} {formatWait(waitingMinutes)}
    </span>
  );
}

/** A due date read against today: "Overdue · 25 Sep 2026", "Today", "1 Oct 2026". */
export function DueChip({ due, today }: { due: string | null | undefined; today: string }) {
  const state = dueState(due, today);
  if (state === "none") return <span className="due due--none">No date</span>;
  const label = formatDate(String(due).slice(0, 10));
  if (state === "overdue") return <span className="due due--overdue">Overdue · {label}</span>;
  if (state === "today") return <span className="due due--today">Today</span>;
  return <span className="due">{label}</span>;
}
