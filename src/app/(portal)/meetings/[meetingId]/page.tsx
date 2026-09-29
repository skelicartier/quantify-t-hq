import Link from "next/link";
import { notFound } from "next/navigation";

import { logActivityAction } from "@/app/(portal)/_actions/work";
import {
  linkMeetingAction,
  recordOutcomeAction,
  updateMeetingFieldAction,
  updatePrepAction,
} from "@/app/(portal)/meetings/actions";
import { ActivityTimeline } from "@/components/crm/activity-timeline";
import { LogActivityForm } from "@/components/crm/log-activity-form";
import { MeetingLinkForm, MeetingOutcomeForm, PrepNotesForm } from "@/components/crm/meeting-forms";
import { DueChip } from "@/components/crm/pills";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { InlineField } from "@/components/ui/inline-field";
import { LocalTime } from "@/components/ui/local-time";
import {
  Properties,
  Property,
  RecordGrid,
  RecordHeader,
  RecordSection,
  RecordTabs,
  currentTab,
} from "@/components/ui/record-shell";
import { StatusPill } from "@/components/ui/status-pill";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readCompanies } from "@/lib/api/crm";
import { readMeeting, type MeetingDetail } from "@/lib/api/meetings";
import { isoDay } from "@/lib/crm/dates";
import {
  MEETING_KINDS,
  MEETING_KIND_LABELS,
  MEETING_OUTCOME_LABELS,
  MEETING_STATUS_LABELS,
  RESPONSE_LABELS,
  meetingStatusTone,
} from "@/lib/crm/vocabulary";
import { requestNow } from "@/lib/request-time";
import { firstSearchValue } from "@/lib/search-params";

export const metadata = { title: "Meeting" };
export const dynamic = "force-dynamic";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "activity", label: "Activity" },
] as const;

