import Link from "next/link";
import { notFound } from "next/navigation";

import { DataUnavailable } from "@/components/data/data-down";
import { OTHER_ROWS } from "@/components/data/meetings/form-values";
import { MinutesSection } from "@/components/data/meetings/minutes-section";
import { MailForm } from "@/components/mail/mail-form";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import {
  Properties,
  Property,
  RecordGrid,
  RecordHeader,
  RecordSection,
} from "@/components/ui/record-shell";
import { RowAction } from "@/components/ui/row-action";
import { StatusPill } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import {
  readMeeting,
  type KeyDateLink,
  type MeetingPage,
  type Resolution,
} from "@/lib/data/api/meetings";
import {
  ATTENDEE_ROLES,
  ATTENDING,
  MEETING_KINDS,
  MEETING_MODES,
  MEETING_STATES,
  MGT14_CHOICES,
  NOT_LEGAL_ADVICE,
  RESOLUTION_KINDS,
  RESOLUTION_OUTCOMES,
  dayWords,
  isGeneral,
} from "@/lib/data/labels-registers";
import { dataRead } from "@/lib/data/read";
import { formatNumber } from "@/lib/format";
import { requestNow } from "@/lib/request-time";

import {
  addResolutionAction,
  attachSignedAction,
  cancelMeetingAction,
  closeCommentsAction,
  draftSentAction,
  editResolutionAction,
  laterNoteAction,
  mgt14Action,
  noteCircularsAction,
  recordHeldAction,
  recordNoticeAction,
  saveMinutesAction,
  signMinutesAction,
} from "../actions";
import "../meetings.css";

export const metadata = { title: "Meeting" };
export const dynamic = "force-dynamic";

const BASE = "/data/company/meetings";
const MEETING_ID = /^[A-Za-z0-9-]{1,64}$/;

const KEY_DATE_STATES: Record<
  KeyDateLink["state"],
  { label: string; tone: "live" | "attention" | "neutral" }
> = {
  coming_up: { label: "Coming up", tone: "attention" },
  in_progress: { label: "In progress", tone: "attention" },
  done: { label: "Done", tone: "live" },
  not_for_us: { label: "Not for us", tone: "neutral" },
  taken_back: { label: "Taken back", tone: "neutral" },
};

const EVENT_WORDS: Record<string, string> = {
  planned: "Planned",
  recorded: "Recorded as held",
  changed: "Changed",
  notice: "Notice recorded",
  held: "Held",
  cancelled: "Cancelled",
  resolution: "Resolution added",
  "resolution changed": "Resolution changed",
  "mgt-14": "MGT-14 choice",
  minutes: "Minutes written",
  "draft sent": "Draft sent",
  "comments closed": "Comments closed",
  signed: "Signed",
  "signed copy": "Signed copy attached",
  "later note": "Note after signing",
  noted: "Noted at a board meeting",
  "circulars noted": "Circulars noted",
};

export default async function MeetingRecordPage({
  params,
}: {
  params: Promise<{ meetingId: string }>;
}) {
  const { meetingId } = await params;
  const { allowed } = await requireData(`${BASE}/${meetingId}`);
  if (!MEETING_ID.test(meetingId)) notFound();
  const now = requestNow();
  const read = allowed ? await dataRead(() => readMeeting(meetingId)) : null;
  if (!allowed || !read || !read.ok)
    return (
      <>
        <PageHeader title="Meeting" />
        <div className="page-content">
          {!allowed || !read ? (
            <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
          ) : (
            !read.ok && <DataUnavailable failure={read} />
          )}
        </div>
      </>
    );
  return <MeetingRecord page={read.data} now={now} />;
}

