import Link from "next/link";
import { notFound } from "next/navigation";

import { logActivityAction } from "@/app/(portal)/_actions/work";
import {
  linkMeetingAction,
  recordOutcomeAction,
  updatePrepAction,
} from "@/app/(portal)/meetings/actions";
import { ActivityTimeline } from "@/components/crm/activity-timeline";
import { LogActivityForm } from "@/components/crm/log-activity-form";
import { MeetingLinkForm, MeetingOutcomeForm, PrepNotesForm } from "@/components/crm/meeting-forms";
import { DueChip } from "@/components/crm/pills";
import { RecordHeader } from "@/components/ui/record-shell";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { KeyValue, KeyValueRow } from "@/components/ui/key-value";
import { LocalTime } from "@/components/ui/local-time";
import { StatusPill } from "@/components/ui/status-pill";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readCompanies } from "@/lib/api/crm";
import { readMeeting, type MeetingDetail } from "@/lib/api/meetings";
import { isoDay } from "@/lib/crm/dates";
import {
  MEETING_KIND_LABELS,
  MEETING_OUTCOME_LABELS,
  MEETING_STATUS_LABELS,
  RESPONSE_LABELS,
  meetingStatusTone,
} from "@/lib/crm/vocabulary";
import { requestNow } from "@/lib/request-time";

export const metadata = { title: "Meeting" };
export const dynamic = "force-dynamic";

type MeetingPageProps = { params: Promise<{ meetingId: string }> };

