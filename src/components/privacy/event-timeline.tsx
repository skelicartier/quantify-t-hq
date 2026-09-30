import { Timestamp } from "@/components/ui/timestamp";

type Event = { kind: string; detail: string; by: string; at: string | null };

/** What happened to a record, oldest first, each line saying who and when. */
export function EventTimeline({
  events,
  labels,
  now,
}: {
  events: readonly Event[];
  labels: Readonly<Record<string, string>>;
  now: number;
}) {
  if (events.length === 0) return <p className="muted">Nothing yet.</p>;
  return (
    <ol className="event-timeline">
      {events.map((event, index) => (
        <li key={`${event.at}-${index}`} className="event-timeline__row">
          <span className="event-timeline__kind">{labels[event.kind] ?? event.kind}</span>
          <span className="event-timeline__detail">
            {event.detail}
            <span className="quiet">
              {" "}
              · {event.by || "HQ"} · <Timestamp value={event.at} now={now} mode="relative" />
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}
