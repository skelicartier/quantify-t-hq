import { Timestamp } from "@/components/ui/timestamp";
import type { Activity } from "@/lib/api/crm";
import { ACTIVITY_KIND_LABELS, stageLabel } from "@/lib/crm/vocabulary";

type ActivityTimelineProps = {
  activities: readonly Activity[];
  now: number;
  /** Pipeline stage names, so "demo_done -> pilot" reads "Demo done → Early access". */
  stageLabels?: ReadonlyMap<string, string>;
  emptyLabel?: string;
};

function renderBody(activity: Activity, stageLabels?: ReadonlyMap<string, string>): string {
  if (activity.kind === "stage_change") {
    const [from, to] = activity.body.split("->").map((part) => part.trim());
    if (from !== undefined && to !== undefined) {
      return `${stageLabel(from, stageLabels)} → ${stageLabel(to, stageLabels)}`;
    }
  }
  return activity.body;
}

function actorFor(activity: Activity): string {
  if (activity.staff_name) return activity.staff_name;
  if (activity.kind === "email_in") return "Inbound";
  return "HQ";
}

/**
 * The record's history, newest first. Append-only upstream, so this is a record of
 * what happened rather than a document anyone curates — nothing here is editable.
 */
export function ActivityTimeline({
  activities,
  now,
  stageLabels,
  emptyLabel = "Nothing logged yet.",
}: ActivityTimelineProps) {
  if (activities.length === 0) {
    return <p className="timeline-empty">{emptyLabel}</p>;
  }
  return (
    <ol className="timeline" aria-label="Activity">
      {activities.map((activity, index) => (
        <li
          key={`${activity.at ?? "at"}-${activity.kind}-${index}`}
          className={`timeline__item timeline__item--${activity.kind}`}
        >
          <span className="timeline__kind">
            {ACTIVITY_KIND_LABELS[activity.kind] ?? activity.kind}
          </span>
          <div className="timeline__main">
            <p className="timeline__meta">
              <span className="timeline__actor">{actorFor(activity)}</span>
              <Timestamp value={activity.at} now={now} mode="relative" />
            </p>
            <p className="timeline__body">{renderBody(activity, stageLabels)}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
