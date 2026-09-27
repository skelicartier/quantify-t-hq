import Link from "next/link";

import { LocalTime } from "@/components/ui/local-time";
import { StatusPill } from "@/components/ui/status-pill";
import type { Meeting } from "@/lib/api/meetings";
import {
  MEETING_KIND_LABELS,
  MEETING_OUTCOME_LABELS,
  MEETING_STATUS_LABELS,
  meetingStatusTone,
} from "@/lib/crm/vocabulary";

/** Who is coming, as a line: named people first, then addresses, then our own. */
function guestLine(meeting: Meeting): string {
  const outside = meeting.attendees.filter((attendee) => !attendee.is_staff);
  const names = outside.map((attendee) => attendee.person_name || attendee.email);
  const staff = meeting.attendees.length - outside.length;
  const parts = [names.slice(0, 3).join(", ")];
  if (names.length > 3) parts.push(`+${names.length - 3} more`);
  if (staff > 0) parts.push(`${staff} of us`);
  return parts.filter(Boolean).join(" · ") || "No guests listed";
}

export function MeetingList({
  meetings,
  emptyLabel,
}: {
  meetings: readonly Meeting[];
  emptyLabel: string;
}) {
  if (meetings.length === 0) return <p className="timeline-empty">{emptyLabel}</p>;
  return (
    <ol className="meeting-list">
      {meetings.map((meeting) => (
        <li
          key={meeting.meeting_id}
          className={meeting.needs_outcome ? "meeting-row meeting-row--owed" : "meeting-row"}
        >
          <div className="meeting-row__when">
            <LocalTime value={meeting.starts_at} />
          </div>
          <div className="meeting-row__main">
            <Link className="meeting-row__title" href={`/meetings/${meeting.meeting_id}`}>
              {meeting.title}
            </Link>
            <p className="meeting-row__sub">
              {MEETING_KIND_LABELS[meeting.kind] ?? meeting.kind}
              {meeting.company_name && ` · ${meeting.company_name}`}
              {` · ${guestLine(meeting)}`}
            </p>
          </div>
          <div className="meeting-row__state">
            {meeting.needs_outcome ? (
              <span className="clock clock--running">Outcome owed</span>
            ) : meeting.status === "scheduled" ? (
              <StatusPill value="scheduled" label="Scheduled" tone="neutral" />
            ) : (
              <StatusPill
                value={meeting.status}
                label={
                  meeting.status === "completed" && meeting.outcome
                    ? `Held · ${MEETING_OUTCOME_LABELS[meeting.outcome] ?? meeting.outcome}`
                    : (MEETING_STATUS_LABELS[meeting.status] ?? meeting.status)
                }
                tone={meetingStatusTone(meeting.status)}
              />
            )}
            {meeting.source === "calendar" && <span className="meeting-row__source">Calendar</span>}
          </div>
        </li>
      ))}
    </ol>
  );
}
