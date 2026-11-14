import Link from "next/link";

import { DataUnavailable } from "@/components/data/data-down";
import { MailForm } from "@/components/mail/mail-form";
import { Popover } from "@/components/ui/popover";
import { RecordSection } from "@/components/ui/record-shell";
import { StatusPill } from "@/components/ui/status-pill";
import type { NotesPage } from "@/lib/data/api/notes";
import { NOTE_KINDS } from "@/lib/data/labels";
import type { DataRead } from "@/lib/data/read";
import type { ActionState } from "@/lib/forms/action-state";
import { formatDate } from "@/lib/format";

import { NoteFields, counted } from "./note-fields";

/**
 * The Notes section a firm's page draws (raise spec §6.6.2), from what was read: the
 * firm's newest notes, the way to all of them, and the composer. A failed read draws the
 * Data state, never an empty list. Kept apart from `notes-section.tsx` (which reads) so it
 * can be drawn from fixed data.
 */

export type NotesSubjectView = { kind: "investor" | "waitlist"; id: string; name: string };

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

/** The section lists this many; the rest are a link away. */
export const SECTION_ROWS = 20;

export const NO_NOTES =
  "No notes on this firm yet. After a call or a meeting, write what was said, what they objected to and what you owe them.";

export function NotesSectionView({
  subject,
  today,
  path,
  read,
  action,
}: {
  subject: NotesSubjectView;
  today: string;
  path: string;
  read: DataRead<NotesPage>;
  action: Action;
}) {
  const id = `${subject.kind}-notes`;
  const all = `/data/notes?subject_kind=${subject.kind}&subject_id=${encodeURIComponent(subject.id)}`;
  return (
    <RecordSection
      id={id}
      title="Notes"
      actions={
        read.ok ? (
          <Popover label="Add a note" variant="primary" width="wide" align="end">
            <MailForm
              action={action}
              fields={{
                subject_kind: subject.kind,
                subject_id: subject.id,
                subject_name: subject.name,
                path,
              }}
              submitLabel="Add the note"
              pendingLabel="Adding…"
              className="stack-form stack-form--tight hqdata-note-form"
            >
              <NoteFields
                prefix={`${id}-new`}
                values={{
                  kind: "call",
                  held_on: today,
                  title: "",
                  body: "",
                  people: "",
                  objections: "",
                }}
                today={today}
                withActions
              />
            </MailForm>
          </Popover>
        ) : undefined
      }
    >
      <p className="page-note">Notes written before this section are in Activity below.</p>
      {!read.ok ? (
        <DataUnavailable failure={read} />
      ) : read.data.notes.length === 0 ? (
        <p className="page-note hqdata-notes-section__empty">{NO_NOTES}</p>
      ) : (
        <>
          <ul className="hqdata-notes-list" aria-label={`Notes on ${subject.name}`}>
            {read.data.notes.slice(0, SECTION_ROWS).map((note) => {
              const overdue = note.actions.some(
                (item) => item.state === "open" && item.due_on !== null && item.due_on < today,
              );
              const owed = counted(note.open_actions, "open action");
              return (
                <li key={note.note_id} className="hqdata-notes-list__row">
                  <span className="hqdata-notes-list__day">{formatDate(note.held_on)}</span>
                  <span className="hqdata-notes-list__kind">
                    <StatusPill value={note.kind} label={NOTE_KINDS[note.kind]} tone="neutral" />
                  </span>
                  <Link
                    className="table-title hqdata-notes-list__title"
                    href={`/data/notes/${note.note_id}`}
                  >
                    {note.title}
                  </Link>
                  <span className="hqdata-notes-list__counts">
                    <span>{counted(note.objections.length, "objection")}</span>
                    {overdue ? (
                      <StatusPill value="overdue" label={owed} tone="attention" />
                    ) : (
                      <span>{owed}</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="hqdata-notes-section__all">
            <Link className="text-link" href={all}>
              All {counted(read.data.total, "note")}
            </Link>
          </p>
        </>
      )}
    </RecordSection>
  );
}