export default async function MeetingPage({ params }: MeetingPageProps) {
  const { meetingId } = await params;
  const context = await requireStaff(`/meetings/${meetingId}`);
  const now = requestNow();
  const today = isoDay(now);

  let detail: MeetingDetail;
  try {
    detail = await readMeeting(context.token, meetingId);
  } catch (error) {
    if (error instanceof HqApiRequestError && error.status === 404) notFound();
    throw error;
  }
  const { meeting, activities, follow_ups: followUps } = detail;
  const canWrite = hasCapability(context, "crm:write");
  const started = meeting.starts_at ? Date.parse(meeting.starts_at) <= now : false;
  const recorded = meeting.status !== "scheduled";
  const guests = meeting.attendees.filter((attendee) => !attendee.is_staff);
  // The calendar owns a synced meeting until it starts: cancelling happens there.
  const showOutcome =
    canWrite && (!recorded || meeting.needs_outcome) && (started || meeting.source === "manual");
  let companies: { id: string; label: string }[] = [];
  if (canWrite && !meeting.company_id) {
    try {
      companies = (await readCompanies(context.token)).companies.map((company) => ({
        id: company.company_id,
        label: company.name,
      }));
    } catch (error) {
      if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
        throw error;
    }
  }
  const ours = meeting.attendees.filter((attendee) => attendee.is_staff);

  return (
    <>
      <RecordHeader
        crumbs={[{ href: "/meetings", label: "Meetings" }]}
        title={meeting.title}
        status={
          <>
            {meeting.needs_outcome ? (
              <span className="clock clock--running">Outcome owed</span>
            ) : (
              <StatusPill
                value={meeting.status}
                label={MEETING_STATUS_LABELS[meeting.status] ?? meeting.status}
                tone={meetingStatusTone(meeting.status)}
              />
            )}
            {meeting.outcome && meeting.outcome !== "no_show" && (
              <span className="quiet">{MEETING_OUTCOME_LABELS[meeting.outcome]}</span>
            )}
            {meeting.source === "calendar" && <span className="quiet">From the calendar</span>}
          </>
        }
        readouts={[
          { label: "When", value: <LocalTime value={meeting.starts_at} /> },
          { label: "Kind", value: MEETING_KIND_LABELS[meeting.kind] ?? meeting.kind },
          ...(meeting.company_name ? [{ label: "Company", value: meeting.company_name }] : []),
        ]}
      />
      {meeting.needs_outcome && (
        <Callout tone="attention" title="What happened?">
          Record the outcome below. It writes the follow-up tasks, so nothing needs adding by hand.
        </Callout>
      )}
      {meeting.outcome_lapsed && (
        <Callout tone="neutral" compact>
          The seven-day window for this outcome has passed. It can still be recorded.
        </Callout>
      )}
      <div className="record-layout">
        <div className="record-layout__main">
          {meeting.description && (
            <Card title="From the booking" titleAs="h2">
              <p className="prose-block">{meeting.description}</p>
            </Card>
          )}
          {canWrite ? (
            <Card title="Prep" titleAs="h2">
              <PrepNotesForm
                action={updatePrepAction}
                meetingId={meeting.meeting_id}
                prepNotes={meeting.prep_notes}
                recordingUrl={meeting.recording_url}
              />
            </Card>
          ) : (
            meeting.prep_notes && (
              <Card title="Prep" titleAs="h2">
                <p className="prose-block">{meeting.prep_notes}</p>
              </Card>
            )
          )}
          {recorded && meeting.outcome_notes && (
            <Card title="What happened" titleAs="h2">
              <p className="prose-block">{meeting.outcome_notes}</p>
            </Card>
          )}
          <section className="record-section" aria-labelledby="meeting-activity">
            <h2 className="record-section__title" id="meeting-activity">
              Activity
            </h2>
            {canWrite && (
              <LogActivityForm
                action={logActivityAction}
                links={{
                  meeting_id: meeting.meeting_id,
                  ...(meeting.company_id ? { company_id: meeting.company_id } : {}),
                  ...(meeting.deal_id ? { deal_id: meeting.deal_id } : {}),
                }}
                returnPath={`/meetings/${meeting.meeting_id}`}
              />
            )}
            <ActivityTimeline
              activities={activities}
              now={now}
              emptyLabel="Nothing recorded for this meeting yet."
            />
          </section>
        </div>
        <aside className="record-layout__side">
          {showOutcome && (
            <Card title={started ? "Outcome" : "Call it off"} titleAs="h3">
              <MeetingOutcomeForm
                action={recordOutcomeAction}
                meetingId={meeting.meeting_id}
                hasHappened={started}
              />
            </Card>
          )}
          <Card title="Guests" titleAs="h3">
            {meeting.attendees.length === 0 ? (
              <p className="side-quiet">No guests listed.</p>
            ) : (
              <ul className="guest-list">
                {[...guests, ...ours].map((attendee) => (
                  <li key={attendee.email} className="guest">
                    <span className="guest__name">
                      {attendee.person_id ? (
                        <Link href={`/people/${attendee.person_id}`}>
                          {attendee.person_name || attendee.email}
                        </Link>
                      ) : (
                        attendee.email
                      )}
                    </span>
                    <span className="guest__meta">
                      {attendee.is_staff ? "Us" : attendee.person_id ? "On file" : "Not on file"}
                      {" · "}
                      {RESPONSE_LABELS[attendee.response] ?? attendee.response}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Linked" titleAs="h3">
            {!meeting.company_id && companies.length > 0 && (
              <MeetingLinkForm
                action={linkMeetingAction}
                meetingId={meeting.meeting_id}
                companies={companies}
              />
            )}
            <KeyValue>
              {meeting.company_id ? (
                <KeyValueRow label="Company">
                  <Link href={`/companies/${meeting.company_id}`}>
                    {meeting.company_name || "Company"}
                  </Link>
                </KeyValueRow>
              ) : (
                companies.length === 0 && <KeyValueRow label="Company">None</KeyValueRow>
              )}
              <KeyValueRow label="Deal">
                {meeting.deal_id ? (
                  <Link href={`/deals/${meeting.deal_id}`}>{meeting.deal_name || "Deal"}</Link>
                ) : (
                  "None"
                )}
              </KeyValueRow>
              {meeting.recording_url && (
                <KeyValueRow label="Recording">
                  <a href={meeting.recording_url} rel="noreferrer noopener" target="_blank">
                    Open the recording
                  </a>
                </KeyValueRow>
              )}
            </KeyValue>
          </Card>
          {followUps.length > 0 && (
            <Card title="Follow-ups" titleAs="h3">
              <ul className="side-list">
                {followUps.map((task) => (
                  <li
                    key={task.task_id}
                    className={task.status === "open" ? "follow-up" : "follow-up follow-up--closed"}
                  >
                    <span>{task.title}</span>
                    {task.status === "open" ? (
                      <DueChip due={task.due_on} today={today} />
                    ) : (
                      <span className="side-quiet">
                        {task.status === "done" ? "Done" : "Stood down"}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}
