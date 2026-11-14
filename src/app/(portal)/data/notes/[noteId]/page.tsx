import Link from "next/link";
import { notFound } from "next/navigation";

import { DataUnavailable } from "@/components/data/data-down";
import { DecisionFields } from "@/components/data/decisions/decision-fields";
import { ActionsTable } from "@/components/data/notes/actions-table";
import { FaqFields, NoteFields, counted } from "@/components/data/notes/note-fields";
import { MailForm } from "@/components/mail/mail-form";
import { PageHeader } from "@/components/shell/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Field, Input, Select } from "@/components/ui/field";
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
  readDecisions,
  readFaq,
  readNote,
  type FaqRow,
  type NoteDetail,
  type NotesEvent,
} from "@/lib/data/api/notes";
import { NOTE_KINDS, NOTE_SUBJECTS } from "@/lib/data/labels";
import { dataRead } from "@/lib/data/read";
import { formatDate, formatNumber } from "@/lib/format";
import { requestNow } from "@/lib/request-time";

import "@/components/data/notes/notes.css";
import {
  actionStateAction,
  addActionAction,
  answerObjectionAction,
  moveActionAction,
  recordDecisionAction,
  updateNoteAction,
  withdrawNoteAction,
} from "../actions";

export const metadata = { title: "Note" };
export const dynamic = "force-dynamic";

const NOTE_ID = /^[A-Za-z0-9-]{1,64}$/;
const TAKE_BACK = "Take this note back? It stays, muted, and leaves Due and search.";

type Option = { decision_id: string; title: string };

export default async function NotePage({ params }: { params: Promise<{ noteId: string }> }) {
  const { noteId } = await params;
  const { allowed, context } = await requireData(`/data/notes/${noteId}`);
  if (!NOTE_ID.test(noteId)) notFound();
  const now = requestNow();
  const me = context.me.staff.display_name || context.me.staff.email;
  const read = allowed
    ? await dataRead(async () => {
        const [detail, faq, decided] = await Promise.all([
          readNote(noteId),
          readFaq(),
          readDecisions({ status: "decided" }),
        ]);
        return { detail, faq: faq.entries, decided: decided.decisions };
      })
    : null;
  if (!allowed || !read || !read.ok)
    return (
      <>
        <PageHeader title="Note" />
        <div className="page-content">
          {!allowed || !read ? (
            <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
          ) : (
            !read.ok && <DataUnavailable failure={read} />
          )}
        </div>
      </>
    );
  return (
    <NoteRecord
      detail={read.data.detail}
      faq={read.data.faq}
      decided={read.data.decided.map((item) => ({
        decision_id: item.decision_id,
        title: item.title,
      }))}
      me={me}
      now={now}
    />
  );
}

/** The fields an edit changed, in the page's own words. */
const FIELD_WORDS: Record<string, string> = {
  kind: "kind",
  held_on: "held on",
  title: "title",
  body: "what was said",
  people: "who was there",
  objections: "objections",
};

const EVENT_WORDS: Record<string, string> = {
  added: "Written",
  changed: "Changed",
  withdrawn: "Taken back",
  restored: "Restored",
  "action added": "Action added",
  "action done": "Action done",
  "action reopened": "Open again",
  "action moved": "Action moved",
  answered: "Answered from the FAQ",
  unlinked: "Unlinked from the FAQ",
  "decision recorded": "Recorded as decision",
};

function eventLine(event: NotesEvent): string {
  if (event.verb === "changed")
    return event.detail
      .split(", ")
      .map((key) => FIELD_WORDS[key] ?? key)
      .join(", ");
  // "Send the pilot summary: 2026-11-20" reads with the day as the pages print it.
  return event.detail.replace(/(\d{4}-\d{2}-\d{2})$/, (day) => formatDate(day));
}

