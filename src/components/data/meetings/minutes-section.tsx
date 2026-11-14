import Link from "next/link";

import { CopyFields, type FileOption } from "@/components/data/meetings/copy-fields";
import { MailForm } from "@/components/mail/mail-form";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { RecordSection } from "@/components/ui/record-shell";
import { Timestamp } from "@/components/ui/timestamp";
import { MINUTES_STEPS, dayWords } from "@/lib/data/labels-registers";
import type { ActionState } from "@/lib/forms/action-state";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

/** What the section draws: the meeting's minutes and the timetable the service worked out. */
export type MinutesData = {
  meeting_id: string;
  chair: string;
  held: boolean;
  minutes: {
    text: string;
    draft_sent_on: string | null;
    comments_closed_on: string | null;
    comments: string;
    signed: { on: string; by_name: string; file_id: string | null } | null;
    later_notes: { note_id: string; text: string; at: string; by: { name: string } }[];
  };
  timetable: { step: "draft" | "comments" | "signed"; by: string; done_on: string | null }[];
  signed_file: { file_id: string; title: string } | null;
};

export type MinutesActions = {
  save: Action;
  draftSent: Action;
  closeComments: Action;
  sign: Action;
  attachSigned: Action;
  laterNote: Action;
};

export const SIGN_HINT =
  "Once signed, the minutes and the resolutions are locked. A correction goes in a note after signing.";
export const MINUTES_FOLDER = "02 Board and shareholder meetings";

const TIMETABLE_COLUMNS = [
  { key: "step", label: "Step", width: "44%" },
  { key: "by", label: "By" },
  { key: "done", label: "Done" },
];

/**
 * The minutes of one meeting (ws-notes/company/spec.md §7.7.3, item 5): the Secretarial
 * Standard 1 timetable, the minutes as written, and, until signed, the steps from writing
 * them to signing; once signed, the lock, the signed copy and the notes after signing,
 * which can be added and never changed.
 */