function MeetingRecord({ page, now }: { page: MeetingPage; now: number }) {
  const { meeting, today } = page;
  const signed = meeting.minutes.signed !== null;
  const circular = meeting.kind === "circular";
  const general = isGeneral(meeting.kind);
  const day = meeting.held_on ?? meeting.scheduled_on;
  const state = MEETING_STATES[meeting.state];
  const fields = { meeting_id: meeting.meeting_id };
  const quorumValue = page.quorum
    ? `${formatNumber(page.quorum.present)} of ${formatNumber(page.quorum.needed)} needed`
    : general && meeting.state === "held"
      ? meeting.quorum_present === null
        ? "Not recorded"
        : meeting.quorum_present
          ? "Present"
          : "Not present"
      : "—";
  const step = page.minutes_step;
  const minutesValue = !step
    ? "—"
    : step.step === "done"
      ? `Signed ${dayWords(step.by)}`
      : `${step.step === "draft" ? "Draft by" : step.step === "comments" ? "Comments close" : "Sign by"} ${dayWords(step.by)}`;
  return (
    <>
      <RecordHeader
        crumbs={[
          { href: "/data/company", label: "Company" },
          { href: BASE, label: "Meetings" },
        ]}
        title={page.serial_title}
        status={
          <>
            <StatusPill value={meeting.kind} label={MEETING_KINDS[meeting.kind]} tone="neutral" />
            <StatusPill value={meeting.state} label={state.label} tone={state.tone} />
            {signed && <StatusPill value="signed" label="Signed" tone="live" />}
          </>
        }
        readouts={[
          { label: "Day", value: dayWords(day) },
          { label: "Notice", value: page.notice_check ? page.notice_check.words : "—" },
          { label: "Quorum", value: quorumValue },
          { label: "Minutes", value: minutesValue },
        ]}
        actions={signed ? undefined : <HeaderActions page={page} fields={fields} />}
      />
      <RecordGrid side={<Side page={page} />}>
        <p className="page-note">{NOT_LEGAL_ADVICE}</p>
        {page.warnings.map((warning) => (
          <Callout key={warning} tone="attention" compact>
            {warning}
          </Callout>
        ))}
        {meeting.state === "cancelled" && meeting.cancelled && (
          <Callout tone="neutral" compact>
            Cancelled on {dayWords(meeting.cancelled.on)}
            {meeting.cancelled.why ? `: ${meeting.cancelled.why}` : "."}
          </Callout>
        )}

        {!circular && (
          <RecordSection id="meeting-notice" title="Notice">
            <p className={page.notice_check?.short ? "hqdata-short" : undefined}>
              {page.notice_check?.sentence ?? "No notice recorded."}
            </p>
          </RecordSection>
        )}

        {!circular && (
          <RecordSection id="meeting-attendees" title="Who was there">
            {meeting.state !== "held" ? (
              <p className="page-note">Who was there is recorded once the meeting is held.</p>
            ) : (
              <>
                <DataTable
                  caption="Who was there"
                  columns={[
                    { key: "name", label: "Name", width: "34%" },
                    { key: "role", label: "Role" },
                    { key: "how", label: "How" },
                    { key: "counts", label: "Counts for the quorum" },
                  ]}
                  columnMenu={false}
                  isEmpty={meeting.attendees.length === 0}
                  empty={<p className="page-note">Nobody was recorded as there.</p>}
                >
                  {meeting.attendees.map((person) => (
                    <tr key={person.attendee_id}>
                      <td>{person.name}</td>
                      <td>{ATTENDEE_ROLES[person.role]}</td>
                      <td>{ATTENDING[person.how]}</td>
                      <td>
                        {meeting.kind === "board"
                          ? person.role === "director"
                            ? "Yes"
                            : "No"
                          : "The Articles decide"}
                      </td>
                    </tr>
                  ))}
                </DataTable>
                <p className="hqdata-meeting__quorum">
                  {page.quorum_sentence ||
                    (general
                      ? meeting.quorum_present === null
                        ? "Quorum: not recorded."
                        : meeting.quorum_present
                          ? "Quorum was present."
                          : "Quorum was not present."
                      : "")}
                  {meeting.chair ? ` Chair: ${meeting.chair}.` : ""}
                </p>
              </>
            )}
          </RecordSection>
        )}

        <Resolutions page={page} fields={fields} />

        {!circular && (
          <MinutesSection
            data={{
              meeting_id: meeting.meeting_id,
              chair: meeting.chair,
              held: meeting.state === "held",
              minutes: meeting.minutes,
              timetable: page.timetable,
              signed_file: page.signed_file,
            }}
            actions={{
              save: saveMinutesAction,
              draftSent: draftSentAction,
              closeComments: closeCommentsAction,
              sign: signMinutesAction,
              attachSigned: attachSignedAction,
              laterNote: laterNoteAction,
            }}
            files={page.files}
            filesHere={page.files_here}
            today={today}
            now={now}
          />
        )}

        {page.circulars_to_note.length > 0 && !signed && (
          <RecordSection id="meeting-circulars" title="Resolutions by circulation to note">
            <MailForm
              action={noteCircularsAction}
              fields={fields}
              submitLabel="Note them at this meeting"
              pendingLabel="Noting…"
            >
              {page.circulars_to_note.map((view) => (
                <Checkbox
                  key={view.resolution_id}
                  id={`circular-${view.resolution_id}`}
                  name="resolution_id"
                  value={view.resolution_id}
                  label={view.title}
                  description={view.meeting_title}
                />
              ))}
            </MailForm>
          </RecordSection>
        )}

        <RecordSection id="meeting-activity" title="Activity">
          {page.events.length === 0 ? (
            <p className="timeline-empty">Nothing has happened yet.</p>
          ) : (
            <ol className="timeline">
              {page.events.map((event) => (
                <li key={event.event_id} className="timeline__item">
                  <span className="timeline__kind">{EVENT_WORDS[event.verb] ?? event.verb}</span>
                  <div>
                    <p className="timeline__meta">
                      <span className="timeline__actor">{event.by.name}</span>
                      <Timestamp value={event.at} now={now} mode="relative" />
                    </p>
                    {event.detail && <p className="timeline__body">{event.detail}</p>}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </RecordSection>
      </RecordGrid>
    </>
  );
}

function HeaderActions({ page, fields }: { page: MeetingPage; fields: Record<string, string> }) {
  const { meeting, today } = page;
  const circular = meeting.kind === "circular";
  const general = isGeneral(meeting.kind);
  const planned = meeting.state === "planned";
  const day = meeting.held_on ?? meeting.scheduled_on;
  return (
    <>
      {!circular && meeting.state !== "cancelled" && (
        <Popover label="Record the notice" align="start">
          <MailForm
            action={recordNoticeAction}
            fields={fields}
            submitLabel="Record it"
            pendingLabel="Saving…"
          >
            <Field id="notice-sent" label="Sent on">
              <Input
                id="notice-sent"
                name="sent_on"
                type="date"
                required
                max={today}
                defaultValue={meeting.notice.sent_on ?? ""}
              />
            </Field>
            <Field
              id="notice-why"
              label="Why it was shorter"
              hint={
                page.notice_check?.short
                  ? "The notice was short of the rule: say why."
                  : "Only when the notice is shorter than the rule."
              }
            >
              <Input
                id="notice-why"
                name="shorter_reason"
                maxLength={300}
                defaultValue={meeting.notice.shorter_reason}
              />
            </Field>
          </MailForm>
        </Popover>
      )}
      {!circular && meeting.state !== "cancelled" && (
        <Popover
          label="Record how it went"
          variant={planned ? "primary" : "default"}
          align="start"
          width="wide"
        >
          <MailForm
            action={recordHeldAction}
            fields={{ ...fields, general: general ? "1" : "0" }}
            submitLabel="Record it"
            pendingLabel="Saving…"
            className="stack-form stack-form--tight hqdata-meeting-form"
          >
            <div className="hqdata-meeting-form__pair">
              <Field id="held-on" label="Held on">
                <Input
                  id="held-on"
                  name="held_on"
                  type="date"
                  required
                  max={today}
                  defaultValue={day <= today ? day : today}
                />
              </Field>
              <Field id="held-chair" label="Chair">
                <Input id="held-chair" name="chair" maxLength={120} defaultValue={meeting.chair} />
              </Field>
            </div>
            {page.directors && page.directors.length > 0 && (
              <fieldset className="hqdata-attendees">
                <legend>Directors in office that day</legend>
                {page.directors.map((director) => (
                  <div key={director.director_id} className="hqdata-attendees__row">
                    <Checkbox
                      id={`held-director-${director.director_id}`}
                      name="director"
                      value={`${director.director_id}|${director.name}`}
                      label={director.name}
                      defaultChecked={meeting.attendees.some(
                        (person) => person.director_id === director.director_id,
                      )}
                    />
                    <Select
                      id={`held-how-${director.director_id}`}
                      name={`how_${director.director_id}`}
                      aria-label={`How ${director.name} attended`}
                      defaultValue="in_person"
                    >
                      {Object.entries(ATTENDING).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </Select>
                  </div>
                ))}
              </fieldset>
            )}
            <fieldset className="hqdata-attendees">
              <legend>
                {page.directors && page.directors.length > 0 ? "Add someone else" : "Who was there"}
              </legend>
              {Array.from({ length: OTHER_ROWS }, (_, index) => (
                <div key={index} className="hqdata-attendees__other">
                  <Field id={`held-other-${index}-name`} label="Name">
                    <Input
                      id={`held-other-${index}-name`}
                      name={`other_name_${index}`}
                      maxLength={200}
                    />
                  </Field>
                  <Field id={`held-other-${index}-role`} label="Role">
                    <Select
                      id={`held-other-${index}-role`}
                      name={`other_role_${index}`}
                      defaultValue={
                        page.directors && page.directors.length > 0
                          ? "invitee"
                          : general
                            ? "member"
                            : "director"
                      }
                    >
                      {Object.entries(ATTENDEE_ROLES).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field id={`held-other-${index}-how`} label="How">
                    <Select
                      id={`held-other-${index}-how`}
                      name={`other_how_${index}`}
                      defaultValue="in_person"
                    >
                      {Object.entries(ATTENDING).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
              ))}
            </fieldset>
            {general && (
              <Checkbox
                id="held-quorum"
                name="quorum_present"
                label="Quorum was present"
                description="For a general meeting the Articles decide the quorum; record whether it was there."
                defaultChecked={meeting.quorum_present === true}
              />
            )}
          </MailForm>
        </Popover>
      )}
      {meeting.state === "held" && (
        <Popover label="Add a resolution" align="start" width="wide">
          <MailForm
            action={addResolutionAction}
            fields={fields}
            submitLabel="Add the resolution"
            pendingLabel="Adding…"
          >
            <ResolutionFields prefix="resolution-new" kind={meeting.kind} values={null} />
          </MailForm>
        </Popover>
      )}
      {planned && (
        <Popover label="Cancel it" align="start">
          <MailForm
            action={cancelMeetingAction}
            fields={fields}
            submitLabel="Cancel the meeting"
            pendingLabel="Cancelling…"
            variant="danger"
          >
            <Field id="cancel-on" label="On">
              <Input id="cancel-on" name="on" type="date" max={today} defaultValue={today} />
            </Field>
            <Field id="cancel-why" label="Why">
              <Input id="cancel-why" name="why" maxLength={300} />
            </Field>
          </MailForm>
        </Popover>
      )}
    </>
  );
}

/** The fields of a resolution: title, text, kind, outcome, the 179(3) box and the MGT-14 box. */
function ResolutionFields({
  prefix,
  kind,
  values,
}: {
  prefix: string;
  kind: MeetingPage["meeting"]["kind"];
  values: Resolution | null;
}) {
  const id = (name: string) => `${prefix}-${name}`;
  const general = isGeneral(kind);
  return (
    <>
      <Field id={id("title")} label="Title">
        <Input
          id={id("title")}
          name="title"
          required
          maxLength={200}
          defaultValue={values?.title ?? ""}
        />
      </Field>
      <Field id={id("text")} label="Text">
        <Textarea
          id={id("text")}
          name="text"
          rows={4}
          maxLength={8_000}
          defaultValue={values?.text ?? ""}
        />
      </Field>
      <div className="hqdata-meeting-form__pair">
        {general ? (
          <Field id={id("kind")} label="Kind">
            <Select id={id("kind")} name="kind" defaultValue={values?.kind ?? "ordinary"}>
              <option value="ordinary">{RESOLUTION_KINDS.ordinary}</option>
              <option value="special">{RESOLUTION_KINDS.special}</option>
            </Select>
          </Field>
        ) : (
          <input type="hidden" name="kind" value="board" />
        )}
        <Field id={id("outcome")} label="Outcome">
          <Select id={id("outcome")} name="outcome" defaultValue={values?.outcome ?? "passed"}>
            {Object.entries(RESOLUTION_OUTCOMES).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {!general && (
        <Checkbox
          id={id("s179")}
          name="s179_3"
          label="A matter under section 179(3), such as issuing shares or borrowing"
          defaultChecked={values?.s179_3 ?? false}
        />
      )}
      <Checkbox
        id={id("add-date")}
        name="add_date"
        label="Add the MGT-14 filing to Key dates (30 days)"
        description="Only when MGT-14 is needed. Special resolutions are filed within 30 days. For board resolutions, ask your CS."
        defaultChecked
      />
    </>
  );
}

function Mgt14Cell({
  page,
  resolution,
  fields,
}: {
  page: MeetingPage;
  resolution: Resolution;
  fields: Record<string, string>;
}) {
  const choice = MGT14_CHOICES[resolution.mgt14];
  if (resolution.outcome !== "passed" || resolution.mgt14 !== "needed") return <>{choice}</>;
  const by = page.mgt14_by[resolution.resolution_id];
  if (page.key_dates === null)
    return (
      <>
        {choice}
        <span className="table-sub">MGT-14 by {by ? dayWords(by) : "—"}</span>
        <span className="table-sub">{page.key_dates_note}</span>
      </>
    );
  const links = page.key_dates[resolution.resolution_id] ?? [];
  const link =
    links.find((item) => item.state === "coming_up" || item.state === "in_progress") ??
    links.at(-1);
  if (!link || link.state === "taken_back")
    return (
      <>
        {choice}
        <RowAction
          action={mgt14Action}
          fields={{
            ...fields,
            resolution_id: resolution.resolution_id,
            mgt14: "needed",
            add_date: "on",
          }}
          buttons={[
            {
              label: "Add the MGT-14 filing to Key dates",
              className: "btn btn--small",
              pendingLabel: "Adding…",
            },
          ]}
        />
      </>
    );
  const shown = KEY_DATE_STATES[link.state];
  return (
    <>
      {choice}
      <span className="table-sub">
        <Link className="text-link" href={link.href}>
          By {dayWords(link.due_on)}
        </Link>{" "}
        <StatusPill value={link.state} label={shown.label} tone={shown.tone} />
      </span>
    </>
  );
}

function Resolutions({ page, fields }: { page: MeetingPage; fields: Record<string, string> }) {
  const { meeting } = page;
  const signed = meeting.minutes.signed !== null;
  return (
    <RecordSection id="meeting-resolutions" title="Resolutions">
      <DataTable
        caption="Resolutions"
        columns={[
          { key: "number", label: "No.", align: "end" },
          { key: "resolution", label: "Resolution", width: "34%" },
          { key: "kind", label: "Kind" },
          { key: "outcome", label: "Outcome" },
          { key: "mgt14", label: "MGT-14" },
          { key: "change", label: "Change", align: "end" },
        ]}
        columnMenu={false}
        isEmpty={meeting.resolutions.length === 0}
        empty={<p className="page-note">No resolutions recorded.</p>}
      >
        {meeting.resolutions.map((resolution) => {
          const rowFields = { ...fields, resolution_id: resolution.resolution_id };
          const short = resolution.resolution_id.slice(0, 8);
          const noted = page.noted_at[resolution.resolution_id];
          return (
            <tr key={resolution.resolution_id} id={`resolution-${resolution.resolution_id}`}>
              <td className="data-table__num">{formatNumber(resolution.number)}</td>
              <td>
                <span className="table-title">{resolution.title}</span>
                {resolution.text && (
                  <span className="table-sub table-sub--prose" title={resolution.text}>
                    {resolution.text}
                  </span>
                )}
                {resolution.s179_3 && (
                  <span className="table-sub">A matter under section 179(3)</span>
                )}
                {noted && <span className="table-sub">Noted at {noted}</span>}
              </td>
              <td>{RESOLUTION_KINDS[resolution.kind]}</td>
              <td>{RESOLUTION_OUTCOMES[resolution.outcome]}</td>
              <td>
                <Mgt14Cell page={page} resolution={resolution} fields={fields} />
              </td>
              <td>
                <div className="hqdata-meeting__acts hqdata-meeting__acts--row">
                  {!signed && (
                    <Popover label="Edit" align="end" width="wide">
                      <MailForm
                        action={editResolutionAction}
                        fields={rowFields}
                        submitLabel="Save"
                        pendingLabel="Saving…"
                      >
                        <ResolutionFields
                          prefix={`resolution-${short}`}
                          kind={meeting.kind}
                          values={resolution}
                        />
                      </MailForm>
                    </Popover>
                  )}
                  <Popover label="MGT-14" align="end" width="wide">
                    <MailForm
                      action={mgt14Action}
                      fields={rowFields}
                      submitLabel="Save"
                      pendingLabel="Saving…"
                    >
                      <fieldset className="hqdata-radios">
                        <legend>MGT-14</legend>
                        {Object.entries(MGT14_CHOICES).map(([key, label]) => (
                          <label key={key} className="hqdata-radios__item">
                            <input
                              type="radio"
                              name="mgt14"
                              value={key}
                              defaultChecked={resolution.mgt14 === key}
                            />{" "}
                            {label}
                          </label>
                        ))}
                      </fieldset>
                      <Checkbox
                        id={`mgt14-${short}-add`}
                        name="add_date"
                        label="Add the MGT-14 filing to Key dates (30 days)"
                        defaultChecked
                      />
                      <p className="field__hint">
                        Special resolutions are filed within 30 days. For board resolutions, ask
                        your CS.
                      </p>
                    </MailForm>
                  </Popover>
                </div>
              </td>
            </tr>
          );
        })}
      </DataTable>
    </RecordSection>
  );
}

function Side({ page }: { page: MeetingPage }) {
  const { meeting } = page;
  const day = meeting.held_on ?? meeting.scheduled_on;
  return (
    <Properties title="Details">
      <Property label="Kind">{MEETING_KINDS[meeting.kind]}</Property>
      <Property label="Day">{dayWords(day)}</Property>
      <Property label="Time">{meeting.time || <span className="quiet">Not given</span>}</Property>
      <Property label="Place">{meeting.place || <span className="quiet">Not given</span>}</Property>
      <Property label="How">{MEETING_MODES[meeting.mode]}</Property>
      <Property label="Chair">
        {meeting.chair || <span className="quiet">Not recorded</span>}
      </Property>
      {page.board_size !== null && meeting.kind === "board" && (
        <Property label="Board">{formatNumber(page.board_size)} directors</Property>
      )}
      <Property label="Agenda">
        {meeting.agenda ? (
          <span className="hqdata-meeting__agenda">{meeting.agenda}</span>
        ) : (
          <span className="quiet">None written</span>
        )}
      </Property>
    </Properties>
  );
}