function NoteRecord({
  detail,
  faq,
  decided,
  me,
  now,
}: {
  detail: NoteDetail;
  faq: readonly FaqRow[];
  decided: readonly Option[];
  me: string;
  now: number;
}) {
  const { note, today } = detail;
  const path = detail.firm_href;
  const base = { note_id: note.note_id, path };
  const open = note.actions.filter((action) => action.state === "open").length;
  const rows = [...note.actions]
    .sort((a, b) =>
      a.state !== b.state
        ? a.state === "open"
          ? -1
          : 1
        : (a.due_on ?? "9999").localeCompare(b.due_on ?? "9999"),
    )
    .map((action) => ({ ...action, note_id: note.note_id }));
  return (
    <>
      <RecordHeader
        crumbs={[{ href: "/data/notes", label: "Notes" }]}
        title={note.title}
        status={
          <>
            <StatusPill value={note.kind} label={NOTE_KINDS[note.kind]} tone="neutral" />
            {note.withdrawn && <StatusPill value="withdrawn" label="Taken back" tone="neutral" />}
          </>
        }
        readouts={[
          {
            label: "Firm",
            value: (
              <Link className="text-link" href={detail.firm_href}>
                {note.subject_name}
              </Link>
            ),
          },
          { label: "Held on", value: formatDate(note.held_on) },
          { label: "Open actions", value: formatNumber(open) },
        ]}
        actions={
          <>
            <Popover label="Edit" width="wide" align="start">
              <MailForm
                action={updateNoteAction}
                fields={base}
                submitLabel="Save"
                pendingLabel="Saving…"
                className="stack-form stack-form--tight hqdata-note-form"
              >
                <NoteFields
                  prefix="note-edit"
                  values={{
                    ...note,
                    objections: note.objections.map((item) => item.text).join("\n"),
                  }}
                  today={today}
                />
              </MailForm>
            </Popover>
            {detail.decision ? (
              <ButtonLink
                href={`/data/decisions#decision-${detail.decision.decision_id}`}
                size="small"
              >
                See the decision
              </ButtonLink>
            ) : (
              <Popover label="Record as decision" width="wide" align="start">
                <MailForm
                  action={recordDecisionAction}
                  fields={base}
                  submitLabel="Record the decision"
                  pendingLabel="Recording…"
                >
                  <DecisionFields
                    prefix="note-decision"
                    values={{
                      title: note.title,
                      why: note.body.slice(0, 600),
                      decided_by: me,
                      decided_on: note.held_on,
                      status: "decided",
                    }}
                    replaces={decided}
                  />
                </MailForm>
              </Popover>
            )}
            {note.withdrawn ? (
              <RowAction
                action={withdrawNoteAction}
                fields={{ ...base, to: "restore" }}
                buttons={[
                  { label: "Restore", className: "btn btn--small", pendingLabel: "Restoring…" },
                ]}
              />
            ) : (
              <Popover label="Take back" align="start">
                <p className="page-note">{TAKE_BACK}</p>
                <RowAction
                  action={withdrawNoteAction}
                  fields={{ ...base, to: "withdraw" }}
                  buttons={[
                    {
                      label: "Take it back",
                      className: "btn btn--small btn--danger",
                      pendingLabel: "Taking it back…",
                    },
                  ]}
                />
              </Popover>
            )}
          </>
        }
      />
      <RecordGrid side={<Side detail={detail} now={now} />}>
        <RecordSection id="note-body" title="What was said">
          {note.body ? (
            <p className="hqdata-note-body">{note.body}</p>
          ) : (
            <p className="page-note">Nothing was written down.</p>
          )}
        </RecordSection>

        <RecordSection id="note-objections" title="Objections">
          {note.objections.length === 0 ? (
            <p className="page-note">No objections were written down.</p>
          ) : (
            <ul className="hqdata-objections">
              {note.objections.map((objection) => {
                const entry = objection.faq_id
                  ? (detail.faq.find((item) => item.faq_id === objection.faq_id) ?? null)
                  : null;
                const fields = { ...base, objection_id: objection.objection_id };
                const short = objection.objection_id.slice(0, 8);
                const live = faq.filter((item) => item.archived === null);
                return (
                  <li key={objection.objection_id} className="hqdata-objection">
                    <div className="hqdata-objection__head">
                      <p className="hqdata-objection__text">{objection.text}</p>
                      {entry ? (
                        <RowAction
                          action={answerObjectionAction}
                          fields={{ ...fields, mode: "unlink" }}
                          buttons={[
                            {
                              label: "Unlink",
                              className: "btn btn--small btn--ghost",
                              ariaLabel: `Unlink: ${objection.text}`,
                              pendingLabel: "Unlinking…",
                            },
                          ]}
                        />
                      ) : (
                        <Popover label="Answer from the FAQ" width="wide" align="end">
                          <div className="hqdata-objection__forms">
                            {live.length > 0 && (
                              <section>
                                <h3>An answer you have</h3>
                                <MailForm
                                  action={answerObjectionAction}
                                  fields={{ ...fields, mode: "link" }}
                                  submitLabel="Use this answer"
                                  pendingLabel="Saving…"
                                >
                                  <Field id={`faq-pick-${short}`} label="Question">
                                    <Select
                                      id={`faq-pick-${short}`}
                                      name="faq_id"
                                      required
                                      defaultValue=""
                                    >
                                      <option value="" disabled>
                                        Choose a question
                                      </option>
                                      {live.map((item) => (
                                        <option key={item.faq_id} value={item.faq_id}>
                                          {item.question}
                                        </option>
                                      ))}
                                    </Select>
                                  </Field>
                                </MailForm>
                              </section>
                            )}
                            <section>
                              <h3>Add to the FAQ</h3>
                              <MailForm
                                action={answerObjectionAction}
                                fields={{ ...fields, mode: "new" }}
                                submitLabel="Add to the FAQ"
                                pendingLabel="Adding…"
                              >
                                <FaqFields prefix={`faq-new-${short}`} question={objection.text} />
                              </MailForm>
                            </section>
                          </div>
                        </Popover>
                      )}
                    </div>
                    {entry && (
                      <div className="hqdata-objection__answer">
                        <Link
                          className="text-link"
                          href={`/data/notes?view=faq#faq-${entry.faq_id}`}
                        >
                          {entry.question}
                        </Link>
                        {"\n"}
                        {entry.answer || "No answer written yet."}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </RecordSection>

        <RecordSection
          id="note-actions"
          title="Actions"
          actions={
            <Popover label="Add an action" width="wide" align="end">
              <MailForm
                action={addActionAction}
                fields={base}
                submitLabel="Add the action"
                pendingLabel="Adding…"
              >
                <Field id="action-new-title" label="Action">
                  <Input id="action-new-title" name="title" maxLength={200} required />
                </Field>
                <div className="hqdata-note-form__pair">
                  <Field id="action-new-due" label="By">
                    <Input id="action-new-due" name="due_on" type="date" min={today} />
                  </Field>
                  <Field id="action-new-who" label="Who">
                    <Input id="action-new-who" name="owner" maxLength={120} />
                  </Field>
                </div>
                <p className="field__hint">Each action with a day joins Due on that day.</p>
              </MailForm>
            </Popover>
          }
        >
          {rows.length === 0 ? (
            <p className="page-note">No actions on this note.</p>
          ) : (
            <ActionsTable
              caption="Actions from this note"
              rows={rows}
              today={today}
              now={now}
              path={path}
              setState={actionStateAction}
              move={moveActionAction}
              showFrom={false}
            />
          )}
        </RecordSection>

        <RecordSection id="note-activity" title="Activity">
          {detail.events.length === 0 ? (
            <p className="timeline-empty">Nothing has happened yet.</p>
          ) : (
            <ol className="timeline">
              {detail.events.map((event) => (
                <li key={event.event_id} className="timeline__item">
                  <span className="timeline__kind">{EVENT_WORDS[event.verb] ?? event.verb}</span>
                  <div>
                    <p className="timeline__meta">
                      <span className="timeline__actor">{event.by.name}</span>
                      <Timestamp value={event.at} now={now} mode="relative" />
                    </p>
                    {event.detail && <p className="timeline__body">{eventLine(event)}</p>}
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

function Side({ detail, now }: { detail: NoteDetail; now: number }) {
  const { note, decision } = detail;
  return (
    <>
      <Properties title="Details">
        <Property label="Kind">{NOTE_KINDS[note.kind]}</Property>
        <Property label="Held on">{formatDate(note.held_on)}</Property>
        <Property label="Firm">
          <Link className="text-link" href={detail.firm_href}>
            {note.subject_name}
          </Link>{" "}
          <span className="quiet">· {NOTE_SUBJECTS[note.subject.kind]}</span>
        </Property>
        <Property label="Who was there">
          {note.people || <span className="quiet">Not given</span>}
        </Property>
        <Property label="Written by">
          {note.created_by.name}, <Timestamp value={note.created_at} now={now} mode="relative" />
        </Property>
        <Property label="Changed">
          <Timestamp value={note.updated_at} now={now} mode="relative" /> by {note.updated_by.name}
        </Property>
        <Property label="Decision">
          {decision ? (
            <Link className="text-link" href={`/data/decisions#decision-${decision.decision_id}`}>
              {decision.title}
            </Link>
          ) : (
            <span className="quiet">None</span>
          )}
        </Property>
      </Properties>
      <p className="side-quiet">
        {counted(note.objections.length, "objection")} · {counted(note.actions.length, "action")} on
        this note.
      </p>
    </>
  );
}