export function MinutesSection({
  data,
  actions,
  files,
  filesHere,
  today,
  now,
}: {
  data: MinutesData;
  actions: MinutesActions;
  files: readonly FileOption[];
  filesHere: boolean;
  today: string;
  now: number;
}) {
  const { minutes } = data;
  const signed = minutes.signed;
  const fields = { meeting_id: data.meeting_id };
  const editing = data.held && !signed;
  return (
    <RecordSection
      id="meeting-minutes"
      title="Minutes"
      actions={
        editing ? (
          <div className="hqdata-meeting__acts">
            <Popover label="Write the minutes" width="wide" align="end">
              <MailForm
                action={actions.save}
                fields={fields}
                submitLabel="Save the minutes"
                pendingLabel="Saving…"
              >
                <Field id="minutes-text" label="Minutes">
                  <Textarea
                    id="minutes-text"
                    name="text"
                    rows={10}
                    maxLength={20_000}
                    defaultValue={minutes.text}
                  />
                </Field>
              </MailForm>
            </Popover>
            {!minutes.draft_sent_on && (
              <Popover label="Mark the draft sent" align="end">
                <MailForm
                  action={actions.draftSent}
                  fields={fields}
                  submitLabel="Mark it sent"
                  pendingLabel="Saving…"
                >
                  <Field id="minutes-draft-on" label="On">
                    <Input
                      id="minutes-draft-on"
                      name="on"
                      type="date"
                      required
                      max={today}
                      defaultValue={today}
                    />
                  </Field>
                </MailForm>
              </Popover>
            )}
            {minutes.draft_sent_on && !minutes.comments_closed_on && (
              <Popover label="Close comments" width="wide" align="end">
                <MailForm
                  action={actions.closeComments}
                  fields={fields}
                  submitLabel="Close comments"
                  pendingLabel="Saving…"
                >
                  <Field id="minutes-comments-on" label="On">
                    <Input
                      id="minutes-comments-on"
                      name="on"
                      type="date"
                      required
                      max={today}
                      defaultValue={today}
                    />
                  </Field>
                  <Field id="minutes-comments" label="Comments received">
                    <Textarea id="minutes-comments" name="comments" rows={3} maxLength={4_000} />
                  </Field>
                </MailForm>
              </Popover>
            )}
            <Popover label="Mark the minutes signed" width="wide" align="end">
              <MailForm
                action={actions.sign}
                fields={fields}
                submitLabel="Mark them signed"
                pendingLabel="Signing…"
              >
                <Field id="minutes-signed-on" label="Signed on">
                  <Input
                    id="minutes-signed-on"
                    name="signed_on"
                    type="date"
                    required
                    max={today}
                    defaultValue={today}
                  />
                </Field>
                <Field id="minutes-signed-by" label="Signed by">
                  <Input
                    id="minutes-signed-by"
                    name="by_name"
                    maxLength={120}
                    defaultValue={data.chair}
                  />
                </Field>
                <CopyFields
                  prefix="minutes-signed"
                  label="Signed copy"
                  files={files}
                  filesHere={filesHere}
                  folder={MINUTES_FOLDER}
                />
                <p className="field__hint">{SIGN_HINT}</p>
              </MailForm>
            </Popover>
          </div>
        ) : undefined
      }
    >
      {!data.held ? (
        <p className="page-note">The minutes come once the meeting is held.</p>
      ) : (
        <>
          {signed && (
            <Callout tone="success" className="hqdata-minutes__lock">
              Signed on {dayWords(signed.on)} by {signed.by_name}. The minutes are locked.{" "}
              {data.signed_file ? (
                <Link className="text-link" href={`/data/files/${data.signed_file.file_id}`}>
                  {data.signed_file.title}
                </Link>
              ) : (
                <span className="hqdata-minutes__nocopy">No signed copy is attached yet.</span>
              )}
            </Callout>
          )}
          <DataTable caption="Minutes timetable" columns={TIMETABLE_COLUMNS} columnMenu={false}>
            {data.timetable.map((row) => {
              const late = !row.done_on && row.by < today;
              return (
                <tr key={row.step}>
                  <td>{MINUTES_STEPS[row.step]}</td>
                  <td className={`nowrap${late ? " hqdata-late" : ""}`}>{dayWords(row.by)}</td>
                  <td className="nowrap">
                    {row.done_on ? dayWords(row.done_on) : <span className="quiet">Not yet</span>}
                  </td>
                </tr>
              );
            })}
          </DataTable>
          {minutes.comments && (
            <p className="hqdata-minutes__comments">
              <span className="quiet">Comments received: </span>
              {minutes.comments}
            </p>
          )}
          {minutes.text ? (
            <div className="hqdata-minutes__text">{minutes.text}</div>
          ) : (
            <p className="page-note">No minutes written yet.</p>
          )}
          {signed && (
            <div className="hqdata-minutes__after">
              <div className="hqdata-minutes__after-head">
                <h3>Notes after signing</h3>
                <div className="hqdata-meeting__acts">
                  {!signed.file_id && (
                    <Popover label="Attach the signed copy" width="wide" align="end">
                      <MailForm
                        action={actions.attachSigned}
                        fields={fields}
                        submitLabel="Attach it"
                        pendingLabel="Attaching…"
                      >
                        <CopyFields
                          prefix="minutes-copy"
                          label="Signed copy"
                          files={files}
                          filesHere={filesHere}
                          folder={MINUTES_FOLDER}
                        />
                      </MailForm>
                    </Popover>
                  )}
                  <Popover label="Add a note after signing" width="wide" align="end">
                    <MailForm
                      action={actions.laterNote}
                      fields={fields}
                      submitLabel="Add the note"
                      pendingLabel="Adding…"
                    >
                      <Field
                        id="minutes-later-note"
                        label="Note"
                        hint="A note after signing is kept as it is: it cannot be changed or removed."
                      >
                        <Textarea
                          id="minutes-later-note"
                          name="text"
                          rows={4}
                          maxLength={2_000}
                          required
                        />
                      </Field>
                    </MailForm>
                  </Popover>
                </div>
              </div>
              {minutes.later_notes.length === 0 ? (
                <p className="page-note">No notes after signing.</p>
              ) : (
                <ol className="hqdata-minutes__notes">
                  {minutes.later_notes.map((note) => (
                    <li key={note.note_id}>
                      <p className="hqdata-minutes__note">{note.text}</p>
                      <p className="timeline__meta">
                        <span className="timeline__actor">{note.by.name}</span>{" "}
                        <Timestamp value={note.at} now={now} mode="absolute" />
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </>
      )}
    </RecordSection>
  );
}
