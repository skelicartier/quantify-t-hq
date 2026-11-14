import "server-only";

import { addNoteAction } from "@/app/(portal)/data/notes/actions";
import { readNotes } from "@/lib/data/api/notes";
import { dataRead } from "@/lib/data/read";

import { NotesSectionView } from "./notes-section-view";
import "./notes.css";

/**
 * The Notes section on an investor firm's page and a waitlist firm's page (raise spec
 * §3.3, §6.6.2): it reads its own data and draws the firm's notes and the composer. U1's
 * stand-in had this signature; this file replaces it.
 */
export type NotesSubject = { kind: "investor" | "waitlist"; id: string; name: string };

export type NotesSectionProps = {
  subject: NotesSubject;
  /** The request's time (`requestNow()`), for `<Timestamp>`. */
  now: number;
  /** This Mac's day, as the page's own read gave it. */
  today: string;
  /** The page a note's form returns to. */
  path: string;
};

export async function NotesSection({ subject, now, today, path }: NotesSectionProps) {
  void now;
  const read = await dataRead(() =>
    readNotes({ subject_kind: subject.kind, subject_id: subject.id }),
  );
  return (
    <NotesSectionView
      subject={subject}
      today={today}
      path={path}
      read={read}
      action={addNoteAction}
    />
  );
}