type MeetingPageProps = {
  params: Promise<{ meetingId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function MeetingPage({ params, searchParams }: MeetingPageProps) {
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
  const ours = meeting.attendees.filter((attendee) => attendee.is_staff);
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
  const tabs = [TABS[0], { ...TABS[1], count: activities.length }];
  const tab = currentTab(firstSearchValue((await searchParams).tab), tabs);
  const base = `/meetings/${meeting.meeting_id}`;
  const inline = {
    action: updateMeetingFieldAction,
    idName: "meeting_id",
    id: meeting.meeting_id,
    readOnly: !canWrite,
  };

  const activity = (
    <RecordSection id="meeting-activity" title="Activity">
      {canWrite && (
        <LogActivityForm
          action={logActivityAction}
          links={{
            meeting_id: meeting.meeting_id,
            ...(meeting.company_id ? { company_id: meeting.company_id } : {}),
            ...(meeting.deal_id ? { deal_id: meeting.deal_id } : {}),
          }}
          returnPath={base}
        />
      )}
      <ActivityTimeline
        activities={activities}
        now={now}
        emptyLabel="Nothing recorded for this meeting yet."
      />
    </RecordSection>
  );

  return (
    <>
      <RecordHeader
        crumbs={[{ href: "/meetings", label: "Meetings" }]}
        title={meeting.title}
        favourite={{ href: base, label: meeting.title, kind: "Meeting" }}
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
          { label: "Guests", value: guests.length },
        ]}
      />
      {meeting.needs_outcome && (
        <Callout tone="attention" title="What happened?">
          Record the outcome in the panel. It writes the follow-up tasks, so nothing needs adding by
          hand.
        </Callout>
      )}
      {meeting.outcome_lapsed && (
        <Callout tone="neutral" compact>
          The seven-day window for this outcome has passed. It can still be recorded.
        </Callout>
      )}
      <RecordTabs base={base} tabs={tabs} current={tab} label="Meeting sections" />
      <RecordGrid
        side={
          <>
            {showOutcome && (
              <Card title={started ? "Outcome" : "Call it off"} titleAs="h3">
                <MeetingOutcomeForm
                  action={recordOutcomeAction}
                  meetingId={meeting.meeting_id}
                  hasHappened={started}
                />
              </Card>
            )}
            <Properties title="Details">
              <Property label="When">
                <LocalTime value={meeting.starts_at} />
              </Property>
              {meeting.ends_at && (
                <Property label="Ends">
                  <LocalTime value={meeting.ends_at} />
                </Property>
              )}
              <InlineField
                {...inline}
                name="kind"
                label="Kind"
                type="select"
                options={MEETING_KINDS.map((kind) => ({
                  value: kind,
                  label: MEETING_KIND_LABELS[kind] ?? kind,
                }))}
                value={meeting.kind}
              />
              <Property label="Status">
                <StatusPill
                  value={meeting.status}
                  label={MEETING_STATUS_LABELS[meeting.status] ?? meeting.status}
                  tone={meetingStatusTone(meeting.status)}
                />
              </Property>
              {meeting.outcome && (
                <Property label="Outcome">
                  {MEETING_OUTCOME_LABELS[meeting.outcome] ?? meeting.outcome}
                </Property>
              )}
              <Property label="Company">
                {meeting.company_id ? (
                  <Link href={`/companies/${meeting.company_id}`}>
                    {meeting.company_name || "Company"}
                  </Link>
                ) : (
                  "Not linked"
                )}
              </Property>
              <Property label="Deal">
                {meeting.deal_id ? (
                  <Link href={`/deals/${meeting.deal_id}`}>{meeting.deal_name || "Deal"}</Link>
                ) : (
                  "None"
                )}
              </Property>
              <InlineField
                {...inline}
                name="recording_url"
                label="Recording"
                type="url"
                value={meeting.recording_url}
                placeholder="https://…"
                display={
                  meeting.recording_url ? (
                    <a href={meeting.recording_url} rel="noreferrer noopener" target="_blank">
                      Open the recording
                    </a>
                  ) : (
                    "None"
                  )
                }
              />
              <Property label="Source">
                {meeting.source === "calendar" ? "Synced from the calendar" : "Recorded by hand"}
              </Property>
            </Properties>
            {!meeting.company_id && companies.length > 0 && (
              <Card
                title="Link a company"
                titleAs="h3"
                description="So the meeting shows on the firm's record and its deals."
              >
                <MeetingLinkForm
                  action={linkMeetingAction}
                  meetingId={meeting.meeting_id}
                  companies={companies}
                />
              </Card>
            )}
            <RecordSection id="meeting-guests" title="Guests">
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
            </RecordSection>
            {followUps.length > 0 && (
              <RecordSection id="meeting-follow-ups" title="Follow-ups">
                <ul className="side-list">
                  {followUps.map((task) => (
                    <li
                      key={task.task_id}
                      className={
                        task.status === "open" ? "follow-up" : "follow-up follow-up--closed"
                      }
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
              </RecordSection>
            )}
          </>
        }
      >
        {tab === "overview" && (
          <>
            {meeting.description && (
              <RecordSection id="meeting-booking" title="From the booking">
                <p className="prose-block">{meeting.description}</p>
              </RecordSection>
            )}
            {canWrite ? (
              <RecordSection id="meeting-prep" title="Prep">
                <PrepNotesForm
                  action={updatePrepAction}
                  meetingId={meeting.meeting_id}
                  prepNotes={meeting.prep_notes}
                  recordingUrl={meeting.recording_url}
                />
              </RecordSection>
            ) : (
              meeting.prep_notes && (
                <RecordSection id="meeting-prep" title="Prep">
                  <p className="prose-block">{meeting.prep_notes}</p>
                </RecordSection>
              )
            )}
            {recorded && meeting.outcome_notes && (
              <RecordSection id="meeting-outcome" title="What happened">
                <p className="prose-block">{meeting.outcome_notes}</p>
              </RecordSection>
            )}
            {activity}
          </>
        )}
        {tab === "activity" && activity}
      </RecordGrid>
    </>
  );
}
